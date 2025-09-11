import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

/* ---------- 템플릿 로드 ---------- */
function readTxt(name) {
  const p = path.resolve(process.cwd(), 'public', name);
  if (!fs.existsSync(p)) {
    console.error(`[storyboard-init] 템플릿 누락: ${name}`);
    return null;
  }
  const txt = fs.readFileSync(p, 'utf-8');
  console.log(`[storyboard-init] 템플릿 로드 완료: ${name} (${txt.length} chars)`);
  return txt;
}
const INPUT_PROMPT  = readTxt('input_prompt.txt');
const SECOND_PROMPT = readTxt('second_prompt.txt');
const THIRD_PROMPT  = readTxt('third_prompt.txt');

/* ---------- 파싱/계산 ---------- */
function parseVideoLengthSeconds(raw) {
  if (raw == null) return 10;
  if (typeof raw === 'number') return raw;
  const digits = String(raw).match(/\d+/g);
  if (!digits) return 10;
  const n = parseInt(digits.join(''), 10);
  return (isNaN(n) || n <= 0) ? 10 : n;
}
function calcSceneCount(videoSeconds) {
  const n = Math.floor(videoSeconds / 2);
  return n < 1 ? 1 : n;
}

/* ---------- Gemini 재시도/폴백 ---------- */
const MODEL_CHAIN = (process.env.GEMINI_MODEL_CHAIN ||
  process.env.GEMINI_MODEL ||
  'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash,gemini-1.5-flash')
  .split(',').map(s=>s.trim()).filter(Boolean);

const MAX_ATTEMPTS = Number(process.env.GEMINI_MAX_ATTEMPTS || 8);
const BASE_BACKOFF = Number(process.env.GEMINI_BASE_BACKOFF_MS || 1500);
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const jitter = (ms)=>Math.round(ms*(0.7+Math.random()*0.6));

function isRetryable(e) {
  const code = e?.status;
  const msg = (e?.message||'').toLowerCase();
  if ([429,500,502,503,504].includes(code)) return true;
  if (msg.includes('overloaded')||msg.includes('quota')||msg.includes('timeout')||msg.includes('fetch')) return true;
  return false;
}

async function callGemini(genAI, prompt, label) {
  let attempt=0;
  const total = Math.max(MODEL_CHAIN.length*2, MAX_ATTEMPTS);
  while (attempt < total) {
    for (const m of MODEL_CHAIN) {
      for (let local=1; local<=2; local++) {
        attempt++;
        console.log(`[storyboard-init] ${label} attempt ${attempt}/${total} model=${m} (${local}/2)`);
        try {
          const model = genAI.getGenerativeModel({ model: m });
          const t0=Date.now();
          const resp = await model.generateContent(prompt);
          const text = resp.response.text();
          console.log(`[storyboard-init] ${label} success model=${m} ${Date.now()-t0}ms`);
          return text;
        } catch(e) {
          const retry = isRetryable(e);
          console.warn(`[storyboard-init] ${label} fail model=${m}: ${e.message}`);
          if (!retry) throw e;
          const delay = jitter(BASE_BACKOFF * Math.pow(2, Math.floor(attempt / MODEL_CHAIN.length)));
          console.log(`[storyboard-init] ${label} retry in ${delay}ms`);
          await sleep(delay);
          if (attempt >= total) break;
        }
      }
      if (attempt >= total) break;
    }
  }
  throw new Error(`${label} 실패: 모든 모델 소진`);
}

/* ---------- 프롬프트 빌드 ---------- */
function buildBriefPrompt(formData) {
  if (!INPUT_PROMPT) throw new Error('input_prompt.txt 누락');
  return INPUT_PROMPT
    .replaceAll('{{brandName}}', String(formData.brandName||''))
    .replaceAll('{{industryCategory}}', String(formData.industryCategory||''))
    .replaceAll('{{videoLength}}', String(parseVideoLengthSeconds(formData.videoLength)))
    .replaceAll('{{coreTarget}}', String(formData.coreTarget||''))
    .replaceAll('{{coreDifferentiation}}', String(formData.coreDifferentiation||''))
    .replaceAll('{{videoPurpose}}', String(formData.videoPurpose||''));
}

function buildConceptsPrompt(brief, formData) {
  if (!SECOND_PROMPT) throw new Error('second_prompt.txt 누락');
  return SECOND_PROMPT
    .replaceAll('{{brief}}', brief)
    .replaceAll('{{brandName}}', String(formData.brandName||''))
    .replaceAll('{{videoLength}}', String(parseVideoLengthSeconds(formData.videoLength)))
    .replaceAll('{{videoPurpose}}', String(formData.videoPurpose||''));
}

function buildMultiStoryboardPrompt(brief, conceptsJson, sceneCount, videoSeconds) {
  if (!THIRD_PROMPT) throw new Error('third_prompt.txt 누락');
  return THIRD_PROMPT
    .replaceAll('{{brief}}', brief)
    .replaceAll('{{concepts_json}}', conceptsJson)
    .replaceAll('{{scene_count}}', String(sceneCount))
    .replaceAll('{{video_length_seconds}}', String(videoSeconds));
}

/* ---------- JSON 6컨셉 파싱 ---------- */
function parseConcepts(text) {
  try {
    const first = text.indexOf('[');
    const last  = text.lastIndexOf(']');
    if (first>=0 && last>first) {
      const slice = text.slice(first, last+1);
      const parsed = JSON.parse(slice);
      if (Array.isArray(parsed) && parsed.length === 6) return parsed;
    }
  } catch(e){}
  // fallback pattern
  const pattern = /\{\s*"concept_id"\s*:\s*\d+[\s\S]*?\}/g;
  const matches = text.match(pattern)||[];
  const map = {};
  for (const m of matches) {
    try {
      const obj = JSON.parse(m);
      if (typeof obj.concept_id === 'number' && obj.concept_id>=1 && obj.concept_id<=6 && !map[obj.concept_id]) {
        map[obj.concept_id]=obj;
      }
    } catch{}
  }
  const out=[];
  for (let i=1;i<=6;i++) if (map[i]) out.push(map[i]);
  return out.length===6?out:[];
}

/* ---------- 멀티 스토리보드 파싱 ---------- */
function parseMultiStoryboards(raw, sceneCount) {
  const results=[];
  if (!raw) return results;

  // Split blocks by Concept header
  const blocks = raw.split(/\n(?=### Concept\s+\d+:)/g).filter(b=>b.startsWith('### Concept'));
  for (const b of blocks) {
    const head = b.match(/^### Concept\s+(\d+):\s*(.+)$/m);
    if (!head) continue;
    const concept_id = parseInt(head[1],10);
    const concept_name = head[2].trim();
    const scenes=[];
    const regex = /#### Scene\s+(\d+)\s*\(([^)]*)\)\s*\n\s*-\s*\*\*Image Prompt\*\*:\s*([\s\S]*?)(?=\n#### Scene\s+\d+\s*\(|\n### Concept|\Z)/g;
    let m;
    while ((m=regex.exec(b))!==null) {
      const sn = parseInt(m[1],10);
      let prompt = m[3].replace(/\*\*/g,'').trim();
      if (prompt.split(/\s+/).length < 55) {
        prompt += ', insanely detailed, micro-details, hyper-realistic, sharp focus, 4K';
      }
      scenes.push({
        sceneNumber: sn,
        title: `Scene ${sn}`,
        prompt,
        duration: 2
      });
    }
    // 보정
    if (scenes.length < sceneCount && scenes.length>0) {
      const last= scenes[scenes.length-1];
      while (scenes.length<sceneCount) {
        const next = scenes.length+1;
        scenes.push({...last, sceneNumber: next, title:`Scene ${next}`});
      }
    }
    scenes.sort((a,b)=>a.sceneNumber-b.sceneNumber);
    results.push({ concept_id, name: concept_name, imagePrompts: scenes });
  }
  return results;
}

/* ---------- 핸들러 ---------- */
export default async function handler(req,res){
  // CORS
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  console.log('================ [storyboard-init] 시작 ================');
  const t0 = Date.now();
  try {
    const { formData } = req.body || {};
    if (!formData) return res.status(400).json({error:'formData required'});

    const videoSeconds = parseVideoLengthSeconds(formData.videoLength);
    const scCount = calcSceneCount(videoSeconds);
    console.log(`[storyboard-init] videoSeconds=${videoSeconds}, sceneCount=${scCount}`);

    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key not found');
    const genAI = new GoogleGenerativeAI(apiKey);

    // 1) Brief
    const briefPrompt = buildBriefPrompt(formData);
    const briefOut = await callGemini(genAI, briefPrompt, '1단계-브리프');

    // 2) 6 Concepts
    const conceptsPrompt = buildConceptsPrompt(briefOut, formData);
    const conceptsOut = await callGemini(genAI, conceptsPrompt, '2단계-컨셉');
    const conceptsArr = parseConcepts(conceptsOut);
    if (conceptsArr.length !== 6) {
      throw new Error(`컨셉 파싱 실패 (got=${conceptsArr.length}, expect=6)`);
    }
    console.log('[storyboard-init] 컨셉 6개 파싱 OK');

    // 3) Multi Storyboards (all 6)
    const multiPrompt = buildMultiStoryboardPrompt(briefOut, JSON.stringify(conceptsArr, null, 2), scCount, videoSeconds);
    const multiOut = await callGemini(genAI, multiPrompt, '3단계-멀티스토리보드');
    const parsed = parseMultiStoryboards(multiOut, scCount);
    if (parsed.length !== 6) {
      console.warn(`[storyboard-init] 멀티 스토리보드 파싱 count=${parsed.length} (expected=6) Fallback 복구`);
    }

    // 스타일(=컨셉) 구조
    const styles = conceptsArr.map(c=>{
      const match = parsed.find(p=>p.concept_id===c.concept_id);
      let imagePrompts = match?.imagePrompts || [];
      if (!imagePrompts.length) {
        // 빈 경우 fallback
        for (let i=1;i<=scCount;i++){
          imagePrompts.push({
            sceneNumber: i,
            title: `Scene ${i}`,
            duration: 2,
            prompt: `${c.concept_name} placeholder scene ${i}, insanely detailed, micro-details, hyper-realistic, sharp focus, 4K`
          });
        }
      }
      return {
        concept_id: c.concept_id,
        style: c.concept_name,
        name: c.concept_name,
        summary: c.summary,
        keywords: c.keywords,
        imagePrompts
      };
    });

    res.status(200).json({
      success:true,
      styles,
      metadata:{
        videoLengthSeconds: videoSeconds,
        sceneCountPerConcept: scCount,
        modelChain: MODEL_CHAIN,
        timings: {
          total: Date.now()-t0
        }
      }
    });
  } catch(e) {
    console.error('[storyboard-init] 오류:', e);
    res.status(500).json({success:false, error:e.message});
  } finally {
    console.log('================ [storyboard-init] 종료 ================');
  }
}

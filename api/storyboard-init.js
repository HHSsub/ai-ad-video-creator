import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

/* =========================================================
   2-STEP CHAIN VERSION (input_second_prompt → final_prompt)
   (Z2 확장: 기존 3단계 전혀 사용 안 함)
========================================================= */

/* ---------- 텍스트 템플릿 로딩 ---------- */
function loadTxt(name){
  const p = path.resolve(process.cwd(),'public',name);
  if(!fs.existsSync(p)){
    console.error(`[storyboard-init][Z2] 템플릿 누락: ${name} (${p})`);
    return null;
  }
  const txt = fs.readFileSync(p,'utf-8');
  console.log(`[storyboard-init][Z2] 템플릿 로드: ${name} (${txt.length} chars)`);
  return txt;
}

// 반드시 2개만 사용
const INPUT_SECOND_PROMPT = loadTxt('input_second_prompt.txt'); // 통합 1차
const FINAL_PROMPT        = loadTxt('final_prompt.txt');        // JSON 전용 2차

/* ---------- 유틸 ---------- */
function parseVideoLengthSeconds(raw){
  if(raw==null) return 10;
  if(typeof raw==='number') return raw;
  const m = String(raw).match(/\d+/g);
  if(!m) return 10;
  const n = parseInt(m.join(''),10);
  return (isNaN(n)||n<=0)?10:n;
}
function calcSceneCount(sec){
  const n = Math.floor(sec/2);
  return n<1?1:n;
}

// aspectRatio → final_prompt 의 {aspectRatioCode}
function mapAspectRatio(formData){
  const v = (formData?.videoAspectRatio || formData?.aspectRatio || '').toString().trim().toLowerCase();
  if(['9:16','vertical','portrait'].includes(v)) return 'vertical_9_16';
  if(['1:1','square'].includes(v)) return 'square_1_1';
  if(['4:5','portrait_4_5','4:5portrait'].includes(v)) return 'portrait_4_5';
  // 기본
  return 'widescreen_16_9';
}

// 모델 체인
const MODEL_CHAIN = (process.env.GEMINI_MODEL_CHAIN ||
  process.env.GEMINI_MODEL ||
  'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash,gemini-1.5-flash')
  .split(',')
  .map(s=>s.trim())
  .filter(Boolean);

const MAX_ATTEMPTS = Number(process.env.GEMINI_MAX_ATTEMPTS || 8);
const BASE_BACKOFF = Number(process.env.GEMINI_BASE_BACKOFF_MS || 1500);
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const jitter = ms=>Math.round(ms*(0.7+Math.random()*0.6));

function retryable(e){
  const c = e?.status;
  const m = (e?.message||'').toLowerCase();
  if([429,500,502,503,504].includes(c)) return true;
  if(m.includes('overload')||m.includes('quota')||m.includes('timeout')||m.includes('fetch')) return true;
  return false;
}

async function callGemini(genAI, prompt, label){
  let attempt=0;
  const total = Math.max(MODEL_CHAIN.length*2, MAX_ATTEMPTS);
  while(attempt<total){
    for(const model of MODEL_CHAIN){
      for(let local=1; local<=2; local++){
        attempt++;
        console.log(`[storyboard-init][Z2] ${label} attempt ${attempt}/${total} model=${model}`);
        try{
          const g = genAI.getGenerativeModel({model});
          const t0=Date.now();
          const r = await g.generateContent(prompt);
          const text = r.response.text();
          console.log(`[storyboard-init][Z2] ${label} success model=${model} ${Date.now()-t0}ms (${text.length} chars)`);
          return { text, model, took: Date.now()-t0, attempts: attempt };
        }catch(e){
          if(!retryable(e)) throw e;
          const delay = jitter(BASE_BACKOFF*Math.pow(2, Math.floor(attempt/MODEL_CHAIN.length)));
          console.warn(`[storyboard-init][Z2] ${label} fail model=${model} ${e.message} retry in ${delay}ms`);
          await sleep(delay);
        }
      }
    }
  }
  throw new Error(`${label} 실패(모든 모델 소진)`);
}

/* ---------- 1차 프롬프트 생성 ---------- */
function buildFirstPrompt(formData){
  if(!INPUT_SECOND_PROMPT) throw new Error('input_second_prompt.txt 누락');
  // 템플릿 안에서 자유롭게 formData 활용하도록 변수 치환 (가능한 것만)
  return INPUT_SECOND_PROMPT
    .replaceAll('{{brandName}}', String(formData.brandName||''))
    .replaceAll('{{productServiceName}}', String(formData.productServiceName||''))
    .replaceAll('{{productServiceCategory}}', String(formData.productServiceCategory||''))
    .replaceAll('{{industryCategory}}', String(formData.industryCategory||''))
    .replaceAll('{{coreTarget}}', String(formData.coreTarget||''))
    .replaceAll('{{coreDifferentiation}}', String(formData.coreDifferentiation||''))
    .replaceAll('{{videoPurpose}}', String(formData.videoPurpose||''))
    .replaceAll('{{videoLength}}', String(formData.videoLength||''))
    .replaceAll('{{videoRequirements}}', String(formData.videoRequirements||''))
    .replaceAll('{{brandLogo}}', formData.brandLogo ? '업로드됨' : '없음')
    .replaceAll('{{productImage}}', formData.productImage ? '업로드됨' : '없음');
}

/* ---------- 2차(final) 프롬프트 생성 ---------- */
function buildFinalPrompt(phase1Output, formData, sceneCount){
  if(!FINAL_PROMPT) throw new Error('final_prompt.txt 누락');
  const videoLengthSeconds = parseVideoLengthSeconds(formData.videoLength);
  const aspectRatioCode = mapAspectRatio(formData);
  return FINAL_PROMPT
    .replaceAll('{phase1_output}', phase1Output)
    .replaceAll('{brandName}', String(formData.brandName||''))
    .replaceAll('{productServiceName}', String(formData.productServiceName||''))
    .replaceAll('{productServiceCategory}', String(formData.productServiceCategory||''))
    .replaceAll('{industryCategory}', String(formData.industryCategory||''))
    .replaceAll('{coreTarget}', String(formData.coreTarget||''))
    .replaceAll('{videoPurpose}', String(formData.videoPurpose||''))
    .replaceAll('{videoLength}', String(formData.videoLength||''))
    .replaceAll('{videoLengthSeconds}', String(videoLengthSeconds))
    .replaceAll('{targetSceneCount}', String(sceneCount))
    .replaceAll('{coreDifferentiation}', String(formData.coreDifferentiation||''))
    .replaceAll('{videoRequirements}', String(formData.videoRequirements||''))
    .replaceAll('{aspectRatioCode}', aspectRatioCode)
    .replaceAll('{brandLogo}', formData.brandLogo ? '업로드됨' : '없음')
    .replaceAll('{productImage}', formData.productImage ? '업로드됨' : '없음');
}

/* ---------- 1차 응답에서 6개 컨셉명 추출 ---------- */
function extractConceptNames(text){
  const out=[];
  if(!text) return out;
  const re=/\*\*\s*(\d+)\.\s*컨셉:\s*([^\*]+?)\s*\*\*/g;
  let m;
  while((m=re.exec(text))!==null){
    const idx=parseInt(m[1],10);
    const name=m[2].trim();
    if(idx>=1 && idx<=6 && !out[idx-1]) out[idx-1]=name;
  }
  if(out.filter(Boolean).length===6){
    console.log('[storyboard-init][Z2] 컨셉명 6개 추출 성공');
  } else {
    console.warn(`[storyboard-init][Z2] 컨셉명 추출 ${out.filter(Boolean).length}/6 (부족분 placeholder)`);
  }
  return out;
}

/* ---------- 2차(JSON) 응답 파싱 ---------- */
function parsePhase2JSON(raw){
  if(!raw) return null;
  // final_prompt 규칙: "SINGLE JSON" → 앞뒤 잡음 제거
  const first = raw.indexOf('{');
  const last  = raw.lastIndexOf('}');
  if(first<0 || last<0 || last<=first) return null;
  const slice = raw.slice(first, last+1).trim();
  try{
    const obj = JSON.parse(slice);
    if(Array.isArray(obj.scenes)) return obj;
  }catch(e){
    console.warn('[storyboard-init][Z2] JSON parse 실패:', e.message);
  }
  return null;
}

/* ---------- styles / imagePrompts 구성 ---------- */
function buildStyles(conceptNames, phase2Obj, sceneCount){
  // phase2Obj.scenes -> 배열(각 scene_number / image_prompt.*)
  let sceneTemplates=[];
  if(phase2Obj?.scenes?.length){
    sceneTemplates = phase2Obj.scenes.slice(0, sceneCount).map(sc => ({
      sceneNumber: sc.scene_number || sc.sceneNumber || 1,
      title: `Scene ${sc.scene_number || sc.sceneNumber || 1}`,
      duration: sc.duration_seconds || sc.duration || 2,
      prompt: sc.image_prompt?.prompt || sc.prompt || 'Missing prompt, insanely detailed, micro-details, hyper-realistic textures, sharp focus, 4K'
    }));
  }
  // 부족/초과 보정
  while(sceneTemplates.length < sceneCount && sceneTemplates.length>0){
    const last = sceneTemplates[sceneTemplates.length-1];
    sceneTemplates.push({
      ...last,
      sceneNumber: sceneTemplates.length+1,
      title:`Scene ${sceneTemplates.length+1}`
    });
  }
  if(sceneTemplates.length===0){
    for(let i=1;i<=sceneCount;i++){
      sceneTemplates.push({
        sceneNumber:i,
        title:`Scene ${i}`,
        duration:2,
        prompt:`Placeholder scene ${i}, insanely detailed, micro-details, hyper-realistic textures, sharp focus, 4K`
      });
    }
  }

  const styles=[];
  for(let i=0;i<6;i++){
    const cname = conceptNames[i] || `Concept ${i+1}`;
    styles.push({
      concept_id: i+1,
      style: cname,
      name: cname,
      summary: `Auto summary for ${cname}`,
      keywords: [],
      imagePrompts: sceneTemplates.map(st => ({
        sceneNumber: st.sceneNumber,
        title: st.title,
        duration: st.duration,
        prompt: st.prompt
      }))
    });
  }
  return styles;
}

/* ---------- 핸들러 ---------- */
export default async function handler(req,res){
  // CORS
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const t0=Date.now();
  console.log('================ [storyboard-init][Z2] START (2-STEP) ================');

  try{
    const { formData } = req.body || {};
    if(!formData) return res.status(400).json({error:'formData required'});
    if(!INPUT_SECOND_PROMPT) throw new Error('input_second_prompt.txt 누락 (2-STEP 체인 필수)');
    if(!FINAL_PROMPT) throw new Error('final_prompt.txt 누락 (2-STEP 체인 필수)');

    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if(!apiKey) throw new Error('Gemini API Key 누락');
    const gen = new GoogleGenerativeAI(apiKey);

    const videoLengthSeconds = parseVideoLengthSeconds(formData.videoLength);
    const sceneCount = calcSceneCount(videoLengthSeconds);

    console.log(`[storyboard-init][Z2] videoLengthSeconds=${videoLengthSeconds} sceneCount=${sceneCount}`);

    // STEP 1
    const firstPrompt = buildFirstPrompt(formData);
    console.log('[storyboard-init][Z2] STEP1 prompt length=', firstPrompt.length);
    const step1 = await callGemini(gen, firstPrompt, 'STEP1');
    const phase1_output = step1.text;

    // 컨셉명 추출
    const conceptNames = extractConceptNames(phase1_output);
    if(conceptNames.filter(Boolean).length<6){
      // 부족분 채우기
      for(let i=0;i<6;i++){
        if(!conceptNames[i]) conceptNames[i] = `Concept ${i+1}`;
      }
    }

    // STEP 2
    const secondPrompt = buildFinalPrompt(phase1_output, formData, sceneCount);
    console.log('[storyboard-init][Z2] STEP2(final) prompt length=', secondPrompt.length);
    const step2 = await callGemini(gen, secondPrompt, 'STEP2');

    // JSON 파싱
    const phase2Obj = parsePhase2JSON(step2.text);
    if(!phase2Obj){
      console.warn('[storyboard-init][Z2] Phase2 JSON 파싱 실패 → placeholder scenes 사용');
    } else {
      console.log('[storyboard-init][Z2] Phase2 JSON scenes=', phase2Obj.scenes?.length);
    }

    // styles 구성 (항상 6개)
    const styles = buildStyles(conceptNames, phase2Obj, sceneCount);

    res.status(200).json({
      success:true,
      styles,
      metadata:{
        videoLengthSeconds,
        sceneCountPerConcept: sceneCount,
        modelChain: MODEL_CHAIN,
        totalMs: Date.now()-t0,
        step1Model: step1.model,
        step2Model: step2.model,
        phase2Parsed: !!phase2Obj,
        conceptNames,
        z2:true
      }
    });

  }catch(e){
    console.error('[storyboard-init][Z2] 오류', e);
    res.status(500).json({success:false,error:e.message});
  }finally{
    console.log('================ [storyboard-init][Z2] END ================');
  }
}

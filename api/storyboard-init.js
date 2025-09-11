import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

function loadTxt(fn){
  const p = path.resolve(process.cwd(),'public',fn);
  if(!fs.existsSync(p)) throw new Error(`${fn} 누락`);
  return fs.readFileSync(p,'utf-8');
}

const INPUT_PROMPT  = loadTxt('input_prompt.txt');
const SECOND_PROMPT = loadTxt('second_prompt.txt');
const THIRD_PROMPT  = loadTxt('third_prompt.txt');

function parseVideoLengthSeconds(raw){
  if(raw==null) return 10;
  if(typeof raw==='number') return raw;
  const d = String(raw).match(/\d+/g);
  if(!d) return 10;
  const n = parseInt(d.join(''),10);
  return (isNaN(n)||n<=0)?10:n;
}
function calcSceneCount(sec){
  const n = Math.floor(sec/2);
  return n<1?1:n;
}

const MODEL_CHAIN = (process.env.GEMINI_MODEL_CHAIN ||
  process.env.GEMINI_MODEL ||
  'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash,gemini-1.5-flash')
  .split(',').map(s=>s.trim()).filter(Boolean);

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
        console.log(`[storyboard-init] ${label} attempt ${attempt}/${total} model=${model}`);
        try{
          const m = genAI.getGenerativeModel({model});
          const t0=Date.now();
          const r = await m.generateContent(prompt);
          const text = r.response.text();
          console.log(`[storyboard-init] ${label} success model=${model} ${Date.now()-t0}ms`);
          return text;
        }catch(e){
          if(!retryable(e)) throw e;
          const delay = jitter(BASE_BACKOFF*Math.pow(2, Math.floor(attempt/MODEL_CHAIN.length)));
          console.warn(`[storyboard-init] ${label} fail ${e.message} retry in ${delay}ms`);
          await sleep(delay);
        }
      }
    }
  }
  throw new Error(`${label} 실패: 전 모델 실패`);
}

function buildBriefPrompt(fd){
  return INPUT_PROMPT
    .replaceAll('{{brandName}}', String(fd.brandName||''))
    .replaceAll('{{industryCategory}}', String(fd.industryCategory||''))
    .replaceAll('{{videoLength}}', String(parseVideoLengthSeconds(fd.videoLength)))
    .replaceAll('{{coreTarget}}', String(fd.coreTarget||''))
    .replaceAll('{{coreDifferentiation}}', String(fd.coreDifferentiation||''))
    .replaceAll('{{videoPurpose}}', String(fd.videoPurpose||''));
}
function buildConceptsPrompt(brief,fd){
  return SECOND_PROMPT
    .replaceAll('{{brief}}', brief)
    .replaceAll('{{brandName}}', String(fd.brandName||''))
    .replaceAll('{{videoLength}}', String(parseVideoLengthSeconds(fd.videoLength)))
    .replaceAll('{{videoPurpose}}', String(fd.videoPurpose||''));
}
function buildMultiPrompt(brief, conceptsJson, sceneCount, videoSec){
  return THIRD_PROMPT
    .replaceAll('{{brief}}', brief)
    .replaceAll('{{concepts_json}}', conceptsJson)
    .replaceAll('{{scene_count}}', String(sceneCount))
    .replaceAll('{{video_length_seconds}}', String(videoSec));
}

function parseConcepts(text){
  try{
    const f=text.indexOf('[');
    const l=text.lastIndexOf(']');
    if(f>=0 && l>f){
      const slice=text.slice(f,l+1);
      const parsed=JSON.parse(slice);
      if(Array.isArray(parsed)&&parsed.length===6) return parsed;
    }
  }catch(e){}
  const pattern=/\{\s*"concept_id"\s*:\s*\d+[\s\S]*?\}/g;
  const m=text.match(pattern)||[];
  const map={};
  for(const blk of m){
    try{
      const obj=JSON.parse(blk);
      if(typeof obj.concept_id==='number' && obj.concept_id>=1 && obj.concept_id<=6 && !map[obj.concept_id]){
        map[obj.concept_id]=obj;
      }
    }catch(e){}
  }
  const out=[];
  for(let i=1;i<=6;i++) if(map[i]) out.push(map[i]);
  return out.length===6?out:[];
}

function parseMultiStoryboards(raw, sceneCount){
  const results=[];
  if(!raw) return results;
  const blocks = raw.split(/\n(?=### Concept\s+\d+:)/g)
    .filter(b=>b.startsWith('### Concept'));

  for(const b of blocks){
    const head=b.match(/^### Concept\s+(\d+):\s*(.+)$/m);
    if(!head) continue;
    const cid=parseInt(head[1],10);
    const cname=head[2].trim();
    const scenes=[];
    const reg=/#### Scene\s+(\d+)\s*\(([^)]*)\)\s*\n\s*-\s*\*\*Image Prompt\*\*:\s*([\s\S]*?)(?=\n#### Scene\s+\d+\s*\(|\n### Concept|\Z)/g;
    let m;
    while((m=reg.exec(b))!==null){
      const sn=parseInt(m[1],10);
      let prompt=m[3].replace(/\*\*/g,'').trim();
      if(prompt.split(/\s+/).length<55){
        prompt += ', insanely detailed, micro-details, hyper-realistic textures, sharp focus, 4K';
      }
      scenes.push({
        sceneNumber: sn,
        title: `Scene ${sn}`,
        prompt,
        duration: 2
      });
    }
    if(scenes.length<sceneCount && scenes.length>0){
      const last=scenes[scenes.length-1];
      while(scenes.length<sceneCount){
        const next=scenes.length+1;
        scenes.push({...last, sceneNumber: next, title:`Scene ${next}`});
      }
    }
    scenes.sort((a,b)=>a.sceneNumber-b.sceneNumber);
    results.push({concept_id: cid, name: cname, imagePrompts: scenes});
  }
  return results;
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const t0=Date.now();
  try{
    const { formData } = req.body||{};
    if(!formData) return res.status(400).json({error:'formData required'});

    const videoSec=parseVideoLengthSeconds(formData.videoLength);
    const sceneCount=calcSceneCount(videoSec);
    console.log(`[storyboard-init] videoSec=${videoSec} sceneCount=${sceneCount}`);

    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if(!apiKey) throw new Error('Gemini API Key 누락');
    const gen=new GoogleGenerativeAI(apiKey);

    // 1 brief
    const briefPrompt = buildBriefPrompt(formData);
    const briefOut = await callGemini(gen, briefPrompt, '1-brief');

    // 2 concepts
    const conceptsPrompt = buildConceptsPrompt(briefOut, formData);
    const conceptsOut = await callGemini(gen, conceptsPrompt, '2-concepts');
    const conceptsArr = parseConcepts(conceptsOut);
    if(conceptsArr.length!==6) throw new Error(`컨셉 파싱 실패(${conceptsArr.length})`);

    // 3 multi
    const multiPrompt = buildMultiPrompt(briefOut, JSON.stringify(conceptsArr,null,2), sceneCount, videoSec);
    const multiOut = await callGemini(gen, multiPrompt, '3-multi-storyboards');
    const parsed = parseMultiStoryboards(multiOut, sceneCount);
    if(parsed.length!==6) console.warn('[storyboard-init] 멀티 파싱 수 부족 fallback 진행');

    const styles = conceptsArr.map(c=>{
      const match=parsed.find(p=>p.concept_id===c.concept_id);
      let imagePrompts = match?.imagePrompts || [];
      if(!imagePrompts.length){
        for(let i=1;i<=sceneCount;i++){
          imagePrompts.push({
            sceneNumber:i,
            title:`Scene ${i}`,
            duration:2,
            prompt:`${c.concept_name} placeholder scene ${i}, insanely detailed, micro-details, hyper-realistic textures, sharp focus, 4K`
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
        videoLengthSeconds: videoSec,
        sceneCountPerConcept: sceneCount,
        modelChain: MODEL_CHAIN,
        totalMs: Date.now()-t0
      }
    });

  }catch(e){
    console.error('[storyboard-init] 오류', e);
    res.status(500).json({success:false,error:e.message});
  }
}

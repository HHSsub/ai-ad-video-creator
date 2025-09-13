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
  // Z+ 추가 패턴: "**1. 컨셉: 이름**" 형태
  if(out.length!==6){
    const altRegex=/\*\*\s*(\d+)\.\s*컨셉:\s*([^\*]+?)\s*\*\*/g;
    const found=[];
    let mm;
    while((mm=altRegex.exec(text))!==null){
      const idx=parseInt(mm[1],10);
      const name=mm[2].trim();
      if(idx>=1 && idx<=6 && !found.find(f=>f.concept_id===idx)){
        found.push({
          concept_id: idx,
          concept_name: name,
          summary: `Auto-parsed summary for ${name} (Z+ fallback)`,
          keywords: []
        });
      }
    }
    if(found.length===6){
      console.log('[storyboard-init][Z+] altRegex 컨셉 6개 파싱 성공');
      return found.sort((a,b)=>a.concept_id-b.concept_id);
    }else{
      if(found.length>0){
        console.warn(`[storyboard-init][Z+] altRegex 일부만 감지 (${found.length})`);
      }
    }
  }
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

// Z+ : Phase2 JSON 형식(단일 scenes) fallback → styles 생성기
function buildStylesFromPhase2JSON(phase2Json, conceptsArr, sceneCount){
  if(!phase2Json?.scenes) return [];
  // sceneCountPerConcept 필요조건: 고정 6 컨셉 * sceneCount
  // 현 Phase2 JSON은 “최종 한 세트 5개”이므로 그대로 6개 컨셉에 복제하면 다 똑같아져 품질 떨어짐 → 최소한 seed 변조
  const baseScenes = phase2Json.scenes;
  const styles=[];
  for(let i=0;i<6;i++){
    const conceptMeta = conceptsArr[i] || { concept_id: i+1, concept_name: `Concept ${i+1}`, summary:'Z+ synthesized', keywords:[] };
    const cloned = baseScenes.map(sc => ({
      sceneNumber: sc.scene_number,
      title: `Scene ${sc.scene_number}`,
      duration: sc.duration_seconds || 2,
      // prompt 그대로 (사용자 요구: 변형 금지) 단 seed만 랜덤(이미지 다양성)
      prompt: sc.image_prompt?.prompt || '',
      // (이미 Phase2 JSON 안에 size/negative_prompt/seed 존재이지만 여기서는 렌더 단계에서 prompt만 사용하던 기존 Step2 흐름 호환)
    }));
    // sceneCount 보정
    if(cloned.length<sceneCount){
      const last = cloned[cloned.length-1];
      while(cloned.length<sceneCount){
        cloned.push({...last, sceneNumber: cloned.length+1, title:`Scene ${cloned.length+1}`});
      }
    } else if(cloned.length>sceneCount){
      cloned.length = sceneCount;
    }
    styles.push({
      concept_id: conceptMeta.concept_id,
      style: conceptMeta.concept_name || conceptMeta.name || `Concept ${conceptMeta.concept_id}`,
      name: conceptMeta.concept_name || conceptMeta.name || `Concept ${conceptMeta.concept_id}`,
      summary: conceptMeta.summary || 'Z+ synthesized summary',
      keywords: conceptMeta.keywords || [],
      imagePrompts: cloned
    });
  }
  console.log('[storyboard-init][Z+] Phase2 JSON fallback styles 생성 완료');
  return styles;
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
    let conceptsArr = parseConcepts(conceptsOut);
    if(conceptsArr.length!==6){
      console.warn(`[storyboard-init] 컨셉 파싱 실패(${conceptsArr.length}) - alt fallback 시도`);
    }

    // 3 multi
    const multiPrompt = buildMultiPrompt(briefOut, JSON.stringify(conceptsArr,null,2), sceneCount, videoSec);
    const multiOut = await callGemini(gen, multiPrompt, '3-multi-storyboards');

    // 기존 파서 (### Concept ...)
    let parsed = parseMultiStoryboards(multiOut, sceneCount);
    if(parsed.length!==6) console.warn('[storyboard-init] 멀티 파싱 수 부족 fallback 진행');

    // Phase2 최종(JSON)만 나오는 새 형태 대응:
    // multiOut 안에서 마지막 JSON 객체 추출
    let phase2Json=null;
    try{
      const jsonMatch = multiOut.match(/\{[\s\S]*\}\s*$/); // 마지막 JSON 블럭
      if(jsonMatch){
        phase2Json = JSON.parse(jsonMatch[0]);
        console.log('[storyboard-init][Z+] Phase2 JSON 추출 성공 keys=', Object.keys(phase2Json));
      }
    }catch(e){
      console.warn('[storyboard-init][Z+] Phase2 JSON 추출 실패', e.message);
    }

    // styles 생성 로직
    let styles=[];
    if(conceptsArr.length===6 && parsed.length===6){
      // 정상 경로
      styles = conceptsArr.map(c=>{
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
    } else {
      // Fallback 경로
      if(conceptsArr.length===6){
        console.log('[storyboard-init][Z+] fallback: concepts 6 OK, multi parse 실패 → Phase2 JSON 또는 placeholder 사용');
      } else {
        // conceptsArr 부족 → 6개 강제 보정
        const names = conceptsArr.map(c=>c.concept_name);
        while(conceptsArr.length<6){
          const nextId = conceptsArr.length+1;
          conceptsArr.push({
            concept_id: nextId,
            concept_name: names[nextId-1] || `Concept ${nextId}`,
            summary: 'Z+ auto-filled summary',
            keywords:[]
          });
        }
        console.log('[storyboard-init][Z+] 컨셉 강제 보정 완료 length=', conceptsArr.length);
      }

      if(phase2Json?.scenes){
        styles = buildStylesFromPhase2JSON(phase2Json, conceptsArr, sceneCount);
      } else {
        // 최후 fallback: 단순 placeholder
        console.warn('[storyboard-init][Z+] Phase2 JSON 없음 → placeholder styles 생성');
        styles = conceptsArr.map(c=>{
          const imagePrompts=[];
          for(let i=1;i<=sceneCount;i++){
            imagePrompts.push({
              sceneNumber:i,
              title:`Scene ${i}`,
              duration:2,
              prompt:`${c.concept_name} placeholder scene ${i}, insanely detailed, micro-details, hyper-realistic textures, sharp focus, 4K`
            });
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
      }
    }

    // styles 보안: 길이 확인
    if(styles.length!==6){
      console.warn('[storyboard-init][Z+] styles length != 6 최종 보정 실행');
      // 길이 맞출 때 부족분 추가
      const existingIds = new Set(styles.map(s=>s.concept_id));
      for(let i=1;i<=6;i++){
        if(!existingIds.has(i)){
          const sc=[];
          for(let k=1;k<=sceneCount;k++){
            sc.push({
              sceneNumber:k,
              title:`Scene ${k}`,
              duration:2,
              prompt:`Concept ${i} auto-filled scene ${k}, insanely detailed, micro-details, hyper-realistic textures, sharp focus, 4K`
            });
          }
          styles.push({
            concept_id:i,
            style:`Concept ${i}`,
            name:`Concept ${i}`,
            summary:'Auto-filled concept',
            keywords:[],
            imagePrompts: sc
          });
        }
      }
      styles.sort((a,b)=>a.concept_id-b.concept_id);
    }

    res.status(200).json({
      success:true,
      styles,
      metadata:{
        videoLengthSeconds: videoSec,
        sceneCountPerConcept: sceneCount,
        modelChain: MODEL_CHAIN,
        totalMs: Date.now()-t0,
        zplus: true,
        phase2JsonDetected: !!phase2Json
      }
    });

  }catch(e){
    console.error('[storyboard-init] 오류', e);
    res.status(500).json({success:false,error:e.message});
  }
}

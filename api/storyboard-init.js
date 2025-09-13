import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

/* =========================================================
   2-STEP CHAIN (input_second_prompt → final_prompt)
   요구사항 갱신:
   - STEP1: 6개 컨셉 전략/묘사 산출
   - STEP2: 6개 컨셉 각각에 대해 (videoLengthSeconds/2) 장면 *독립* 이미지 프롬프트 JSON
   - 총 6 * sceneCountPerConcept 이미지 프롬프트 (예: 10초 → 5장 → 30개)
   - 기존 final_prompt.txt 가 단일 scenes JSON을 강제하던 것을
     프롬프트 후단에 OVERRIDE 지시 추가하여 다중 concepts 출력 강제
========================================================= */

/* ---------------- 텍스트 로더 ---------------- */
function loadTxt(name){
  const p = path.resolve(process.cwd(),'public',name);
  if(!fs.existsSync(p)){
    console.error(`[storyboard-init][Z2M] 템플릿 누락: ${name} (${p})`);
    return null;
  }
  const txt = fs.readFileSync(p,'utf-8');
  console.log(`[storyboard-init][Z2M] 템플릿 로드: ${name} (${txt.length} chars)`);
  return txt;
}

const INPUT_SECOND_PROMPT = loadTxt('input_second_prompt.txt'); // STEP1
const FINAL_PROMPT        = loadTxt('final_prompt.txt');        // STEP2 (OVERRIDE 추가)

/* ---------------- 기본 유틸 ---------------- */
function parseVideoLengthSeconds(raw){
  if(raw==null) return 10;
  if(typeof raw==='number') return raw;
  const m = String(raw).match(/\d+/g);
  if(!m) return 10;
  const n = parseInt(m.join(''),10);
  return (isNaN(n)||n<=0)?10:n;
}
function calcSceneCountPerConcept(sec){
  const n = Math.floor(sec/2);
  return n<1?1:n;
}
function mapAspectRatio(formData){
  const v = (formData?.videoAspectRatio || formData?.aspectRatio || '').toString().trim().toLowerCase();
  if(['9:16','vertical','portrait'].includes(v)) return 'vertical_9_16';
  if(['1:1','square'].includes(v)) return 'square_1_1';
  if(['4:5','portrait_4_5','4:5portrait'].includes(v)) return 'portrait_4_5';
  return 'widescreen_16_9';
}

/* ---------------- 모델 체인 & 재시도 ---------------- */
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
        console.log(`[storyboard-init][Z2M] ${label} attempt ${attempt}/${total} model=${model}`);
        try{
          const g = genAI.getGenerativeModel({model});
          const t0=Date.now();
          const r = await g.generateContent(prompt);
          const text = r.response.text();
          console.log(`[storyboard-init][Z2M] ${label} success model=${model} ${Date.now()-t0}ms (len=${text.length})`);
          return { text, model, took: Date.now()-t0, attempts: attempt };
        }catch(e){
          if(!retryable(e)) throw e;
          const delay = jitter(BASE_BACKOFF*Math.pow(2, Math.floor(attempt/MODEL_CHAIN.length)));
          console.warn(`[storyboard-init][Z2M] ${label} fail model=${model} ${e.message} retry in ${delay}ms`);
          await sleep(delay);
        }
      }
    }
  }
  throw new Error(`${label} 실패(모든 모델 소진)`);
}

/* ---------------- STEP1 프롬프트 ---------------- */
function buildStep1Prompt(fd){
  if(!INPUT_SECOND_PROMPT) throw new Error('input_second_prompt.txt 누락');
  return INPUT_SECOND_PROMPT
    .replaceAll('{{brandName}}', String(fd.brandName||''))
    .replaceAll('{{productServiceName}}', String(fd.productServiceName||''))
    .replaceAll('{{productServiceCategory}}', String(fd.productServiceCategory||''))
    .replaceAll('{{industryCategory}}', String(fd.industryCategory||''))
    .replaceAll('{{coreTarget}}', String(fd.coreTarget||''))
    .replaceAll('{{coreDifferentiation}}', String(fd.coreDifferentiation||''))
    .replaceAll('{{videoPurpose}}', String(fd.videoPurpose||''))
    .replaceAll('{{videoLength}}', String(fd.videoLength||'')) // 그대로
    .replaceAll('{{videoRequirements}}', String(fd.videoRequirements||''))
    .replaceAll('{{brandLogo}}', fd.brandLogo ? '업로드됨':'없음')
    .replaceAll('{{productImage}}', fd.productImage ? '업로드됨':'없음');
}

/* ---------------- STEP1 컨셉명 & 블록 추출 ----------------
   패턴: **1. 컨셉: 이름** ... (다음 **2. 컨셉: ...** 전까지)
----------------------------------------------------------- */
function extractConceptBlocks(raw){
  if(!raw) return [];
  const headerRe=/\*\*\s*(\d+)\.\s*컨셉:\s*([^\*]+?)\s*\*\*/g;
  const matches=[];
  let m;
  while((m=headerRe.exec(raw))!==null){
    matches.push({ idx: parseInt(m[1],10), name: m[2].trim(), start: m.index });
  }
  if(matches.length===0){
    console.warn('[storyboard-init][Z2M] 컨셉 헤더 패턴 미검출');
    return [];
  }
  // 블록 텍스트 추출
  for(let i=0;i<matches.length;i++){
    const cur=matches[i];
    const next = matches[i+1];
    cur.block = raw.slice(cur.start, next? next.start : raw.length).trim();
  }
  // 1..6 필터 & 정렬
  const conceptMap = new Map();
  for(const c of matches){
    if(c.idx>=1 && c.idx<=6 && !conceptMap.has(c.idx)){
      conceptMap.set(c.idx, { concept_id:c.idx, concept_name:c.name, raw_block:c.block });
    }
  }
  const out=[];
  for(let i=1;i<=6;i++){
    if(conceptMap.has(i)) out.push(conceptMap.get(i));
  }
  if(out.length!==6){
    console.warn(`[storyboard-init][Z2M] 추출된 컨셉 수 ${out.length}/6 (부족분 placeholder 채움)`);
    for(let i=1;i<=6;i++){
      if(!out.find(o=>o.concept_id===i)){
        out.push({ concept_id:i, concept_name:`Concept ${i}`, raw_block:'[placeholder concept description]' });
      }
    }
    out.sort((a,b)=>a.concept_id-b.concept_id);
  } else {
    console.log('[storyboard-init][Z2M] 컨셉 6개 블록 추출 OK');
  }
  return out;
}

/* ---------------- STEP2(final) 프롬프트 ----------------
   기존 final_prompt.txt 는 단일 scenes JSON 요구.
   → OVERRIDE 지시문을 뒤에 붙여 6개 concepts JSON 요구.
---------------------------------------------------------- */
function buildFinalPrompt(phase1Output, conceptBlocks, fd, sceneCountPerConcept){
  if(!FINAL_PROMPT) throw new Error('final_prompt.txt 누락');
  const videoLengthSeconds = parseVideoLengthSeconds(fd.videoLength);
  const aspectRatioCode = mapAspectRatio(fd);

  // concept 블록을 간단 리스트로 삽입 (모델이 참조)
  const conceptsForPrompt = conceptBlocks.map(c=>`- (${c.concept_id}) ${c.concept_name}: ${c.raw_block.slice(0,400)}`).join('\n');

  const base = FINAL_PROMPT
    .replaceAll('{phase1_output}', phase1Output)
    .replaceAll('{brandName}', String(fd.brandName||''))
    .replaceAll('{productServiceName}', String(fd.productServiceName||''))
    .replaceAll('{productServiceCategory}', String(fd.productServiceCategory||''))
    .replaceAll('{industryCategory}', String(fd.industryCategory||''))
    .replaceAll('{coreTarget}', String(fd.coreTarget||''))
    .replaceAll('{videoPurpose}', String(fd.videoPurpose||''))
    .replaceAll('{videoLength}', String(fd.videoLength||''))
    .replaceAll('{videoLengthSeconds}', String(videoLengthSeconds))
    .replaceAll('{targetSceneCount}', String(sceneCountPerConcept)) // ★ per concept count
    .replaceAll('{coreDifferentiation}', String(fd.coreDifferentiation||''))
    .replaceAll('{videoRequirements}', String(fd.videoRequirements||''))
    .replaceAll('{aspectRatioCode}', aspectRatioCode)
    .replaceAll('{brandLogo}', fd.brandLogo ? '업로드됨':'없음')
    .replaceAll('{productImage}', fd.productImage ? '업로드됨':'없음');

  // OVERRIDE JSON Schema 추가
  const override = `
[OVERRIDE OUTPUT SCHEMA – IGNORE PREVIOUS SINGLE "scenes" SCHEMA]

Return EXACTLY ONE VALID JSON object with this schema (no markdown, no commentary):

{
  "project_meta":{
    "brand":"string",
    "product_or_category":"string",
    "industry":"string",
    "target":"string",
    "purpose":"string",
    "differentiation":"string",
    "video_length_seconds": ${videoLengthSeconds},
    "aspect_ratio":"${aspectRatioCode}",
    "logo_provided": <true|false>,
    "product_image_provided": <true|false>
  },
  "concepts":[
    {
      "concept_id":1,
      "concept_name":"<original concept 1 name>",
      "image_prompts":[
        {
          "scene_number":1,
          "timecode":"00:00-00:02",
          "image_prompt":{
            "prompt":"70-110 words ... ends with: Shot by <camera> with a <50mm or 85mm> lens.",
            "negative_prompt":"blurry, low quality, watermark, cartoon, distorted",
            "num_images":1,
            "image":{"size":"${aspectRatioCode}"},
            "styling":{"style":"photo"},
            "seed":12345
          },
          "motion_prompt":{"prompt":"1-3 short sentences"},
          "duration_seconds":2,
          "notes":"optional"
        }
      ]
    }
    // concept_id 2..6 동일 형식, each EXACTLY ${sceneCountPerConcept} scenes
  ]
}

NON-NEGOTIABLE ADDITIONS:
- EXACTLY 6 concepts.
- EACH concept has EXACTLY ${sceneCountPerConcept} distinct image_prompts.
- Each concept's prompts MUST vary (no copy-paste between concepts; camera angle / subject / environment differ).
- Maintain continuity within a concept across its scenes.
- Do NOT include any root key other than project_meta and concepts.
- NO 'scenes' root key.
- Seeds: 5-digit integers 10000-99999, unique per scene.
- All prompts obey previous global rules (high fidelity tokens, ending camera sentence, negative prompt, size).
- OUTPUT ONLY THE JSON OBJECT.

CONCEPT REFERENCE MATERIAL (from STEP1):
${conceptsForPrompt}
[END OVERRIDE]`;

  return `${base}\n\n${override}`;
}

/* ---------------- STEP2 JSON 파싱 ---------------- */
function parseMultiConceptJSON(raw){
  if(!raw) return null;
  const first = raw.indexOf('{');
  const last  = raw.lastIndexOf('}');
  if(first<0 || last<0 || last<=first) return null;
  const slice = raw.slice(first, last+1);
  try{
    const obj = JSON.parse(slice);
    if(Array.isArray(obj.concepts) && obj.concepts.length===6){
      return obj;
    }
    console.warn('[storyboard-init][Z2M] JSON concepts 형식 불완전');
    return obj;
  }catch(e){
    console.warn('[storyboard-init][Z2M] JSON 파싱 실패:', e.message);
    return null;
  }
}

/* ---------------- styles 구성 ---------------- */
function buildStylesFromConceptJson(conceptJson, sceneCountPerConcept){
  if(!conceptJson?.concepts) return [];
  return conceptJson.concepts.map(c=>{
    let arr = Array.isArray(c.image_prompts)? c.image_prompts : [];
    // 보정
    if(arr.length < sceneCountPerConcept && arr.length>0){
      const last = arr[arr.length-1];
      while(arr.length < sceneCountPerConcept){
        arr.push({...last, scene_number: arr.length+1, timecode:null});
      }
    }
    if(arr.length === 0){
      for(let i=1;i<=sceneCountPerConcept;i++){
        arr.push({
          scene_number:i,
          timecode:null,
          image_prompt:{
            prompt:`${c.concept_name||'Concept'} placeholder scene ${i}, insanely detailed, micro-details, hyper-realistic textures, visible skin pores, 4K, sharp focus. Shot by ARRI Alexa Mini with a 50mm lens.`,
            negative_prompt:'blurry, low quality, watermark, cartoon, distorted',
            num_images:1,
            image:{ size:'widescreen_16_9' },
            styling:{ style:'photo' },
            seed: Math.floor(10000 + Math.random()*90000)
          },
          motion_prompt:{ prompt:'Subtle camera drift.'},
          duration_seconds:2,
          notes:'fallback'
        });
      }
    }
    // scene sorting
    arr.sort((a,b)=>(a.scene_number||0)-(b.scene_number||0));
    return {
      concept_id: c.concept_id,
      style: c.concept_name,
      name: c.concept_name,
      summary: c.summary || `Generated concept ${c.concept_name}`,
      keywords: [],
      imagePrompts: arr.map(sc=>({
        sceneNumber: sc.scene_number,
        title: `Scene ${sc.scene_number}`,
        duration: sc.duration_seconds || 2,
        prompt: sc.image_prompt?.prompt || 'Missing prompt fallback, insanely detailed, micro-details, hyper-realistic textures, visible skin pores, 4K, sharp focus. Shot by RED Komodo with a 50mm lens.'
      }))
    };
  });
}

/* ---------------- 핸들러 ---------------- */
export default async function handler(req,res){
  // CORS
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const t0=Date.now();
  console.log('================ [storyboard-init][Z2M] START ================');

  try{
    const { formData } = req.body || {};
    if(!formData) return res.status(400).json({error:'formData required'});
    if(!INPUT_SECOND_PROMPT) throw new Error('input_second_prompt.txt 누락');
    if(!FINAL_PROMPT)        throw new Error('final_prompt.txt 누락');

    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if(!apiKey) throw new Error('Gemini API Key 누락');
    const gen = new GoogleGenerativeAI(apiKey);

    const videoLengthSeconds = parseVideoLengthSeconds(formData.videoLength);
    const sceneCountPerConcept = calcSceneCountPerConcept(videoLengthSeconds);

    console.log(`[storyboard-init][Z2M] videoLengthSeconds=${videoLengthSeconds} sceneCountPerConcept=${sceneCountPerConcept}`);

    /* STEP1 */
    const step1Prompt = buildStep1Prompt(formData);
    console.log('[storyboard-init][Z2M] STEP1 promptLen=', step1Prompt.length);
    const step1 = await callGemini(gen, step1Prompt, 'STEP1');
    const phase1_output = step1.text;

    const conceptBlocks = extractConceptBlocks(phase1_output);

    /* STEP2 */
    const step2Prompt = buildFinalPrompt(phase1_output, conceptBlocks, formData, sceneCountPerConcept);
    console.log('[storyboard-init][Z2M] STEP2 promptLen=', step2Prompt.length);
    const step2 = await callGemini(gen, step2Prompt, 'STEP2');

    const mcJson = parseMultiConceptJSON(step2.text);

    let styles=[];
    if(mcJson && Array.isArray(mcJson.concepts) && mcJson.concepts.length===6){
      styles = buildStylesFromConceptJson(mcJson, sceneCountPerConcept);
      console.log('[storyboard-init][Z2M] multi-concept JSON 파싱 성공 (6 concepts)');
    } else {
      console.warn('[storyboard-init][Z2M] multi-concept JSON 미구현 → placeholder 구성');
      // placeholder with conceptBlocks
      styles = conceptBlocks.map(c=>{
        const imagePrompts=[];
        for(let i=1;i<=sceneCountPerConcept;i++){
          imagePrompts.push({
            sceneNumber:i,
            title:`Scene ${i}`,
            duration:2,
            prompt:`${c.concept_name} placeholder scene ${i}, insanely detailed, micro-details, hyper-realistic textures, visible skin pores, 4K, sharp focus. Shot by ARRI Alexa Mini with a 50mm lens.`
          });
        }
        return {
          concept_id: c.concept_id,
          style: c.concept_name,
          name: c.concept_name,
          summary: 'Placeholder (JSON fallback)',
          keywords: [],
          imagePrompts
        };
      });
    }

    if(styles.length!==6){
      console.warn('[storyboard-init][Z2M] styles length !=6 최종 보정');
      const existing = new Set(styles.map(s=>s.concept_id));
      for(let i=1;i<=6;i++){
        if(!existing.has(i)){
          const imagePrompts=[];
            for(let k=1;k<=sceneCountPerConcept;k++){
            imagePrompts.push({
              sceneNumber:k,
              title:`Scene ${k}`,
              duration:2,
              prompt:`Concept ${i} auto-filled scene ${k}, insanely detailed, micro-details, hyper-realistic textures, visible skin pores, 4K, sharp focus. Shot by RED Komodo with a 50mm lens.`
            });
          }
          styles.push({
            concept_id:i,
            style:`Concept ${i}`,
            name:`Concept ${i}`,
            summary:'Auto-filled',
            keywords:[],
            imagePrompts
          });
        }
      }
      styles.sort((a,b)=>a.concept_id-b.concept_id);
    }

    res.status(200).json({
      success:true,
      styles,
      // 호환: 옛 Step2가 imagePrompts 사용하므로 첫 컨셉의 프롬프트를 제공
      imagePrompts: styles[0]?.imagePrompts || [],
      metadata:{
        videoLengthSeconds,
        sceneCountPerConcept,
        totalImagesExpected: styles.length * sceneCountPerConcept,
        modelChain: MODEL_CHAIN,
        totalMs: Date.now()-t0,
        step1Model: step1.model,
        step2Model: step2.model,
        multiConceptJsonParsed: !!(mcJson && mcJson.concepts),
        conceptsDetectedFromStep1: conceptBlocks.length,
        z2multi:true
      }
    });

  }catch(e){
    console.error('[storyboard-init][Z2M] 오류', e);
    res.status(500).json({success:false,error:e.message});
  }finally{
    console.log('================ [storyboard-init][Z2M] END ================');
  }
}

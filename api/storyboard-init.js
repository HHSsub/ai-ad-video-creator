import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

/* =========================================================
   2-STEP CHAIN (input_second_prompt → final_prompt)
   🔥 FIX: 컨셉 헤더 패턴 정규식 개선 + 더 관대한 파싱
   STEP1: 6개 컨셉 전략/묘사 (템플릿 내부 {duration} {scene_count} {videoLengthSeconds} {targetSceneCount} 치환)
   STEP2: 6개 컨셉 * sceneCountPerConcept 이미지 JSON (혹은 fallback) 생성
   프롬프트 텍스트 자체 내용(문장) 변경 금지. 변수 치환만 추가.
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
const FINAL_PROMPT        = loadTxt('final_prompt.txt');        // STEP2 (JSON)

/* ---------------- 기본 유틸 ---------------- */
function parseVideoLengthSeconds(raw){
  if(raw == null) return 10;
  if(typeof raw === 'number') return raw;
  // 문자열에서 숫자만 추출 (예: "10초", " 10 s", "10s")
  const m = String(raw).match(/\d+/);
  if(!m) return 10;
  const n = parseInt(m[0],10);
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
function buildStep1Prompt(fd, videoLengthSeconds, sceneCountPerConcept){
  if(!INPUT_SECOND_PROMPT) throw new Error('input_second_prompt.txt 누락');

  // 원문 유지 + 변수 치환 (추가: {videoLengthSeconds} {targetSceneCount} {duration} {scene_count})
  let p = INPUT_SECOND_PROMPT
    .replaceAll('{brandName}', String(fd.brandName||''))
    .replaceAll('{industryCategory}', String(fd.industryCategory||''))
    .replaceAll('{productServiceCategory}', String(fd.productServiceCategory||''))
    .replaceAll('{productServiceName}', String(fd.productServiceName||''))
    .replaceAll('{videoPurpose}', String(fd.videoPurpose||''))
    .replaceAll('{videoLength}', String(fd.videoLength|| (videoLengthSeconds+'초')))
    .replaceAll('{coreTarget}', String(fd.coreTarget||''))
    .replaceAll('{coreDifferentiation}', String(fd.coreDifferentiation||''))
    .replaceAll('{videoRequirements}', String(fd.videoRequirements||''))
    .replaceAll('{brandLogo}', fd.brandLogo ? '업로드됨':'없음')
    .replaceAll('{productImage}', fd.productImage ? '업로드됨':'없음')
    .replaceAll('{aspectRatioCode}', mapAspectRatio(fd))

    // 추가 치환
    .replaceAll('{videoLengthSeconds}', String(videoLengthSeconds))
    .replaceAll('{targetSceneCount}', String(sceneCountPerConcept))
    .replaceAll('{duration}', String(videoLengthSeconds))
    .replaceAll('{scene_count}', String(sceneCountPerConcept));

  return p;
}

/* ---------------- 🔥 FIX: STEP1 컨셉 블록 추출 - 개선된 정규식 ---------------- */
function extractConceptBlocks(raw){
  if(!raw) return [];
  
  // 🔥 더 관대한 컨셉 헤더 패턴 (한글, 숫자, 공백 허용)
  const patterns = [
    /\*\*\s*(\d+)\.\s*컨셉:\s*([^\*\n]+?)\s*\*\*/g,          // **1. 컨셉: 이름**
    /\*\*\s*컨셉\s*(\d+):\s*([^\*\n]+?)\s*\*\*/g,            // **컨셉 1: 이름**
    /\*\*\s*(\d+)\s*\.\s*([^\*\n]+?)\s*\*\*/g,               // **1. 이름**
    /## \s*(\d+)\.\s*컨셉:\s*([^\n]+)/g,                      // ## 1. 컨셉: 이름
    /### \s*(\d+)\.\s*컨셉:\s*([^\n]+)/g,                     // ### 1. 컨셉: 이름
    /(\d+)\.\s*컨셉:\s*([^\n\*]+)/g,                          // 1. 컨셉: 이름 (일반 텍스트)
    /\*\*\s*(\d+)\s*[\.:]?\s*([가-힣\w\s]+?)\s*\*\*/g        // **1 이름** 또는 **1. 이름**
  ];
  
  const matches = [];
  
  // 여러 패턴으로 시도
  for (const pattern of patterns) {
    let m;
    pattern.lastIndex = 0; // 정규식 상태 초기화
    
    while ((m = pattern.exec(raw)) !== null) {
      const idx = parseInt(m[1], 10);
      const name = (m[2] || '').trim();
      
      if (idx >= 1 && idx <= 6 && name.length > 0) {
        matches.push({ 
          idx, 
          name, 
          start: m.index,
          fullMatch: m[0]
        });
        console.log(`[extractConceptBlocks] 패턴 발견: ${idx}. ${name} (pos: ${m.index})`);
      }
    }
    
    // 충분한 매치를 찾으면 더 이상 패턴 시도하지 않음
    if (matches.length >= 3) break;
  }
  
  console.log(`[extractConceptBlocks] 총 ${matches.length}개 컨셉 헤더 발견`);
  
  if (matches.length === 0) {
    console.warn('[storyboard-init][Z2M] 🔥 컨셉 헤더 패턴 미검출 - 자동 생성 모드');
    return generateFallbackConcepts();
  }
  
  // 시작 위치 순으로 정렬
  matches.sort((a, b) => a.start - b.start);
  
  // 블록 내용 추출
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    cur.block = raw.slice(cur.start, next ? next.start : raw.length).trim();
  }
  
  // 컨셉 맵 생성 (중복 제거)
  const conceptMap = new Map();
  for (const c of matches) {
    if (c.idx >= 1 && c.idx <= 6 && !conceptMap.has(c.idx)) {
      conceptMap.set(c.idx, {
        concept_id: c.idx, 
        concept_name: c.name, 
        raw_block: c.block
      });
    }
  }
  
  // 1-6 순서대로 배열 생성
  const out = [];
  for (let i = 1; i <= 6; i++) {
    if (conceptMap.has(i)) {
      out.push(conceptMap.get(i));
    }
  }
  
  // 부족한 컨셉은 자동 생성으로 채움
  if (out.length < 6) {
    console.warn(`[extractConceptBlocks] 추출된 컨셉 수 ${out.length}/6 -> 자동 생성으로 채움`);
    const fallbackConcepts = generateFallbackConcepts();
    
    for (let i = 1; i <= 6; i++) {
      if (!out.find(o => o.concept_id === i)) {
        const fallback = fallbackConcepts.find(f => f.concept_id === i);
        if (fallback) {
          out.push(fallback);
        }
      }
    }
  }
  
  // 최종 정렬
  out.sort((a, b) => a.concept_id - b.concept_id);
  
  console.log(`[extractConceptBlocks] 최종 컨셉 수: ${out.length}/6`);
  return out;
}

/* ---------------- 🔥 FIX: 폴백 컨셉 자동 생성 ---------------- */
function generateFallbackConcepts() {
  return [
    {
      concept_id: 1,
      concept_name: "욕망의 시각화",
      raw_block: "타겟 오디언스의 심리 깊숙한 곳에 내재된 근원적 욕구를 감각적이고 상징적인 비주얼로 구현합니다. 제품의 기능적 효용을 넘어, 브랜드를 소유함으로써 욕망이 실현된다는 강력한 감정적 연결고리를 형성합니다."
    },
    {
      concept_id: 2,
      concept_name: "이질적 조합의 미학",
      raw_block: "브랜드나 제품의 속성과 전혀 관련 없어 보이는 시각적, 청각적, 서사적 요소를 의도적으로 충돌시켜 시청자의 예측을 파괴합니다. 이질적인 것들의 결합이 만들어내는 초현실적이고 기묘한 아름다움을 통해 강렬한 인상을 남깁니다."
    },
    {
      concept_id: 3,
      concept_name: "핵심 가치의 극대화",
      raw_block: "브랜드가 가진 가장 강력하고 본질적인 핵심 가치 하나만을 선택하여, 그것이 세상의 유일한 법칙인 것처럼 시각적/서사적으로 극단까지 과장하여 보여줍니다. 다른 모든 장점을 포기하더라도 단 하나의 강점만큼은 확실하게 기억시키는 전략입니다."
    },
    {
      concept_id: 4,
      concept_name: "기회비용의 시각화",
      raw_block: "제품/서비스를 사용했을 때의 이점이 아닌, 사용하지 않았을 때 발생하는 손해를 구체적이고 현실감 있게 보여주는 네거티브 접근 방식입니다. 타겟이 무심코 감수하고 있던 불편함, 시간 낭비, 감정 소모 등을 시각적으로 명확히 제시합니다."
    },
    {
      concept_id: 5,
      concept_name: "트렌드 융합",
      raw_block: "타겟이 열광하는 사회문화적 트렌드(밈, 챌린지, AI 등)를 브랜드 메시지와 자연스럽게 융합합니다. 트렌드를 단순히 흉내 내는 것을 넘어, 브랜드의 오리지널리티를 더해 새로운 콘텐츠로 재창조함으로써 타겟과의 문화적 유대감을 형성합니다."
    },
    {
      concept_id: 6,
      concept_name: "파격적 반전",
      raw_block: "시청자가 특정 장르의 클리셰를 따라가도록 유도하다가, 결말 부분에서 모든 예상을 뒤엎는 파격적인 반전을 통해 브랜드 메시지를 극적으로 전달합니다. 예측 불가능한 유머를 선사하고, 시청자가 마지막까지 긴장을 놓지 못하게 만듭니다."
    }
  ];
}

/* ---------------- STEP2(final) 프롬프트 ---------------- */
function buildFinalPrompt(phase1Output, conceptBlocks, fd, sceneCountPerConcept){
  if(!FINAL_PROMPT) throw new Error('final_prompt.txt 누락');
  const videoLengthSeconds = parseVideoLengthSeconds(fd.videoLength);
  const aspectRatioCode = mapAspectRatio(fd);

  const conceptsForPrompt = conceptBlocks
    .map(c=>`- (${c.concept_id}) ${c.concept_name}: ${c.raw_block.slice(0,400)}`)
    .join('\n');

  // final_prompt.txt에서 Flux 규칙, styling, motion_prompt, seed, etc.를 모두 강제
  const override = `
[OVERRIDE MULTI-CONCEPT JSON OUTPUT – IGNORE ANY PREVIOUS SINGLE "scenes" SPEC]

Return EXACTLY ONE VALID JSON object:

{
  "project_meta":{
    "brand":"${fd.brandName||''}",
    "product_or_category":"${fd.productServiceName||fd.productServiceCategory||''}",
    "industry":"${fd.industryCategory||''}",
    "target":"${fd.coreTarget||''}",
    "purpose":"${fd.videoPurpose||''}",
    "differentiation":"${fd.coreDifferentiation||''}",
    "video_length_seconds":${videoLengthSeconds},
    "aspect_ratio":"${aspectRatioCode}",
    "logo_provided": ${fd.brandLogo? 'true':'false'},
    "product_image_provided": ${fd.productImage? 'true':'false'}
  },
  "concepts":[
    {
      "concept_id":1,
      "concept_name":"<must match original concept 1 name>",
      "image_prompts":[
        {
          "scene_number":1,
          "timecode":"00:00-00:02",
          "image_prompt":{
            "prompt":"[English, 7-part Flux Engine format, ends with camera sentence]",
            "negative_prompt":"blurry, low quality, watermark, logo, text, cartoon, distorted",
            "num_images":1,
            "image":{"size":"${aspectRatioCode}"},
            "styling":{
              "style":"photo/cinematic/etc.",
              "color":"color/vibrant/monochrome/etc.",
              "lighting":"natural/dramatic/soft/etc."
            },
            "guidance_scale":7.5,
            "seed":12345,
            "filter_nsfw":true
          },
          "motion_prompt":{"prompt":"[English, dynamic action only]"},
          "duration_seconds":2
        }
        // scene_number 2..${sceneCountPerConcept} 까지
      ]
    }
    // concept_id 2..6 EXACT SAME STRUCTURE, each EXACTLY ${sceneCountPerConcept} scenes
  ]
}

MANDATORY RULES:
- EXACTLY 6 concepts.
- EACH concept has EXACTLY ${sceneCountPerConcept} scenes (no more, no less).
- All scene_number inside a concept = 1..${sceneCountPerConcept}.
- Distinct prompts across concepts.
- high-fidelity tokens; each prompt ends with camera sentence.
- Seeds: 5-digit (10000-99999) unique per (concept_id, scene_number).
- Output ONLY JSON.
- Root keys ONLY: project_meta, concepts.

REFERENCE CONCEPT MATERIAL:
${conceptsForPrompt}
[END OVERRIDE]`;

  return `${FINAL_PROMPT}\n\n${override}`;
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
    // 최신 구조: concepts[ { concept_id, concept_name, image_prompts:[{scene_number, image_prompt, motion_prompt, ...}] } ]
    if(Array.isArray(obj.concepts) && obj.concepts.length===6){
      // 각 image_prompt/motion_prompt 구조 강제 확인
      for(const concept of obj.concepts){
        if(!Array.isArray(concept.image_prompts) || concept.image_prompts.length<1){
          console.warn('[storyboard-init][Z2M] image_prompts missing in concept', concept.concept_id);
          return null;
        }
        for(const s of concept.image_prompts){
          if(!s.image_prompt || !s.motion_prompt){
            console.warn('[storyboard-init][Z2M] image_prompt/motion_prompt missing in scene', s.scene_number);
            return null;
          }
        }
      }
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
    // 씬 개수 보장
    if(arr.length < sceneCountPerConcept && arr.length>0){
      const last = arr[arr.length-1];
      while(arr.length < sceneCountPerConcept){
        // 마지막 씬 복제해 채움 (seed만 변경)
        arr.push({...last, scene_number: arr.length+1, image_prompt:{...last.image_prompt, seed: Math.floor(10000 + Math.random()*90000)}});
      }
    }
    // 완전히 비어있으면 placeholder 생성
    if(arr.length === 0){
      for(let i=1;i<=sceneCountPerConcept;i++){
        arr.push({
          scene_number:i,
          timecode:`00:${String((i-1)*2).padStart(2,'0')}-00:${String(i*2).padStart(2,'0')}`,
          image_prompt:{
            prompt:`Concept ${c.concept_name||'Concept'} placeholder scene ${i}. Insanely detailed, hyper-realistic, sharp focus, 8K, micro-details, cinematic lighting, ends with: Shot by ARRI Alexa Mini with a 50mm lens.`,
            negative_prompt:"blurry, low quality, watermark, logo, text, cartoon, distorted",
            num_images:1,
            image:{ size:'widescreen_16_9' },
            styling:{ style:'photo', color:'color', lighting:'natural' },
            guidance_scale:7.5,
            seed: Math.floor(10000 + Math.random()*90000),
            filter_nsfw:true
          },
          motion_prompt:{ prompt:'Subtle camera drift.'},
          duration_seconds:2
        });
      }
    }
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
        prompt: sc.image_prompt?.prompt || 'Fallback prompt, insanely detailed, micro-details, hyper-realistic textures, visible skin pores, 8K, sharp focus. Shot by ARRI Alexa Mini with a 50mm lens.',
        negative_prompt: sc.image_prompt?.negative_prompt || "blurry, low quality, watermark, logo, text, cartoon, distorted",
        styling: sc.image_prompt?.styling || { style:"photo", color:"color", lighting:"natural" },
        size: sc.image_prompt?.image?.size || "widescreen_16_9",
        guidance_scale: sc.image_prompt?.guidance_scale || 7.5,
        seed: sc.image_prompt?.seed || Math.floor(10000 + Math.random()*90000),
        filter_nsfw: sc.image_prompt?.filter_nsfw !== undefined ? sc.image_prompt.filter_nsfw : true,
        motion_prompt: sc.motion_prompt?.prompt || "Subtle camera drift.",
        timecode: sc.timecode || "",
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
    const step1Prompt = buildStep1Prompt(formData, videoLengthSeconds, sceneCountPerConcept);
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
      styles = conceptBlocks.map(c=>{
        const imagePrompts=[];
        for(let i=1;i<=sceneCountPerConcept;i++){
          imagePrompts.push({
            sceneNumber:i,
            title:`Scene ${i}`,
            duration:2,
            prompt:`${c.concept_name} placeholder scene ${i}. Insanely detailed, hyper-realistic, 8K, sharp focus, cinematic lighting. Shot by ARRI Alexa Mini with a 50mm lens.`,
            negative_prompt:"blurry, low quality, watermark, logo, text, cartoon, distorted",
            styling:{ style:"photo", color:"color", lighting:"natural" },
            size:"widescreen_16_9",
            guidance_scale:7.5,
            seed: Math.floor(10000 + Math.random()*90000),
            filter_nsfw:true,
            motion_prompt:"Subtle camera drift.",
            timecode:`00:${String((i-1)*2).padStart(2,'0')}-00:${String(i*2).padStart(2,'0')}`,
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
              prompt:`Concept ${i} auto-filled scene ${k}. Insanely detailed, hyper-realistic, 8K, sharp focus, cinematic lighting. Shot by RED Komodo with a 50mm lens.`,
              negative_prompt:"blurry, low quality, watermark, logo, text, cartoon, distorted",
              styling:{ style:"photo", color:"color", lighting:"natural" },
              size:"widescreen_16_9",
              guidance_scale:7.5,
              seed: Math.floor(10000 + Math.random()*90000),
              filter_nsfw:true,
              motion_prompt:"Subtle camera drift.",
              timecode:`00:${String((k-1)*2).padStart(2,'0')}-00:${String(k*2).padStart(2,'0')}`,
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
        z2multi:true,
        conceptBlocksGenerated: conceptBlocks.length === 0 ? 'fallback_auto_generated' : 'extracted_from_gemini'
      }
    });

  }catch(e){
    console.error('[storyboard-init][Z2M] 오류', e);
    res.status(500).json({success:false,error:e.message});
  }finally{
    console.log('================ [storyboard-init][Z2M] END ================');
  }
}

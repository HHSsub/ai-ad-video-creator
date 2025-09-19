// api/storyboard-init.js - 파일 읽기 문제 해결 + 안정성 강화

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

/* =========================================================
   수정사항:
   1. 파일 읽기 로직을 인라인 프롬프트로 변경
   2. 환경변수 로딩 순서 수정
   3. 에러 핸들링 강화
   4. fallback 로직 개선
========================================================= */

// 🔥 수정: 외부 파일 대신 인라인 프롬프트 사용
const INPUT_SECOND_PROMPT = `당신은 업계 최상위 크리에이티브 디렉터(Creative Director)이자 브랜드 전략가(Brand Strategist)입니다. 사용자가 제공하는 핵심 정보를 바탕으로 6가지 창의적 컨셉을 생성하세요.

다음 정보를 기반으로 6장면의 스토리보드와 각 장면별 이미지 생성을 위한 구체적인 지침을 작성하세요:

{USER_INPUT}

출력 구조:
# {brandName} 광고 영상 기획 제안서
---
## 1. 컨셉 기획 (총 6가지)
### **1. 욕망의 시각화**
- **테마**: 타겟 오디언스의 심리 깊숙한 곳에 내재된 근원적 욕구를 감각적이고 상징적인 비주얼로 구현
- **스토리라인**: 제품의 핵심 가치와 사용자의 갈망을 연결하는 감성적 서사
- **타겟 오디언스**: {coreTarget}
- **감정/시각적 요소**: 따뜻하고 감성적인 톤, 부드러운 조명, 자연스러운 색감

### **2. 이질적 조합의 미학**
- **테마**: 브랜드나 제품의 속성과 전혀 관련 없어 보이는 시각적 요소를 의도적으로 조합
- **스토리라인**: 예상치 못한 조합을 통한 독창성과 기억에 남는 임팩트
- **감정/시각적 요소**: 대비가 강한 시각적 요소, 예상을 뒤엎는 구성

### **3. 핵심 가치의 극대화**
- **테마**: 브랜드의 가장 강력한 핵심 가치 하나를 선택하여 극단까지 강조
- **스토리라인**: 핵심 차별점을 중심으로 한 강력한 메시지 전달
- **감정/시각적 요소**: 명확하고 직관적인 비주얼, 강렬한 색감

### **4. 기회비용의 시각화**
- **테마**: 제품을 사용하지 않았을 때 발생하는 손해를 구체적으로 시각화
- **스토리라인**: 문제 상황과 해결책의 극적 대비
- **감정/시각적 요소**: 문제 상황의 긴장감과 해결 후의 안도감

### **5. 트렌드 융합**
- **테마**: 타겟이 열광하는 사회문화적 트렌드와 브랜드 메시지의 자연스러운 융합
- **스토리라인**: 최신 트렌드를 활용한 친근하고 재미있는 접근
- **감정/시각적 요소**: 현대적이고 트렌디한 비주얼, 활기찬 분위기

### **6. 파격적 반전**
- **테마**: 시청자의 예상을 완전히 뒤엎는 파격적인 반전을 통한 브랜드 메시지 전달
- **스토리라인**: 클리셰를 따라가다가 결말에서 모든 예상을 뒤엎는 구조
- **감정/시각적 요소**: 극적인 전환, 서프라이즈 요소

---
## 2. 스토리보드 (총 6가지)
각 컨셉별로 {targetSceneCount}개의 장면으로 구성된 상세 스토리보드를 제시하세요.`;

const FINAL_PROMPT = `[PHASE 2 — JSON GENERATION ONLY]
Role: You are an expert video director and VFX supervisor specializing in creating hyper-realistic, professional video ads using AI. Your primary function is to translate a creative storyboard into a flawless set of machine-readable prompts for the Freepik image generation model.

Objective: Generate a detailed, production-ready shot list from the user-provided Input Details. This involves creating hyper-specific image prompts and corresponding motion prompts for each scene.

# OUTPUT FORMAT
Return EXACTLY ONE VALID JSON object:

{
  "project_meta":{
    "brand":"{brandName}",
    "product_or_category":"{productServiceCategory}",
    "industry":"{industryCategory}",
    "target":"{coreTarget}",
    "purpose":"{videoPurpose}",
    "differentiation":"{coreDifferentiation}",
    "video_length_seconds":{videoLengthSeconds},
    "aspect_ratio":"{aspectRatioCode}",
    "logo_provided": {brandLogo},
    "product_image_provided": {productImage}
  },
  "concepts":[
    {
      "concept_id":1,
      "concept_name":"욕망의 시각화",
      "image_prompts":[
        {
          "scene_number":1,
          "timecode":"00:00-00:02",
          "image_prompt":{
            "prompt":"[English, 7-part format, ends with camera sentence]",
            "negative_prompt":"blurry, low quality, watermark, logo, text, cartoon, distorted",
            "num_images":1,
            "image":{"size":"{aspectRatioCode}"},
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
      ]
    }
  ]
}

MANDATORY RULES:
- EXACTLY 6 concepts.
- EACH concept has EXACTLY {targetSceneCount} scenes.
- All scene_number inside a concept = 1..{targetSceneCount}.
- Seeds: 5-digit (10000-99999) unique per (concept_id, scene_number).
- Output ONLY JSON.
- Root keys ONLY: project_meta, concepts.`;

/* ---------------- 기존 유틸 함수들 유지 ---------------- */
function parseVideoLengthSeconds(raw){
  if(raw == null) return 10;
  if(typeof raw === 'number') return raw;
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

/* ---------------- 🔥 수정: 환경변수 로딩 개선 ---------------- */
function getGeminiApiKey() {
  // 우선순위: GEMINI_API_KEY > VITE_GEMINI_API_KEY > REACT_APP_GEMINI_API_KEY
  return process.env.GEMINI_API_KEY || 
         process.env.VITE_GEMINI_API_KEY || 
         process.env.REACT_APP_GEMINI_API_KEY;
}

/* ---------------- 기존 모델 체인 & 재시도 로직 유지 ---------------- */
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

// 🔥 수정: callGemini() 에러 핸들링 강화
async function callGemini(genAI, prompt, label){
  let attempt=0;
  const total = Math.max(MODEL_CHAIN.length*2, MAX_ATTEMPTS);

  let flashExhausted = false;
  let lastError = null;
  
  // 1차: 기존 모델 순회
  for(; attempt<total; ){
    for(const model of MODEL_CHAIN){
      for(let local=1; local<=2; local++){
        attempt++;
        console.log(`[storyboard-init] ${label} attempt ${attempt}/${total} model=${model}`);
        try{
          const g = genAI.getGenerativeModel({model});
          const t0=Date.now();
          const r = await g.generateContent(prompt);
          const text = r.response.text();
          console.log(`[storyboard-init] ${label} success model=${model} ${Date.now()-t0}ms (len=${text.length})`);
          return { text, model, took: Date.now()-t0, attempts: attempt };
        }catch(e){
          lastError = e;
          console.error(`[storyboard-init] ${label} attempt ${attempt} failed:`, e.message);
          if(!retryable(e)) throw e;
          
          if(model === 'gemini-2.5-flash' && attempt >= total) {
            flashExhausted = true;
          }
          const delay = jitter(BASE_BACKOFF*Math.pow(2, Math.floor(attempt/MODEL_CHAIN.length)));
          console.log(`[storyboard-init] ${label} retry in ${delay}ms`);
          await sleep(delay);
        }
      }
    }
    
    // flash 소진시 fallback
    if (flashExhausted) {
      try {
        const fallbackModel = MODEL_CHAIN.includes('gemini-2.5-flash-lite') ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
        const g = genAI.getGenerativeModel({model: fallbackModel});
        const t0=Date.now();
        console.warn(`[storyboard-init] ${label} fallback to ${fallbackModel}`);
        const r = await g.generateContent(prompt);
        const text = r.response.text();
        console.log(`[storyboard-init] ${label} fallback success model=${fallbackModel} ${Date.now()-t0}ms`);
        return { text, model: fallbackModel, took: Date.now()-t0, attempts: attempt+1 };
      } catch(e) {
        lastError = e;
        if(!retryable(e)) throw e;
        await sleep(jitter(BASE_BACKOFF));
      }
      break;
    }
  }
  
  let errMsg = `${label} 실패(모든 모델 소진)`;
  if (lastError && lastError.message) errMsg += `: ${lastError.message}`;
  throw new Error(errMsg);
}

/* ---------------- 🔥 NEW: PRODUCT COMPOSITING SCENE 감지 함수 ---------------- */
function detectProductCompositingScenes(storyboardText, videoPurpose) {
  const compositingScenes = [];
  
  // [PRODUCT COMPOSITING SCENE] 패턴 직접 검색
  const explicitPattern = /\[PRODUCT COMPOSITING SCENE\]/gi;
  const explicitMatches = storyboardText.match(explicitPattern);
  
  if (explicitMatches) {
    console.log(`[detectProductCompositingScenes] 명시적 PRODUCT COMPOSITING SCENE 발견: ${explicitMatches.length}개`);
    
    // 각 매치 위치 찾기
    let searchPos = 0;
    storyboardText.replace(explicitPattern, (match, offset) => {
      const beforeText = storyboardText.slice(0, offset);
      const sceneMatches = beforeText.match(/S#(\d+)/g);
      if (sceneMatches && sceneMatches.length > 0) {
        const lastScene = sceneMatches[sceneMatches.length - 1];
        const sceneNumber = parseInt(lastScene.replace('S#', ''), 10);
        compositingScenes.push({
          sceneNumber,
          explicit: true,
          context: 'PRODUCT_COMPOSITING_SCENE'
        });
        console.log(`[detectProductCompositingScenes] Scene ${sceneNumber}에서 명시적 합성 지점 발견`);
      }
      return match;
    });
  } else {
    // 백업: 영상 목적에 따른 자동 감지
    console.log(`[detectProductCompositingScenes] 명시적 지점 없음, 영상 목적(${videoPurpose})에 따른 자동 감지`);
    
    if (videoPurpose === '구매 전환') {
      compositingScenes.push({
        sceneNumber: 2,
        explicit: false,
        context: 'AUTO_PURCHASE_CONVERSION'
      });
    } else {
      const sceneMatches = storyboardText.match(/S#(\d+)/g);
      if (sceneMatches && sceneMatches.length > 0) {
        const lastSceneMatch = sceneMatches[sceneMatches.length - 1];
        const lastSceneNumber = parseInt(lastSceneMatch.replace('S#', ''), 10);
        compositingScenes.push({
          sceneNumber: lastSceneNumber,
          explicit: false,
          context: 'AUTO_BRAND_AWARENESS'
        });
      }
    }
  }
  
  return compositingScenes;
}

/* ---------------- 기존 STEP1 프롬프트 빌더 유지 ---------------- */
function buildStep1Prompt(fd, videoLengthSeconds, sceneCountPerConcept){
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
    .replaceAll('{videoLengthSeconds}', String(videoLengthSeconds))
    .replaceAll('{targetSceneCount}', String(sceneCountPerConcept))
    .replaceAll('{duration}', String(videoLengthSeconds))
    .replaceAll('{scene_count}', String(sceneCountPerConcept))
    .replaceAll('{USER_INPUT}', `
브랜드명: ${fd.brandName}
산업 카테고리: ${fd.industryCategory}
제품/서비스 카테고리: ${fd.productServiceCategory}
제품/서비스명: ${fd.productServiceName || '일반'}
영상 목적: ${fd.videoPurpose}
영상 길이: ${fd.videoLength}
핵심 타겟: ${fd.coreTarget}
핵심 차별점: ${fd.coreDifferentiation}
영상 요구사항: ${fd.videoRequirements || '없음'}
브랜드 로고: ${fd.brandLogo ? '업로드됨 - 영상에 포함 필요' : '없음'}
제품 이미지: ${fd.productImage ? '업로드됨 - 영상에 포함 필요' : '없음'}
    `.trim());

  return p;
}

/* ---------------- 기존 컨셉 블록 추출 로직 유지 ---------------- */
function extractConceptBlocks(raw){
  if(!raw) return [];
  
  const patterns = [
    /\*\*\s*(\d+)\.\s*컨셉:\s*([^\*\n]+?)\s*\*\*/g,
    /\*\*\s*컨셉\s*(\d+):\s*([^\*\n]+?)\s*\*\*/g,
    /\*\*\s*(\d+)\s*\.\s*([^\*\n]+?)\s*\*\*/g,
    /## \s*(\d+)\.\s*컨셉:\s*([^\n]+)/g,
    /### \s*(\d+)\.\s*컨셉:\s*([^\n]+)/g,
    /(\d+)\.\s*컨셉:\s*([^\n\*]+)/g,
    /\*\*\s*(\d+)\s*[\.:]?\s*([가-힣\w\s]+?)\s*\*\*/g
  ];
  
  const matches = [];
  
  for (const pattern of patterns) {
    let m;
    pattern.lastIndex = 0;
    
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
    
    if (matches.length >= 3) break;
  }
  
  console.log(`[extractConceptBlocks] 총 ${matches.length}개 컨셉 헤더 발견`);
  
  if (matches.length === 0) {
    console.warn('[storyboard-init] 🔥 컨셉 헤더 패턴 미검출 - 자동 생성 모드');
    return generateFallbackConcepts();
  }
  
  matches.sort((a, b) => a.start - b.start);
  
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    cur.block = raw.slice(cur.start, next ? next.start : raw.length).trim();
  }
  
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
  
  const out = [];
  for (let i = 1; i <= 6; i++) {
    if (conceptMap.has(i)) {
      out.push(conceptMap.get(i));
    }
  }
  
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
  
  out.sort((a, b) => a.concept_id - b.concept_id);
  
  console.log(`[extractConceptBlocks] 최종 컨셉 수: ${out.length}/6`);
  return out;
}

function generateFallbackConcepts() {
  return [
    {
      concept_id: 1,
      concept_name: "욕망의 시각화",
      raw_block: "타겟 오디언스의 심리 깊숙한 곳에 내재된 근원적 욕구를 감각적이고 상징적인 비주얼로 구현합니다."
    },
    {
      concept_id: 2,
      concept_name: "이질적 조합의 미학",
      raw_block: "브랜드나 제품의 속성과 전혀 관련 없어 보이는 시각적, 청각적, 서사적 요소를 의도적으로 충돌시켜 시청자의 예측을 파괴합니다."
    },
    {
      concept_id: 3,
      concept_name: "핵심 가치의 극대화",
      raw_block: "브랜드가 가진 가장 강력하고 본질적인 핵심 가치 하나만을 선택하여, 그것이 세상의 유일한 법칙인 것처럼 시각적/서사적으로 극단까지 강조합니다."
    },
    {
      concept_id: 4,
      concept_name: "기회비용의 시각화",
      raw_block: "제품/서비스를 사용했을 때의 이점이 아닌, 사용하지 않았을 때 발생하는 손해를 구체적이고 현실감 있게 보여주는 네거티브 접근 방식입니다."
    },
    {
      concept_id: 5,
      concept_name: "트렌드 융합",
      raw_block: "타겟이 열광하는 사회문화적 트렌드(밈, 챌린지, AI 등)를 브랜드 메시지와 자연스럽게 융합합니다."
    },
    {
      concept_id: 6,
      concept_name: "파격적 반전",
      raw_block: "시청자가 특정 장르의 클리셰를 따라가도록 유도하다가, 결말 부분에서 모든 예상을 뒤엎는 파격적인 반전을 통해 브랜드 메시지를 극적으로 전달합니다."
    }
  ];
}

/* ---------------- 기존 STEP2 프롬프트 빌더 유지 ---------------- */
function buildFinalPrompt(phase1Output, conceptBlocks, fd, sceneCountPerConcept){
  const videoLengthSeconds = parseVideoLengthSeconds(fd.videoLength);
  const aspectRatioCode = mapAspectRatio(fd);

  const conceptsForPrompt = conceptBlocks
    .map(c=>`- (${c.concept_id}) ${c.concept_name}: ${c.raw_block.slice(0,400)}`)
    .join('\n');

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
            "prompt":"[English, 7-part format, ends with camera sentence]",
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
      ]
    }
  ]
}

MANDATORY RULES:
- EXACTLY 6 concepts.
- EACH concept has EXACTLY ${sceneCountPerConcept} scenes (no more, no less).
- All scene_number inside a concept = 1..${sceneCountPerConcept}.
- Distinct prompts across concepts.
- Seeds: 5-digit (10000-99999) unique per (concept_id, scene_number).
- Output ONLY JSON.
- Root keys ONLY: project_meta, concepts.

REFERENCE CONCEPT MATERIAL:
${conceptsForPrompt}
[END OVERRIDE]`;

  return `${FINAL_PROMPT}\n\n${override}`;
}

/* ---------------- 기존 JSON 파싱 로직 유지 ---------------- */
function parseMultiConceptJSON(raw){
  if(!raw) return null;
  const first = raw.indexOf('{');
  const last  = raw.lastIndexOf('}');
  if(first<0 || last<0 || last<=first) return null;
  const slice = raw.slice(first, last+1);
  try{
    const obj = JSON.parse(slice);
    if(Array.isArray(obj.concepts) && obj.concepts.length===6){
      for(const concept of obj.concepts){
        if(!Array.isArray(concept.image_prompts) || concept.image_prompts.length<1){
          console.warn('[storyboard-init] image_prompts missing in concept', concept.concept_id);
          return null;
        }
        for(const s of concept.image_prompts){
          if(!s.image_prompt || !s.motion_prompt){
            console.warn('[storyboard-init] image_prompt/motion_prompt missing in scene', s.scene_number);
            return null;
          }
        }
      }
      return obj;
    }
    console.warn('[storyboard-init] JSON concepts 형식 불완전');
    return obj;
  }catch(e){
    console.warn('[storyboard-init] JSON 파싱 실패:', e.message);
    return null;
  }
}

/* ---------------- 🔥 UPDATED: 합성 정보 포함 styles 구성 ---------------- */
function buildStylesFromConceptJson(conceptJson, sceneCountPerConcept, compositingScenes, formData){
  if(!conceptJson?.concepts) return [];
  
  return conceptJson.concepts.map(c=>{
    let arr = Array.isArray(c.image_prompts)? c.image_prompts : [];
    
    if(arr.length < sceneCountPerConcept && arr.length>0){
      const last = arr[arr.length-1];
      while(arr.length < sceneCountPerConcept){
        arr.push({...last, scene_number: arr.length+1, image_prompt:{...last.image_prompt, seed: Math.floor(10000 + Math.random()*90000)}});
      }
    }
    
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
    
    // 🔥 NEW: 각 이미지 프롬프트에 합성 정보 추가
    const imagePrompts = arr.map(sc=>{
      const isCompositingScene = compositingScenes.some(cs => cs.sceneNumber === sc.scene_number);
      
      return {
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
        // 🔥 NEW: 합성 관련 정보 추가
        isCompositingScene: isCompositingScene,
        compositingInfo: isCompositingScene ? {
          needsProductImage: formData.productImageProvided || false,
          needsBrandLogo: formData.brandLogoProvided || false,
          compositingContext: compositingScenes.find(cs => cs.sceneNumber === sc.scene_number)?.context || 'unknown'
        } : null
      };
    });

    return {
      concept_id: c.concept_id,
      style: c.concept_name,
      name: c.concept_name,
      summary: c.summary || `Generated concept ${c.concept_name}`,
      keywords: [],
      imagePrompts: imagePrompts
    };
  });
}

/* ---------------- 메인 핸들러 - 🔥 강화된 에러 처리 ---------------- */
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const t0=Date.now();
  console.log('================ [storyboard-init] START ================');

  try{
    const { formData } = req.body || {};
    if(!formData) {
      console.error('[storyboard-init] formData 누락');
      return res.status(400).json({error:'formData required'});
    }

    // 🔥 수정: API 키 확인 강화
    const apiKey = getGeminiApiKey();
    if(!apiKey) {
      console.error('[storyboard-init] Gemini API Key 누락 - 환경변수 확인 필요');
      console.error('환경변수 상태:', {
        GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
        VITE_GEMINI_API_KEY: !!process.env.VITE_GEMINI_API_KEY,
        REACT_APP_GEMINI_API_KEY: !!process.env.REACT_APP_GEMINI_API_KEY
      });
      return res.status(500).json({
        error: 'Gemini API Key 누락',
        details: 'GEMINI_API_KEY 환경변수를 설정해주세요'
      });
    }

    console.log('[storyboard-init] API 키 확인 완료:', apiKey.substring(0, 10) + '...');
    
    const gen = new GoogleGenerativeAI(apiKey);

    const videoLengthSeconds = parseVideoLengthSeconds(formData.videoLength);
    const sceneCountPerConcept = calcSceneCountPerConcept(videoLengthSeconds);

    console.log(`[storyboard-init] videoLengthSeconds=${videoLengthSeconds} sceneCountPerConcept=${sceneCountPerConcept}`);

    /* STEP1 */
    const step1Prompt = buildStep1Prompt(formData, videoLengthSeconds, sceneCountPerConcept);
    console.log('[storyboard-init] STEP1 promptLen=', step1Prompt.length);
    const step1 = await callGemini(gen, step1Prompt, 'STEP1');
    const phase1_output = step1.text;

    // 🔥 NEW: PRODUCT COMPOSITING SCENE 감지
    const compositingScenes = detectProductCompositingScenes(phase1_output, formData.videoPurpose);
    console.log('[storyboard-init] 감지된 합성 씬:', compositingScenes);

    const conceptBlocks = extractConceptBlocks(phase1_output);

    /* STEP2 */
    const step2Prompt = buildFinalPrompt(phase1_output, conceptBlocks, formData, sceneCountPerConcept);
    console.log('[storyboard-init] STEP2 promptLen=', step2Prompt.length);
    const step2 = await callGemini(gen, step2Prompt, 'STEP2');

    const mcJson = parseMultiConceptJSON(step2.text);

    let styles=[];
    if(mcJson && Array.isArray(mcJson.concepts) && mcJson.concepts.length===6){
      // 🔥 UPDATED: 합성 정보 포함하여 styles 구성
      styles = buildStylesFromConceptJson(mcJson, sceneCountPerConcept, compositingScenes, formData);
      console.log('[storyboard-init] multi-concept JSON 파싱 성공 (6 concepts)');
    } else {
      console.warn('[storyboard-init] multi-concept JSON 미구현 → placeholder 구성');
      styles = conceptBlocks.map(c=>{
        const imagePrompts=[];
        for(let i=1;i<=sceneCountPerConcept;i++){
          const isCompositingScene = compositingScenes.some(cs => cs.sceneNumber === i);
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
            // 🔥 NEW: 합성 정보 추가
            isCompositingScene: isCompositingScene,
            compositingInfo: isCompositingScene ? {
              needsProductImage: formData.productImageProvided || false,
              needsBrandLogo: formData.brandLogoProvided || false,
              compositingContext: compositingScenes.find(cs => cs.sceneNumber === i)?.context || 'fallback'
            } : null
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
      console.warn('[storyboard-init] styles length !=6 최종 보정');
      const existing = new Set(styles.map(s=>s.concept_id));
      for(let i=1;i<=6;i++){
        if(!existing.has(i)){
          const imagePrompts=[];
          for(let k=1;k<=sceneCountPerConcept;k++){
            const isCompositingScene = compositingScenes.some(cs => cs.sceneNumber === k);
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
              // 🔥 NEW: 합성 정보 추가
              isCompositingScene: isCompositingScene,
              compositingInfo: isCompositingScene ? {
                needsProductImage: formData.productImageProvided || false,
                needsBrandLogo: formData.brandLogoProvided || false,
                compositingContext: compositingScenes.find(cs => cs.sceneNumber === k)?.context || 'auto_filled'
              } : null
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

    // 🔥 NEW: 응답에 합성 정보 포함
    res.status(200).json({
      success:true,
      styles,
      imagePrompts: styles[0]?.imagePrompts || [],
      // 🔥 NEW: 합성 관련 메타데이터 추가
      compositingInfo: {
        scenes: compositingScenes,
        hasProductImage: formData.productImageProvided || false,
        hasBrandLogo: formData.brandLogoProvided || false,
        productImageData: formData.productImage || null,
        brandLogoData: formData.brandLogo || null
      },
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
        conceptBlocksGenerated: conceptBlocks.length === 0 ? 'fallback_auto_generated' : 'extracted_from_gemini',
        // 🔥 NEW: 합성 관련 메타데이터
        compositingScenesDetected: compositingScenes.length,
        compositingEnabled: compositingScenes.length > 0 && (formData.productImageProvided || formData.brandLogoProvided)
      }
    });

  }catch(e){
    console.error('[storyboard-init] 전체 오류:', e);
    console.error('[storyboard-init] 스택 트레이스:', e.stack);
    
    // 🔥 개선된 에러 응답
    res.status(500).json({
      success:false,
      error: e.message || 'Unknown error',
      details: {
        errorType: e.constructor.name,
        errorMessage: e.message,
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!getGeminiApiKey(),
        modelChain: MODEL_CHAIN,
        // 개발 환경에서만 스택 트레이스 포함
        ...(process.env.NODE_ENV === 'development' && { stack: e.stack })
      }
    });
  }finally{
    console.log('================ [storyboard-init] END ================');
  }
}

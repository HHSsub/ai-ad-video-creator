import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Phase1: 자연어 전략 출력
 * Phase2: 단일 JSON (모델 실수 대비 정화 + 자동복구)
 * 개선점:
 *  - 코드펜스 제거
 *  - 중괄호 균형 탐색
 *  - 누락된 콤마 패턴 자동 삽입
 *  - prompt Shot by 라인 누락 보정
 *  - negative_prompt 강제 통일
 *  - seed 5자리 정수 보정
 *  - timecode/scene_number 재계산(필요 시)
 *  - fallback JSON 생성
 *  - 단어 수 부족 시 자동 고도화 토큰 추가
 */

//////////////////// Utility ////////////////////
function mapUserAspectRatio(value) {
  if (!value || typeof value !== 'string') return 'widescreen_16_9';
  const v = value.toLowerCase();
  if (v.includes('16:9') || v.includes('가로')) return 'widescreen_16_9';
  if (v.includes('9:16') || v.includes('세로')) return 'vertical_9_16';
  if (v.includes('1:1') || v.includes('정사각')) return 'square_1_1';
  return 'widescreen_16_9';
}

function parseVideoLengthSeconds(raw) {
  if (!raw) return 10;
  const m = String(raw).match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : 10;
  return Math.max(6, Math.min(180, isNaN(n) ? 10 : n));
}
function calcSceneCount(sec) {
  return Math.max(3, Math.min(60, Math.floor(sec / 2)));
}

function loadPromptFile(filename) {
  const p = path.resolve(process.cwd(), 'public', filename);
  if (!fs.existsSync(p)) throw new Error(`프롬프트 파일 없음: ${filename}`);
  return fs.readFileSync(p, 'utf-8');
}

function injectVariables(template, formData, extra = {}) {
  const merged = { ...formData, ...extra };
  merged.brandLogo        = formData.brandLogo ? '업로드됨' : '없음';
  merged.productImage     = formData.productImage ? '업로드됨' : '없음';
  merged.brandLogoBool    = !!formData.brandLogo;
  merged.productImageBool = !!formData.productImage;
  merged.aspectRatioCode  = formData.aspectRatioCode || '';
  merged.videoLengthRaw   = formData.videoLengthRaw || formData.videoLength || '';
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) =>
    merged[k] == null ? '' : String(merged[k])
  );
}

//////////////////// Gemini ////////////////////
const MODEL_CHAIN = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  process.env.FALLBACK_GEMINI_MODEL || 'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
].filter(Boolean);
const BASE_BACKOFF = 2500;

function isRetryable(err) {
  const status = err?.status;
  const m = (err?.message || '').toLowerCase();
  if ([429,500,502,503,504].includes(status)) return true;
  if (m.includes('quota') || m.includes('rate') || m.includes('overload') || m.includes('timeout')) return true;
  return false;
}

async function callGemini(genAI, prompt, label) {
  for (const modelName of MODEL_CHAIN) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[${label}] model=${modelName} attempt=${attempt} promptLen=${prompt.length}`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.75,
            topK: 40,
            topP: 0.85,
            maxOutputTokens: 8192
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
          ]
        });
        const start = Date.now();
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        console.log(`[${label}] ✅ success len=${text.length} elapsed=${Date.now()-start}ms`);
        if (text.length < 20) throw new Error('응답 너무 짧음');
        return text;
      } catch (e) {
        console.warn(`[${label}] fail attempt=${attempt} model=${modelName} : ${e.message}`);
        if (attempt < 3 && isRetryable(e)) {
          const delay = BASE_BACKOFF * attempt + Math.random()*1000;
          console.log(`[${label}] retry in ${delay}ms`);
          await new Promise(r=>setTimeout(r,delay));
          continue;
        }
        break;
      }
    }
  }
  throw new Error(`[${label}] 모든 모델 실패`);
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY ||
         process.env.VITE_GEMINI_API_KEY ||
         process.env.REACT_APP_GEMINI_API_KEY;
}

//////////////////// JSON Clean & Parse ////////////////////
function stripCodeFences(raw) {
  return raw
    .replace(/```json/gi,'```')
    .replace(/```/g,''); // 제거
}

// 중괄호 균형 기반 JSON 추출
function extractBalancedJson(raw) {
  const first = raw.indexOf('{');
  if (first === -1) throw new Error('No "{" found');
  let depth = 0;
  for (let i = first; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return raw.slice(first, i+1);
      }
    }
  }
  throw new Error('Balanced JSON not found');
}

function fixMissingCommaAfterPrompt(jsonText) {
  // 패턴: "prompt": " ... lens."\s*"negative_prompt"
  return jsonText.replace(
    /("prompt"\s*:\s*"[^"]*Shot by [^"]+ lens\."\s*)"negative_prompt"/g,
    '$1,"negative_prompt"'
  );
}

function ensureShotBy(jsonText) {
  // prompt 속성 문자열 내부에 Shot by 없음 → 끝부분에 추가
  return jsonText.replace(/("prompt"\s*:\s*")([^"]*?)(?:"\s*,)/g, (m, head, body) => {
    if (/Shot by .* lens\./i.test(body)) return m;
    // 문장 끝 마침표 없으면 추가
    if (!body.trim().endsWith('.')) body += '.';
    body += ' Shot by professional cinema camera with a 50mm lens.';
    return `${head}${body}",`;
  });
}

// prompt 뒤 콤마 일반 패턴 (Shot by 문구 없을 수도 있는 상황)
function genericCommaPatch(jsonText) {
  return jsonText.replace(/("prompt"\s*:\s*"[^"]+")\s*"negative_prompt"/g, '$1,"negative_prompt"');
}

function sanitizeNegativePrompt(obj) {
  const FIXED = "blurry, low quality, watermark, cartoon, distorted";
  if (!obj) return;
  if (Array.isArray(obj.scenes)) {
    obj.scenes.forEach(s=>{
      if (s?.image_prompt) {
        s.image_prompt.negative_prompt = FIXED;
      }
    });
  }
}

function fixSeeds(obj) {
  if (!obj || !Array.isArray(obj.scenes)) return;
  obj.scenes.forEach(s=>{
    if (s?.image_prompt) {
      let seed = s.image_prompt.seed;
      if (typeof seed !== 'number' || seed < 10000 || seed > 99999) {
        s.image_prompt.seed = Math.floor(10000 + Math.random()*90000);
      }
    }
  });
}

function enforceShotByInObject(obj) {
  if (!obj || !Array.isArray(obj.scenes)) return;
  obj.scenes.forEach(s=>{
    if (s?.image_prompt?.prompt) {
      if (!/Shot by .* lens\./i.test(s.image_prompt.prompt)) {
        s.image_prompt.prompt = s.image_prompt.prompt.trim();
        if (!s.image_prompt.prompt.endsWith('.')) s.image_prompt.prompt += '.';
        s.image_prompt.prompt += ' Shot by professional cinema camera with a 50mm lens.';
      }
    }
  });
}

function ensureHighFidelityTokens(obj) {
  const REQUIRED = ['insanely detailed','micro-details','hyper-realistic textures','4K','sharp focus'];
  if (!obj?.scenes) return;
  obj.scenes.forEach(s=>{
    const ip = s?.image_prompt?.prompt;
    if (!ip) return;
    const lower = ip.toLowerCase();
    let missing = REQUIRED.filter(t=> !lower.includes(t));
    if (missing.length) {
      s.image_prompt.prompt = ip.replace(/(\.?\s*)$/,'') + ', ' + missing.join(', ') + '.';
    }
    // 단어 수 체크
    const words = s.image_prompt.prompt.split(/\s+/).filter(Boolean);
    if (words.length < 60) {
      s.image_prompt.prompt = s.image_prompt.prompt.replace(/(\.?\s*)$/,'') +
        ', ultra detailed lighting, cinematic depth, volumetric subtle haze.';
    }
  });
}

function rebuildTimecodes(obj, videoLengthSeconds) {
  if (!obj?.scenes) return;
  // 신뢰성 보강: scene_number 정렬 후 timecode 재계산
  const scenes = obj.scenes.slice().sort((a,b)=> (a.scene_number||0)-(b.scene_number||0));
  let t = 0;
  scenes.forEach(s=>{
    const start = t;
    const end = t + 2;
    const fmt = (sec)=> {
      const mm = String(Math.floor(sec/60)).padStart(2,'0');
      const ss = String(sec%60).padStart(2,'0');
      return `${mm}:${ss}`;
    };
    s.timecode = `${fmt(start)}-${fmt(end)}`;
    s.duration_seconds = 2;
    t += 2;
  });
  obj.scenes = scenes;
  if (obj.project_meta) obj.project_meta.video_length_seconds = videoLengthSeconds;
}

function tryParseWithCleaning(raw) {
  let work = raw;
  work = stripCodeFences(work);
  let candidate = extractBalancedJson(work);
  const original = candidate;

  const attempts = [];
  const pushAttempt = (label, fn) => {
    try {
      candidate = fn(candidate);
      attempts.push(label);
      return true;
    } catch {
      return false;
    }
  };

  // 순차 수정
  candidate = fixMissingCommaAfterPrompt(candidate);
  candidate = genericCommaPatch(candidate);
  candidate = ensureShotBy(candidate);

  // 최종 파싱
  try {
    const parsed = JSON.parse(candidate);
    return { parsed, attempts, original, cleaned: candidate };
  } catch (e) {
    // 한번 더: 콤마 누락 흔한 패턴 (Shot by 없는 prompt)
    candidate = genericCommaPatch(candidate);
    try {
      const parsed = JSON.parse(candidate);
      return { parsed, attempts: attempts.concat(['fallbackComma']), original, cleaned: candidate };
    } catch (e2) {
      throw new Error(`JSON 파싱 최종 실패: ${e2.message}`);
    }
  }
}

function buildFallbackJson({ brandName, productServiceName, productServiceCategory, coreTarget, videoPurpose, videoLengthSeconds, aspectRatioCode, sceneCount }) {
  const scenes = [];
  for (let i=0;i<Math.min(sceneCount,3);i++) {
    const start = i*2;
    const end = start+2;
    const mmss = (sec)=> {
      const mm = String(Math.floor(sec/60)).padStart(2,'0');
      const ss = String(sec%60).padStart(2,'0');
      return `${mm}:${ss}`;
    };
    scenes.push({
      scene_number: i+1,
      timecode: `${mmss(start)}-${mmss(end)}`,
      concept_reference: "fallback",
      image_prompt: {
        prompt: `Wide shot, symbolic minimal environment referencing ${productServiceName||productServiceCategory}. Highly descriptive conceptual frame, insanely detailed, micro-details, hyper-realistic textures, 4K, sharp focus. Shot by professional cinema camera with a 50mm lens.`,
        negative_prompt: "blurry, low quality, watermark, cartoon, distorted",
        num_images: 1,
        image: { size: aspectRatioCode },
        styling: { style: "photo", color: "color", lighting: "natural" },
        guidance_scale: 7.5,
        seed: Math.floor(10000 + Math.random()*90000),
        filter_nsfw: true
      },
      motion_prompt: {
        prompt: "Subtle push-in as ambient light shifts gently."
      },
      duration_seconds: 2,
      notes: "Fallback generated due to parse error."
    });
  }
  return {
    project_meta: {
      brand: brandName || '',
      product_or_category: productServiceName || productServiceCategory || '',
      industry: '',
      target: coreTarget || '',
      purpose: videoPurpose || '',
      differentiation: '',
      video_length_seconds: videoLengthSeconds,
      aspect_ratio: aspectRatioCode,
      logo_provided: false,
      product_image_provided: false
    },
    scenes
  };
}

//////////////////// Handler ////////////////////
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  const started = Date.now();
  try {
    const { formData } = req.body || {};
    if (!formData) return res.status(400).json({ error:'formData required' });

    formData.videoLengthRaw = formData.videoLength || '';
    const videoLengthSeconds = parseVideoLengthSeconds(formData.videoLengthRaw);
    const targetSceneCount = calcSceneCount(videoLengthSeconds);
    formData.aspectRatioOriginal = formData.videoAspectRatio || '';
    formData.aspectRatioCode = mapUserAspectRatio(formData.aspectRatioOriginal);

    formData.brandLogoProvided = !!(formData.brandLogoProvided || formData.brandLogo);
    formData.productImageProvided = !!(formData.productImageProvided || formData.productImage);

    console.log('[INIT]', {
      brandName: formData.brandName,
      videoLengthRaw: formData.videoLengthRaw,
      videoLengthSeconds,
      targetSceneCount,
      aspectRatioCode: formData.aspectRatioCode
    });

    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error('Gemini API Key missing');
    const genAI = new GoogleGenerativeAI(apiKey);

    // Phase1
    const phase1Template = loadPromptFile('input_second_prompt.txt');
    const phase1Prompt = injectVariables(phase1Template, formData, {
      videoLengthSeconds,
      targetSceneCount
    });
    console.log('[phase1][PROMPT_START]'); console.log(phase1Prompt); console.log('[phase1][PROMPT_END]');
    const phase1Raw = await callGemini(genAI, phase1Prompt, 'phase1');
    console.log('[phase1][OUTPUT_START]'); console.log(phase1Raw); console.log('[phase1][OUTPUT_END]');

    // Phase2
    const phase2Template = loadPromptFile('final_prompt.txt');
    const phase2Prompt = injectVariables(phase2Template, formData, {
      phase1_output: phase1Raw,
      videoLengthSeconds,
      targetSceneCount
    });
    console.log('[phase2][PROMPT_START]'); console.log(phase2Prompt); console.log('[phase2][PROMPT_END]');
    const phase2Raw = await callGemini(genAI, phase2Prompt, 'phase2');
    console.log('[phase2][OUTPUT_START]'); console.log(phase2Raw); console.log('[phase2][OUTPUT_END]');

    let parsedFinal;
    let parseInfo = {};
    try {
      const result = tryParseWithCleaning(phase2Raw);
      parsedFinal = result.parsed;
      parseInfo = {
        attempts: result.attempts,
        cleanedPreview: result.cleaned.slice(0,300)
      };
      console.log('[phase2] JSON parse success with attempts:', result.attempts);
    } catch (e) {
      console.error('[phase2] JSON parse failed, using fallback:', e.message);
      parsedFinal = buildFallbackJson({
        brandName: formData.brandName,
        productServiceName: formData.productServiceName,
        productServiceCategory: formData.productServiceCategory,
        coreTarget: formData.coreTarget,
        videoPurpose: formData.videoPurpose,
        videoLengthSeconds,
        aspectRatioCode: formData.aspectRatioCode,
        sceneCount: targetSceneCount
      });
      parseInfo = { fallback: true, error: e.message };
    }

    // 보정 작업
    if (!parsedFinal.project_meta) parsedFinal.project_meta = {};
    if (!parsedFinal.project_meta.aspect_ratio) parsedFinal.project_meta.aspect_ratio = formData.aspectRatioCode;
    if (!parsedFinal.project_meta.video_length_seconds) parsedFinal.project_meta.video_length_seconds = videoLengthSeconds;

    sanitizeNegativePrompt(parsedFinal);
    fixSeeds(parsedFinal);
    enforceShotByInObject(parsedFinal);
    ensureHighFidelityTokens(parsedFinal);
    rebuildTimecodes(parsedFinal, videoLengthSeconds);

    // scene 개수 조정
    if (Array.isArray(parsedFinal.scenes) && parsedFinal.scenes.length > targetSceneCount) {
      parsedFinal.scenes = parsedFinal.scenes.slice(0, targetSceneCount);
    }

    // 응답용 정규화
    const normScenes = (parsedFinal.scenes || []).map(s=>{
      return {
        scene_number: s.scene_number,
        timecode: s.timecode,
        concept_reference: s.concept_reference,
        image_prompt: s.image_prompt,
        motion_prompt: s.motion_prompt,
        duration_seconds: s.duration_seconds,
        notes: s.notes || ''
      };
    });

    normScenes.forEach(sc=>{
      console.log(`[SCENE] #${sc.scene_number} ${sc.timecode} promptWords=${(sc.image_prompt?.prompt||'').split(/\s+/).length}`);
    });

    const response = {
      success: true,
      phase1: { raw: phase1Raw },
      phase2: { raw: phase2Raw },
      storyboard: {
        project_meta: parsedFinal.project_meta,
        scenes: normScenes
      },
      metadata: {
        processingMs: Date.now() - started,
        modelChain: MODEL_CHAIN,
        videoLengthRaw: formData.videoLengthRaw,
        videoLengthSeconds,
        targetSceneCount,
        actualScenes: normScenes.length,
        aspectRatioOriginal: formData.aspectRatioOriginal,
        aspectRatioCode: formData.aspectRatioCode,
        brandLogoProvided: formData.brandLogoProvided,
        productImageProvided: formData.productImageProvided,
        parseInfo,
        pipeline: 'phase1-natural / phase2-json-cleaned',
        geminiVersion: '2.5-flash'
      }
    };

    res.status(200).json(response);

  } catch (err) {
    console.error('[storyboard-init][ERROR]', err);
    res.status(500).json({ success:false, error: err.message });
  }
}

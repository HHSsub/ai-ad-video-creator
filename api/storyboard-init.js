import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * 2-Stage Pipeline
 *  Phase 1: input_second_prompt.txt  -> 자연어 전략/컨셉 문서 (JSON 강제 X)
 *  Phase 2: final_prompt.txt         -> 단 하나의 JSON (이미지+모션 프롬프트 구조)
 *
 * 강화 포인트:
 *  - videoLengthRaw / videoLengthSeconds 모두 유지
 *  - aspectRatioOriginal / aspectRatioCode 모두 유지
 *  - targetSceneCount (floor(videoLengthSeconds / 2)) 주입
 *  - Phase2 prompt에 videoLengthSeconds, targetSceneCount 명시
 *  - Phase2 결과 JSON에 video_length_seconds 등 누락 시 자동 보정
 *  - 풍부한 console 로그
 *  - 기능 축소 없음
 */

//////////////////// Aspect Ratio ////////////////////
function mapUserAspectRatio(value) {
  if (!value) return 'widescreen_16_9';
  if (typeof value !== 'string') return 'widescreen_16_9';
  const v = value.toLowerCase();
  if (v.includes('16:9') || v.includes('가로')) return 'widescreen_16_9';
  if (v.includes('9:16') || v.includes('세로')) return 'vertical_9_16';
  if (v.includes('1:1') || v.includes('정사각')) return 'square_1_1';
  return 'widescreen_16_9';
}

//////////////////// Prompt File Loader ////////////////////
function loadPromptFile(filename) {
  const p = path.resolve(process.cwd(), 'public', filename);
  if (!fs.existsSync(p)) throw new Error(`프롬프트 파일 없음: ${filename}`);
  return fs.readFileSync(p, 'utf-8');
}

//////////////////// Variable Injection ////////////////////
function injectVariables(template, formData, extra = {}) {
  const merged = { ...formData, ...extra };

  // 표준화된 치환용 필드 추가
  merged.brandLogo        = formData.brandLogo ? '업로드됨' : '없음';
  merged.productImage     = formData.productImage ? '업로드됨' : '없음';
  merged.brandLogoBool    = !!formData.brandLogo;
  merged.productImageBool = !!formData.productImage;
  merged.aspectRatioCode  = formData.aspectRatioCode || '';
  merged.videoLengthRaw   = formData.videoLengthRaw || formData.videoLength || '';

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => {
    if (merged[k] === undefined || merged[k] === null) return '';
    return String(merged[k]);
  });
}

//////////////////// Gemini Retry Logic ////////////////////
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
  if (m.includes('quota') || m.includes('rate') || m.includes('overload') || m.includes('timeout'))
    return true;
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
        if (text.length < 10) throw new Error('응답 너무 짧음');
        return text;
      } catch (e) {
        console.warn(
          `[${label}] 실패 attempt=${attempt} model=${modelName} : ${e.message}`
        );
        if (attempt < 3 && isRetryable(e)) {
          const delay = BASE_BACKOFF * attempt + Math.random() * 1000;
          console.log(`[${label}] 재시도 대기 ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        break;
      }
    }
  }
  throw new Error(`[${label}] 모든 모델 실패`);
}

function getGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.REACT_APP_GEMINI_API_KEY
  );
}

//////////////////// Length & Scene Helpers ////////////////////
function parseVideoLengthSeconds(raw) {
  if (!raw) return 10;
  const m = String(raw).match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : 10;
  return Math.max(6, Math.min(180, isNaN(n) ? 10 : n));
}

function calcSceneCount(sec) {
  return Math.max(3, Math.min(60, Math.floor(sec / 2)));
}

//////////////////// Final JSON Parser ////////////////////
function extractSingleJson(raw) {
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('JSON 경계 탐지 실패');
  }
  const sub = raw.slice(first, last + 1).trim();
  return JSON.parse(sub);
}

function sanitizeImagePromptText(p) {
  if (!p) return '';
  let t = p.trim();
  // 'Shot by' 검사
  if (!/Shot by/i.test(t)) {
    t += (t.endsWith('.') ? '' : '.') + ' Shot by professional cinema camera with a 50mm lens.';
  }
  // 선두 카메라 브랜드 제거
  if (/^(camera:|canon|sony|nikon|fuji|fujifilm|leica|hasselblad|panasonic)/i.test(t)) {
    t = t
      .replace(/^camera:\s*/i, '')
      .replace(
        /^(canon|sony|nikon|fuji|fujifilm|leica|hasselblad|panasonic)[^,]*,?\s*/i,
        ''
      );
  }
  return t;
}

//////////////////// Handler ////////////////////
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const started = Date.now();

  try {
    const { formData } = req.body || {};
    if (!formData) return res.status(400).json({ error: 'formData required' });

    // Preserve raw & normalized
    formData.videoLengthRaw = formData.videoLength || '';
    const videoLengthSeconds = parseVideoLengthSeconds(formData.videoLengthRaw);
    const targetSceneCount = calcSceneCount(videoLengthSeconds);

    formData.aspectRatioOriginal = formData.videoAspectRatio || '';
    formData.aspectRatioCode = mapUserAspectRatio(formData.aspectRatioOriginal);

    formData.brandLogoProvided = !!(formData.brandLogoProvided || formData.brandLogo);
    formData.productImageProvided = !!(formData.productImageProvided || formData.productImage);

    console.log('[storyboard-init][START]');
    console.log('[INPUT SUMMARY]', {
      brandName: formData.brandName,
      industryCategory: formData.industryCategory,
      productServiceCategory: formData.productServiceCategory,
      productServiceName: formData.productServiceName,
      coreTarget: formData.coreTarget,
      videoPurpose: formData.videoPurpose,
      videoLengthRaw: formData.videoLengthRaw,
      videoLengthSeconds,
      targetSceneCount,
      coreDifferentiation: formData.coreDifferentiation,
      aspectRatioOriginal: formData.aspectRatioOriginal,
      aspectRatioCode: formData.aspectRatioCode,
      brandLogoProvided: formData.brandLogoProvided,
      productImageProvided: formData.productImageProvided
    });

    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error('Gemini API Key missing');
    const genAI = new GoogleGenerativeAI(apiKey);

    // ---------------- Phase 1 (Natural Language) ----------------
    let phase1Template = loadPromptFile('input_second_prompt.txt');
    const phase1Prompt = injectVariables(phase1Template, formData, {
      videoLengthSeconds,
      targetSceneCount
    });
    console.log('[phase1][PROMPT_START]'); console.log(phase1Prompt); console.log('[phase1][PROMPT_END]');

    const phase1Raw = await callGemini(genAI, phase1Prompt, 'phase1');
    console.log('[phase1][OUTPUT_START]'); console.log(phase1Raw); console.log('[phase1][OUTPUT_END]');

    // ---------------- Phase 2 (JSON Only) ----------------
    let finalTemplate = loadPromptFile('final_prompt.txt');
    const finalPrompt = injectVariables(finalTemplate, formData, {
      phase1_output: phase1Raw,
      videoLengthSeconds,
      targetSceneCount
    });
    console.log('[phase2][PROMPT_START]'); console.log(finalPrompt); console.log('[phase2][PROMPT_END]');

    const phase2Raw = await callGemini(genAI, finalPrompt, 'phase2');
    console.log('[phase2][OUTPUT_START]'); console.log(phase2Raw); console.log('[phase2][OUTPUT_END]');

    // JSON Parse
    let parsed;
    try {
      parsed = extractSingleJson(phase2Raw);
    } catch (e) {
      console.error('[phase2] JSON 파싱 실패:', e.message);
      throw e;
    }

    // Validate & enrich project_meta
    const meta = parsed.project_meta || {};
    if (!meta.video_length_seconds) meta.video_length_seconds = videoLengthSeconds;
    if (!meta.aspect_ratio) meta.aspect_ratio = formData.aspectRatioCode;
    meta.brand = meta.brand || formData.brandName || '';
    meta.product_or_category = meta.product_or_category || (formData.productServiceName || formData.productServiceCategory || '');
    meta.target = meta.target || formData.coreTarget || '';
    meta.purpose = meta.purpose || formData.videoPurpose || '';
    meta.differentiation = meta.differentiation || formData.coreDifferentiation || '';
    meta.logo_provided = typeof meta.logo_provided === 'boolean'
      ? meta.logo_provided
      : !!formData.brandLogoProvided;
    meta.product_image_provided = typeof meta.product_image_provided === 'boolean'
      ? meta.product_image_provided
      : !!formData.productImageProvided;

    // Scenes normalization
    let scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    if (scenes.length > targetSceneCount) {
      console.log(`[phase2] 장면 과다 → ${targetSceneCount}개로 절단`);
      scenes = scenes.slice(0, targetSceneCount);
    }

    const normScenes = scenes.map(s => {
      const ip = s.image_prompt || {};
      const mp = s.motion_prompt || {};
      if (ip.prompt) ip.prompt = sanitizeImagePromptText(ip.prompt);
      // Duration fix
      const duration = s.duration_seconds || 2;
      return {
        scene_number: s.scene_number,
        timecode: s.timecode,
        concept_reference: s.concept_reference,
        image_prompt: ip,
        motion_prompt: mp,
        duration_seconds: duration,
        notes: s.notes || ''
      };
    });

    normScenes.forEach(sc => {
      console.log(`[SCENE_LOG] #${sc.scene_number} time=${sc.timecode} promptPreview="${(sc.image_prompt?.prompt || '').slice(0,80)}"`);
    });

    const response = {
      success: true,
      phase1: {
        raw: phase1Raw
      },
      phase2: {
        raw: phase2Raw,
        project_meta: meta
      },
      storyboard: {
        project_meta: meta,
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
        pipeline: 'phase1-natural / phase2-json',
        geminiVersion: '2.5-flash'
      }
    };

    console.log('[storyboard-init][DONE]', {
      processingMs: response.metadata.processingMs,
      scenes: normScenes.length
    });

    res.status(200).json(response);

  } catch (err) {
    console.error('[storyboard-init][ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

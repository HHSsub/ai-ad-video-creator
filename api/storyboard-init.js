import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * storyboard-init.js (2-Stage Pipeline + VERBOSE LOGGING VERSION)
 *
 * Stage 1: input_second_prompt.txt   → 자연어 분석 + 6개 컨셉 JSON 포함 통합 결과
 * Stage 2: final_prompt.txt          → 최종 씬 JSON (image_prompt + motion_prompt 등)
 *
 * 요구사항 준수:
 *  - 프롬프트 파일 원문 변경 없음 (파일을 있는 그대로 읽음)
 *  - {variable} 플레이스홀더 → formData/추가 값 치환
 *  - Phase1 결과 자연어 전체를 Phase2 프롬프트 내 {phase1_output}/{phase1_raw} 등에 삽입
 *  - 최종 Phase2 JSON 파싱, scenes 정규화
 *  - 풍부한 콘솔 로그 (입력/출력/파싱/정규화/씬별 프롬프트 등)
 *  - 기능 축소 없음 (오류·재시도·모델 체인 유지)
 */

/* ////////////////////////////////////////////////////////////////////////////
 * Aspect Ratio
 * //////////////////////////////////////////////////////////////////////////// */
function mapUserAspectRatio(value) {
  if (!value) return 'widescreen_16_9';
  if (typeof value !== 'string') return 'widescreen_16_9';
  const v = value.toLowerCase();
  if (v.includes('16:9') || v.includes('가로')) return 'widescreen_16_9';
  if (v.includes('9:16') || v.includes('세로')) return 'vertical_9_16';
  if (v.includes('1:1') || v.includes('정사각')) return 'square_1_1';
  return 'widescreen_16_9';
}

/* ////////////////////////////////////////////////////////////////////////////
 * Prompt Loading / Variable Injection
 * //////////////////////////////////////////////////////////////////////////// */
function loadPromptFile(filename) {
  const filePath = path.resolve(process.cwd(), 'public', filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`프롬프트 파일을 찾을 수 없습니다: ${filename}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * injectVariables:
 *  - {key} 패턴을 formData + extraValues 값으로 치환
 *  - brandLogo, productImage → 업로드 여부 문자열
 *  - 값 없음 → 빈 문자열
 */
function injectVariables(template, formData, extraValues = {}) {
  const flatMap = { ...formData };

  flatMap.brandLogo       = formData.brandLogo ? '업로드됨' : '없음';
  flatMap.productImage    = formData.productImage ? '업로드됨' : '없음';
  flatMap.aspectRatioCode = formData.aspectRatioCode || '';

  Object.entries(extraValues).forEach(([k, v]) => { flatMap[k] = v; });

  const replaced = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    if (key in flatMap && flatMap[key] != null) {
      const val = flatMap[key];
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    }
    return '';
  });

  return { replaced, usedVariables: Object.keys(flatMap) };
}

/* ////////////////////////////////////////////////////////////////////////////
 * Gemini Model / Retry
 * //////////////////////////////////////////////////////////////////////////// */
const MODEL_CHAIN = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  process.env.FALLBACK_GEMINI_MODEL || 'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
].filter(Boolean);

const BASE_BACKOFF = 2500;

function isRetryable(error) {
  const status = error?.status;
  const msg = (error?.message || '').toLowerCase();
  if ([429,500,502,503,504].includes(status)) return true;
  if (msg.includes('overload') || msg.includes('rate limit') || msg.includes('quota') || msg.includes('timeout')) return true;
  return false;
}

async function callGemini(genAI, prompt, label) {
  console.log(`[${label}] === Gemini 호출 시작 ===`);
  for (const modelName of MODEL_CHAIN) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[${label}] model=${modelName} attempt=${attempt} | promptLength=${prompt.length}`);
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
        const elapsed = Date.now() - start;
        console.log(`[${label}] ✅ 성공 model=${modelName} len=${text.length} elapsed=${elapsed}ms`);
        if (!text || text.length < 20) throw new Error('응답이 너무 짧음');
        return text;
      } catch (e) {
        console.warn(`[${label}] ❌ 실패 model=${modelName} attempt=${attempt}: ${e.message}`);
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
  throw new Error(`[${label}] 모든 모델 시도 실패`);
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY ||
         process.env.VITE_GEMINI_API_KEY ||
         process.env.REACT_APP_GEMINI_API_KEY;
}

/* ////////////////////////////////////////////////////////////////////////////
 * Phase 1: Concepts JSON Parse
 * //////////////////////////////////////////////////////////////////////////// */
function parseConcepts(raw) {
  console.log('[parseConcepts] 시작 (raw length:', raw.length, ')');
  try {
    const match = raw.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (match) {
      console.log('[parseConcepts] JSON 후보 길이:', match[0].length);
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) {
        const parsed = arr.slice(0,6).map((c,i)=>({
          concept_id: c.concept_id || (i+1),
          concept_name: c.concept_name || `Concept ${i+1}`,
          summary: c.summary || `Summary ${i+1}`,
          keywords: Array.isArray(c.keywords)? c.keywords.slice(0,5):['brand','product','target','value','ad']
        }));
        console.log('[parseConcepts] ✅ 파싱 성공 개수:', parsed.length);
        return parsed;
      }
    }
    console.warn('[parseConcepts] JSON 배열 패턴 미발견 -> 폴백');
  } catch (e) {
    console.warn('[parseConcepts] 예외 발생:', e.message);
  }
  const fallback = Array.from({length:6}, (_,i)=>({
    concept_id: i+1,
    concept_name: `Concept ${i+1}`,
    summary: `Fallback summary ${i+1}`,
    keywords: ['brand','product','target','value','ad']
  }));
  console.log('[parseConcepts] 폴백 사용');
  return fallback;
}

/* ////////////////////////////////////////////////////////////////////////////
 * Phase 2: Final JSON Parse
 * //////////////////////////////////////////////////////////////////////////// */
function parseFinalJson(raw) {
  console.log('[parseFinalJson] 시작 (raw length:', raw.length, ')');
  try {
    const blockMatch =
      raw.match(/\{\s*"project_meta"[\s\S]*\}\s*$/m) ||
      raw.match(/\{\s*"project_meta"[\s\S]*\}/m);
    if (!blockMatch) {
      console.warn('[parseFinalJson] project_meta JSON 블록 미발견');
    }
    const jsonStr = blockMatch ? blockMatch[0] : raw.trim();
    const parsed = JSON.parse(jsonStr);
    console.log('[parseFinalJson] ✅ 파싱 성공 (scenes:', Array.isArray(parsed.scenes)? parsed.scenes.length : 0, ')');
    return parsed;
  } catch (e) {
    console.error('[parseFinalJson] ❌ 오류:', e.message);
    return null;
  }
}

// image_prompt 후처리 (선두 장비 브랜드 제거)
function sanitizeImagePrompt(p) {
  if (!p) return '';
  let t = p.trim();
  if (/^(camera:|canon|sony|nikon|fuji|fujifilm|leica|panasonic|hasselblad)/i.test(t)) {
    t = t.replace(/^camera:\s*/i,'');
    t = t.replace(/^(canon|sony|nikon|fuji|fujifilm|leica|panasonic|hasselblad)[^,]*,?\s*/i,'');
  }
  return t;
}

/* ////////////////////////////////////////////////////////////////////////////
 * Video Length Helpers
 * //////////////////////////////////////////////////////////////////////////// */
function parseVideoLengthSeconds(raw) {
  if (!raw) return 10;
  const m = String(raw).match(/(\d+)/);
  const n = m ? parseInt(m[1],10) : 10;
  return Math.max(8, Math.min(120, isNaN(n) ? 10 : n));
}
function calcSceneCount(seconds) {
  return Math.max(3, Math.min(60, Math.floor(seconds / 2)));
}

/* ////////////////////////////////////////////////////////////////////////////
 * Handler
 * //////////////////////////////////////////////////////////////////////////// */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  const startTime = Date.now();

  try {
    const { formData } = req.body || {};
    if (!formData) {
      console.error('[storyboard-init] formData 누락');
      return res.status(400).json({ error:'formData required' });
    }

    // Flags & aspect ratio
    formData.brandLogoProvided    = !!(formData.brandLogoProvided || formData.brandLogo);
    formData.productImageProvided = !!(formData.productImageProvided || formData.productImage);
    formData.aspectRatioCode      = mapUserAspectRatio(formData.videoAspectRatio);

    const videoSec     = parseVideoLengthSeconds(formData.videoLength);
    const targetScenes = calcSceneCount(videoSec);

    console.log('[storyboard-init][START] >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    console.log('[storyboard-init] 입력 formData (요약):', {
      brandName: formData.brandName,
      industryCategory: formData.industryCategory,
      productServiceCategory: formData.productServiceCategory,
      productServiceName: formData.productServiceName,
      coreTarget: formData.coreTarget,
      videoPurpose: formData.videoPurpose,
      videoLength: formData.videoLength,
      coreDifferentiation: formData.coreDifferentiation,
      videoRequirements: formData.videoRequirements,
      brandLogoProvided: formData.brandLogoProvided,
      productImageProvided: formData.productImageProvided,
      aspectRatio: formData.videoAspectRatio,
      aspectRatioCode: formData.aspectRatioCode
    });
    console.log('[storyboard-init] 계산된 scene 목표:', targetScenes, ' / videoSec:', videoSec);

    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error('Gemini API Key not set');
    const genAI = new GoogleGenerativeAI(apiKey);

    /* -----------------------------------------------------------------------
     * PHASE 1
     * --------------------------------------------------------------------- */
    console.log('[phase1] ===== 템플릿 로드 =====');
    let phase1TemplateRaw = loadPromptFile('input_second_prompt.txt');
    console.log('[phase1] template length:', phase1TemplateRaw.length);

    const { replaced: phase1Prompt, usedVariables: phase1UsedVars } =
      injectVariables(phase1TemplateRaw, formData, {});

    console.log('[phase1] 사용된 변수 목록:', phase1UsedVars);
    console.log('[phase1][INPUT_START]');
    console.log(phase1Prompt);
    console.log('[phase1][INPUT_END]');

    const phase1Raw = await callGemini(genAI, phase1Prompt, 'phase1');

    console.log('[phase1][OUTPUT_START]');
    console.log(phase1Raw);
    console.log('[phase1][OUTPUT_END]');

    const concepts = parseConcepts(phase1Raw);
    console.log('[phase1] 컨셉 파싱 결과 (요약):');
    concepts.forEach(c => {
      console.log(`  - concept_id=${c.concept_id} name="${c.concept_name}" keywords=${JSON.stringify(c.keywords)}`);
    });

    /* -----------------------------------------------------------------------
     * PHASE 2
     * --------------------------------------------------------------------- */
    console.log('[phase2] ===== 템플릿 로드 =====');
    let phase2TemplateRaw = loadPromptFile('final_prompt.txt');
    console.log('[phase2] template length:', phase2TemplateRaw.length);

    const { replaced: phase2Prompt, usedVariables: phase2UsedVars } =
      injectVariables(phase2TemplateRaw, formData, {
        phase1_output: phase1Raw,
        phase1_raw: phase1Raw,
        concepts_json: JSON.stringify(concepts, null, 2),
        brandLogo: formData.brandLogoProvided ? '업로드됨' : '없음',
        productImage: formData.productImageProvided ? '업로드됨' : '없음',
        targetSceneCount: targetScenes
      });

    console.log('[phase2] 사용된 변수 목록:', phase2UsedVars);
    console.log('[phase2][INPUT_START]');
    console.log(phase2Prompt);
    console.log('[phase2][INPUT_END]');

    const phase2Raw = await callGemini(genAI, phase2Prompt, 'phase2');

    console.log('[phase2][OUTPUT_START]');
    console.log(phase2Raw);
    console.log('[phase2][OUTPUT_END]');

    const parsedFinal = parseFinalJson(phase2Raw);
    if (!parsedFinal) {
      console.error('[phase2] 최종 JSON 파싱 실패 - 폴백 시도');
      throw new Error('최종 JSON 파싱 실패');
    }

    const meta = parsedFinal.project_meta || {};
    let scenes = Array.isArray(parsedFinal.scenes) ? parsedFinal.scenes : [];
    console.log('[phase2] 원본 scenes 개수:', scenes.length);

    if (scenes.length > targetScenes) {
      console.log(`[phase2] scene 개수 과다 -> ${targetScenes}개로 자름`);
      scenes = scenes.slice(0, targetScenes);
    }

    const normalizedScenes = scenes.map(s => {
      const item = {
        sceneNumber: s.scene_number,
        timecode: s.timecode,
        conceptRef: s.concept_ref,
        imagePrompt: sanitizeImagePrompt(s.image_prompt || ''),
        motionPrompt: (s.motion_prompt || '').trim(),
        duration: s.duration_seconds || 2,
        aspect_ratio: s.aspect_ratio || meta.aspect_ratio || formData.aspectRatioCode
      };
      console.log(`[phase2][SCENE] #${item.sceneNumber}`, {
        timecode: item.timecode,
        conceptRef: item.conceptRef,
        duration: item.duration,
        aspect_ratio: item.aspect_ratio,
        imagePromptPreview: item.imagePrompt.slice(0,120) + (item.imagePrompt.length>120?'...':''),
        motionPrompt: item.motionPrompt
      });
      return item;
    }).filter(s => s.sceneNumber != null);

    console.log('[phase2] 정규화 최종 scenes 개수:', normalizedScenes.length);

    const response = {
      success: true,
      phase1: {
        raw: phase1Raw,
        concepts
      },
      phase2: {
        raw: phase2Raw,
        project_meta: meta
      },
      scenes: normalizedScenes,
      metadata: {
        modelChain: MODEL_CHAIN,
        totalProcessingMs: Date.now() - startTime,
        videoLengthSeconds: videoSec,
        targetScenes,
        actualScenes: normalizedScenes.length,
        aspectRatioCode: formData.aspectRatioCode,
        brandLogoProvided: formData.brandLogoProvided,
        productImageProvided: formData.productImageProvided,
        pipeline: '2-stage-natural-language->final-json',
        geminiVersion: '2.5-flash chain',
        formDataDigest: {
          brandName: formData.brandName,
          productServiceName: formData.productServiceName,
          coreTarget: formData.coreTarget,
          videoPurpose: formData.videoPurpose
        }
      }
    };

    console.log('[storyboard-init][DONE] 처리시간(ms)=', response.metadata.totalProcessingMs);
    res.status(200).json(response);

  } catch (error) {
    console.error('[storyboard-init] ❌ ERROR 전체 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

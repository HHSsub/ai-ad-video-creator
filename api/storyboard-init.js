import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * 텍스트 템플릿 로더: public/*.txt 원문 그대로 사용
 */
function readTxt(name) {
  const p = path.resolve(process.cwd(), 'public', name);
  if (!fs.existsSync(p)) {
    console.error(`[storyboard-init] 템플릿 누락: ${name} (경로: ${p})`);
    return null;
  }
  const text = fs.readFileSync(p, 'utf-8');
  console.log(`[storyboard-init] 템플릿 로드 완료: ${name} (${text.length} chars)`);
  return text;
}

const INPUT_PROMPT = readTxt('input_prompt.txt');
const SECOND_PROMPT = readTxt('second_prompt.txt');
const THIRD_PROMPT = readTxt('third_prompt.txt');

function scenesPerStyle(totalSeconds) {
  const n = Math.max(1, Math.floor(Number(totalSeconds || 10) / 2)); // 2초에 1장
  return n;
}

/**
 * 치환은 변수만, 텍스트 본문은 "그대로"
 */
function buildFirstPrompt(formData) {
  if (!INPUT_PROMPT) throw new Error('public/input_prompt.txt 누락');
  return INPUT_PROMPT
    .replaceAll('{{brandName}}', String(formData.brandName || ''))
    .replaceAll('{{industryCategory}}', String(formData.industryCategory || ''))
    .replaceAll('{{videoLength}}', String(formData.videoLength || ''))
    .replaceAll('{{coreTarget}}', String(formData.coreTarget || ''))
    .replaceAll('{{coreDifferentiation}}', String(formData.coreDifferentiation || ''))
    .replaceAll('{{videoPurpose}}', String(formData.videoPurpose || ''));
}

function buildSecondPrompt(firstOutput, formData) {
  if (!SECOND_PROMPT) throw new Error('public/second_prompt.txt 누락');
  const nScenes = scenesPerStyle(formData.videoLength);
  return SECOND_PROMPT
    .replaceAll('{{firstOutput}}', firstOutput)
    .replaceAll('{{brandName}}', String(formData.brandName || ''))
    .replaceAll('{{videoLength}}', String(formData.videoLength || ''))
    .replaceAll('{{sceneCount}}', String(nScenes));
}

function buildThirdPrompt(secondOutput, formData) {
  if (!THIRD_PROMPT) throw new Error('public/third_prompt.txt 누락');
  const nScenes = scenesPerStyle(formData.videoLength);
  return THIRD_PROMPT
    .replaceAll('{{storyboard}}', secondOutput)
    .replaceAll('{{brandName}}', String(formData.brandName || ''))
    .replaceAll('{{industryCategory}}', String(formData.industryCategory || ''))
    .replaceAll('{{productServiceCategory}}', String(formData.productServiceCategory || ''))
    .replaceAll('{{videoLength}}', String(formData.videoLength || ''))
    .replaceAll('{{coreTarget}}', String(formData.coreTarget || ''))
    .replaceAll('{{coreDifferentiation}}', String(formData.coreDifferentiation || ''))
    .replaceAll('{{sceneCount}}', String(nScenes));
}

/**
 * 3단계 응답에서 이미지 프롬프트 추출(네가 지시한 섹션/형식 강제)
 */
function extractImagePromptsFromResponse(responseText, formData) {
  const t0 = Date.now();
  const prompts = [];
  if (!responseText) {
    console.warn('[storyboard-init] 3단계 응답 비어있음');
    return prompts;
  }

  const sectionIdx = responseText.indexOf('##Storyboard Image Prompts');
  const text = sectionIdx >= 0 ? responseText.slice(sectionIdx) : responseText;

  const regex = /###\s*Scene\s*(\d+)[^\n]*\n\s*-\s*\*\*Image Prompt\*\*:\s*([\s\S]*?)(?=\n###\s*Scene|\n##|$)/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const sceneNum = parseInt(m[1], 10);
    let clean = m[2].replace(/\*\*/g, '').trim();

    // 부족하면 핵심 디테일 보강(누락시에만)
    const must = ['insanely detailed', 'micro-details', 'hyper-realistic', 'visible skin pores', 'sharp focus', '4K'];
    for (const kw of must) {
      if (!clean.toLowerCase().includes(kw.toLowerCase())) clean += `, ${kw}`;
    }
    // 70~100 단어 요구 조건을 완화 체크
    const wordCount = clean.split(/\s+/).length;
    if (wordCount < 60) {
      clean += ', elaborate mise-en-scène, professional commercial photography, cinematic lighting';
    }

    prompts.push({
      sceneNumber: isNaN(sceneNum) ? prompts.length + 1 : sceneNum,
      title: `Scene ${isNaN(sceneNum) ? prompts.length + 1 : sceneNum}`,
      prompt: clean,
      duration: 2,
    });
  }

  // 장면 수 보정(부족 시 마지막 복제)
  const need = scenesPerStyle(formData.videoLength);
  while (prompts.length < need && prompts.length > 0) {
    const idx = prompts.length + 1;
    prompts.push({ ...prompts[prompts.length - 1], sceneNumber: idx, title: `Scene ${idx}` });
  }

  console.log(`[storyboard-init] 3단계 프롬프트 추출 완료: ${prompts.length}개, ${Date.now() - t0}ms`);
  return prompts;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const tStart = Date.now();
  console.log('================ [storyboard-init] 시작 ================');

  try {
    const { formData } = req.body || {};
    if (!formData) return res.status(400).json({ error: 'Form data is required' });

    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key not found');

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    // 1단계
    const p1 = buildFirstPrompt(formData);
    console.log('[storyboard-init] 1단계(Gemini) 시작...');
    const t1 = Date.now();
    const firstOut = (await model.generateContent(p1)).response.text();
    console.log(`[storyboard-init] 1단계 완료 (${Date.now() - t1}ms)`);

    // 2단계
    const p2 = buildSecondPrompt(firstOut, formData);
    console.log('[storyboard-init] 2단계(Gemini) 시작...');
    const t2 = Date.now();
    const secondOut = (await model.generateContent(p2)).response.text();
    console.log(`[storyboard-init] 2단계 완료 (${Date.now() - t2}ms)`);

    // 3단계
    const p3 = buildThirdPrompt(secondOut, formData);
    console.log('[storyboard-init] 3단계(Gemini) 시작...');
    const t3 = Date.now();
    const thirdOut = (await model.generateContent(p3)).response.text();
    console.log(`[storyboard-init] 3단계 완료 (${Date.now() - t3}ms)`);

    // 추출
    const imagePrompts = extractImagePromptsFromResponse(thirdOut, formData);

    // 스타일(이름/설명/팔레트만 제공; 렌더는 프롬프트 그대로)
    const styles = [
      { name: 'Cinematic Professional', description: 'cinematic professional, dramatic lighting, filmic color grading', colorPalette: '#1a365d,#2d3748,#e2e8f0' },
      { name: 'Modern Minimalist',      description: 'minimal, clean, negative space, soft gradients',                 colorPalette: '#ffffff,#f7fafc,#cbd5e0' },
      { name: 'Vibrant Dynamic',        description: 'vibrant, energetic, punchy contrast, lively motion',             colorPalette: '#ff6b6b,#ffd166,#06d6a0' },
      { name: 'Natural Lifestyle',      description: 'authentic, lifestyle, natural light, candid',                    colorPalette: '#4caf50,#81c784,#c8e6c9' },
      { name: 'Premium Luxury',         description: 'luxury, premium, refined, gold accents',                         colorPalette: '#8d6e63,#a1887f,#d7ccc8' },
      { name: 'Tech Innovation',        description: 'futuristic, tech, neon accents, sleek',                          colorPalette: '#2b6cb0,#4299e1,#63b3ed' },
    ];

    const sceneCount = scenesPerStyle(formData.videoLength);
    console.log(`[storyboard-init] 완료: 장면/스타일 ${sceneCount}개, 스타일 ${styles.length}개, 총 경과 ${Date.now() - tStart}ms`);

    res.status(200).json({
      success: true,
      imagePrompts,
      styles,
      metadata: {
        brandName: formData.brandName,
        videoLength: formData.videoLength,
        sceneCountPerStyle: sceneCount,
        promptFiles: {
          input: !!INPUT_PROMPT,
          second: !!SECOND_PROMPT,
          third: !!THIRD_PROMPT,
        },
        geminiModel: modelName,
        timingsMs: {
          total: Date.now() - tStart,
        },
      },
    });
  } catch (e) {
    console.error('[storyboard-init] 오류:', e);
    res.status(500).json({ success: false, error: e.message });
  } finally {
    console.log('================ [storyboard-init] 종료 ================');
  }
}

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

function readTxt(name) {
  const p = path.resolve(process.cwd(), 'public', name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

// 1단계/2단계/3단계 프롬프트는 public/*.txt를 “그대로” 사용
const INPUT_PROMPT = readTxt('input_prompt.txt');
const SECOND_PROMPT = readTxt('second_prompt.txt');
const THIRD_PROMPT = readTxt('third_prompt.txt');

function scenesPerStyle(totalSeconds) {
  const n = Math.max(1, Math.floor(Number(totalSeconds || 10) / 2)); // 2초당 1장
  return n;
}

function buildFirstPrompt(formData) {
  if (!INPUT_PROMPT) throw new Error('public/input_prompt.txt 누락');
  // 사용자가 넣은 값만 치환, 텍스트 본문은 수정하지 않음
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
  // third_prompt.txt는 네가 준 형식을 고스란히 사용. 필요한 값만 치환.
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

// 3단계 응답에서 이미지 프롬프트 추출(네 형식 강제)
function extractImagePromptsFromResponse(responseText, formData) {
  const prompts = [];
  const sectionIdx = responseText.indexOf('##Storyboard Image Prompts');
  const text = sectionIdx >= 0 ? responseText.slice(sectionIdx) : responseText;

  // ### Scene X (...) 다음 줄의 - **Image Prompt**: 블록을 강제 파싱
  const regex = /###\s*Scene\s*(\d+)[^\n]*\n\s*-\s*\*\*Image Prompt\*\*:\s*([\s\S]*?)(?=\n###\s*Scene|\n##|$)/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const sceneNum = parseInt(m[1], 10);
    let clean = m[2].replace(/\*\*/g, '').trim();
    // 최소한의 풍부함 보강(누락 시만 추가)
    const must = ['insanely detailed', 'micro-details', 'hyper-realistic', 'sharp focus', '4K'];
    for (const kw of must) {
      if (!clean.toLowerCase().includes(kw.toLowerCase())) clean += `, ${kw}`;
    }
    // 너무 짧으면 보강
    if (clean.split(/\s+/).length < 60) {
      clean += ', elaborate mise-en-scène, professional commercial photography, cinematic lighting';
    }

    prompts.push({
      sceneNumber: isNaN(sceneNum) ? prompts.length + 1 : sceneNum,
      title: `Scene ${isNaN(sceneNum) ? prompts.length + 1 : sceneNum}`,
      prompt: clean,
      duration: 2 // 스토리보드 기준 2초 슬롯
    });
  }

  // 장면 수가 부족하면 마지막 프롬프트 복제해 sceneCount까지 채움
  const need = scenesPerStyle(formData.videoLength);
  while (prompts.length < need && prompts.length > 0) {
    const idx = prompts.length + 1;
    prompts.push({ ...prompts[prompts.length - 1], sceneNumber: idx, title: `Scene ${idx}` });
  }

  return prompts;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { formData } = req.body || {};
    if (!formData) return res.status(400).json({ error: 'Form data is required' });

    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key not found');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });

    // 1단계
    const firstPrompt = buildFirstPrompt(formData);
    const firstOut = (await model.generateContent(firstPrompt)).response.text();

    // 2단계
    const secondPrompt = buildSecondPrompt(firstOut, formData);
    const secondOut = (await model.generateContent(secondPrompt)).response.text();

    // 3단계
    const thirdPrompt = buildThirdPrompt(secondOut, formData);
    const thirdOut = (await model.generateContent(thirdPrompt)).response.text();
    const imagePrompts = extractImagePromptsFromResponse(thirdOut, formData);

    // 6가지 스타일(이름/설명/팔레트만 제공 — 이미지 생성 시 강하게 주입)
    const styles = [
      { name: 'Cinematic Professional', description: 'cinematic professional, dramatic lighting, filmic color grading', colorPalette: '#1a365d,#2d3748,#e2e8f0' },
      { name: 'Modern Minimalist',      description: 'minimal, clean, negative space, soft gradients',                 colorPalette: '#ffffff,#f7fafc,#cbd5e0' },
      { name: 'Vibrant Dynamic',        description: 'vibrant, energetic, punchy contrast, lively motion',             colorPalette: '#ff6b6b,#ffd166,#06d6a0' },
      { name: 'Natural Lifestyle',      description: 'authentic, lifestyle, natural light, candid',                    colorPalette: '#4caf50,#81c784,#c8e6c9' },
      { name: 'Premium Luxury',         description: 'luxury, premium, refined, gold accents',                         colorPalette: '#8d6e63,#a1887f,#d7ccc8' },
      { name: 'Tech Innovation',        description: 'futuristic, tech, neon accents, sleek',                          colorPalette: '#2b6cb0,#4299e1,#63b3ed' }
    ];

    res.status(200).json({
      success: true,
      firstOut,
      secondOut,
      imagePrompts,
      styles,
      metadata: {
        brandName: formData.brandName,
        videoLength: formData.videoLength,
        sceneCountPerStyle: scenesPerStyle(formData.videoLength),
        promptFiles: {
          input: !!INPUT_PROMPT,
          second: !!SECOND_PROMPT,
          third: !!THIRD_PROMPT
        }
      }
    });
  } catch (e) {
    console.error('[storyboard-init] error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
}

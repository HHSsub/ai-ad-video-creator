// api/image-to-video.js
// - aspect_ratio 반영
// - 브랜드/제품/타겟 컨텍스트 우선
// - 카메라 브랜드/Camera: 선두 제거 & 재배치
// - prompt sanitizer 강화

import 'dotenv/config';

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAX_RETRY = 5;

function mapUserAspectRatio(value) {
  if (!value) return 'widescreen_16_9';
  if (typeof value !== 'string') return 'widescreen_16_9';
  if (value.includes('16:9') || value.includes('가로')) return 'widescreen_16_9';
  if (value.includes('9:16') || value.includes('세로')) return 'vertical_9_16';
  if (value.includes('1:1') || value.includes('정사각')) return 'square_1_1';
  return 'widescreen_16_9';
}

// 금지 카메라 브랜드/패턴
const CAMERA_BRAND_REGEX = /\b(Canon|Nikon|Sony|Fujifilm|Fuji|Panasonic|Leica|Hasselblad|EOS|Alpha|Lumix|R5|R6|Z6|A7R|A7S|GFX)\b/gi;

function sanitizeCameraSegments(text) {
  if (!text) return '';
  let t = text.replace(CAMERA_BRAND_REGEX, 'professional');
  // 선두가 Camera: 로 시작하면 후반부로 이동
  const trimmed = t.trim();
  if (/^camera:/i.test(trimmed)) {
    const without = trimmed.replace(/^camera:\s*/i, '');
    t = `${without} (technical: professional focal length framing)`;
  }
  // 문장 중간 반복 'Camera:' 제거
  t = t.replace(/Camera:\s*/gi, '');
  return t;
}

// 컨텍스트 삽입 + 길이/기술 정보 정리
function optimizeVideoPrompt(rawPrompt, formData) {
  const base = sanitizeCameraSegments(
    (rawPrompt || '')
      .replace(/\*\*/g,'')
      .replace(/[`"]/g,'')
      .replace(/\s+/g,' ')
      .trim()
  );
  let head = [
    formData?.brandName ? `Brand: ${formData.brandName}` : null,
    formData?.productServiceName ? `Product: ${formData.productServiceName}` : formData?.productServiceCategory ? `Product Category: ${formData.productServiceCategory}` : null,
    formData?.coreTarget ? `Target: ${formData.coreTarget}` : null,
    formData?.videoPurpose ? `Purpose: ${formData.videoPurpose}` : null,
    formData?.coreDifferentiation ? `Differentiation: ${formData.coreDifferentiation}` : null
  ].filter(Boolean).join(', ');

  if (!head) head = 'Commercial brand scenario';

  // base 앞에 붙이되 base에 이미 브랜드/타겟이 있으면 중복 줄임
  const duplicateCheck = new RegExp(formData?.brandName || '', 'i');
  let merged = duplicateCheck.test(base) ? base : `${head}. ${base}`;
  // 길이 제한
  if (merged.length < 60) merged += ' high quality commercial narrative, product usage clearly visible.';
  merged = merged.slice(0, 1800);
  return merged;
}

async function safeFreepikCall(url, options, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const text = await res.text().catch(()=> '');
        console.error(`[${label}] HTTP ${res.status}`, text.slice(0,200));
        if ([429,500,502,503,504].includes(res.status) && attempt < MAX_RETRY) {
          const wait = attempt * 1200;
          console.log(`[${label}] 재시도 대기: ${wait}ms`);
          await sleep(wait);
          continue;
        }
        throw new Error(`[${label}] HTTP ${res.status}: ${text}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.error(`[${label}] 시도 ${attempt} 실패:`, e.message);
      if (attempt < MAX_RETRY) {
        await sleep(900 * attempt);
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  const startTime = Date.now();
  try {
    const {
      imageUrl,
      prompt,
      duration = 6,
      sceneNumber,
      conceptId,
      title,
      formData = {}
    } = req.body || {};

    if (!imageUrl) return res.status(400).json({ error:'imageUrl required' });

    const aspectRatioCode = mapUserAspectRatio(formData.videoAspectRatio);
    const brandLogoProvided = !!(formData.brandLogoProvided || formData.brandLogo);
    const productImageProvided = !!(formData.productImageProvided || formData.productImage);

    const apiKey = process.env.FREEPIK_API_KEY ||
                   process.env.VITE_FREEPIK_API_KEY ||
                   process.env.REACT_APP_FREEPIK_API_KEY;
    if (!apiKey) throw new Error('Freepik API 키가 설정되지 않았습니다');

    const optimized = optimizeVideoPrompt(prompt, formData);

    // Freepik 지원: 6 또는 10초
    const validDuration = [6,10].includes(duration) ? duration : 6;

    const requestBody = {
      prompt: optimized,
      first_frame_image: imageUrl,
      duration: validDuration,
      prompt_optimizer: true,
      aspect_ratio: aspectRatioCode,
      webhook_url: null
    };

    console.log('[image-to-video] API 요청 파라미터:', {
      endpoint: `${FREEPIK_API_BASE}/ai/image-to-video/minimax-hailuo-02-768p`,
      prompt: optimized.slice(0,140) + (optimized.length>140?'...':''),
      duration: validDuration,
      aspect_ratio: aspectRatioCode,
      first_frame_image: imageUrl.substring(0,60)+'...',
      prompt_optimizer: true,
      brandLogoProvided,
      productImageProvided
    });

    const result = await safeFreepikCall(
      `${FREEPIK_API_BASE}/ai/image-to-video/minimax-hailuo-02-768p`,
      {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'x-freepik-api-key': apiKey,
          'User-Agent':'AI-Ad-Creator/2025'
        },
        body: JSON.stringify(requestBody)
      },
      'image-to-video'
    );

    if (!result.data?.task_id) {
      console.error('[image-to-video] task_id 없음:', JSON.stringify(result,null,2));
      throw new Error('비디오 생성 태스크 ID를 받지 못했습니다');
    }

    res.status(200).json({
      success:true,
      task:{
        taskId: result.data.task_id,
        conceptId: conceptId || null,
        sceneNumber: sceneNumber || null,
        title: title || null,
        duration: validDuration,
        aspectRatio: formData.videoAspectRatio || null,
        aspectRatioCode,
        brandLogoProvided,
        productImageProvided,
        createdAt: new Date().toISOString()
      },
      meta:{
        processingTime: Date.now() - startTime,
        provider:'Freepik image-to-video minimax-hailuo-02',
        rawStatus: result.data.status || null
      }
    });

  } catch (error) {
    console.error('[image-to-video] 오류:', error);
    res.status(500).json({
      success:false,
      error: error.message
    });
  }
}

// api/image-to-video.js - Freepik Kling v2.1 Pro 공식문서 기반 완전수정 (엔드포인트/파라미터 100%)
// 비율은 공식문서에 파라미터로 없음 (이미지 자체에서 맞춰야 함)

import 'dotenv/config';

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAX_RETRY = 5;

// 카메라 브랜드/패턴 제거
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
      imageTail, // Kling 공식 필드
      prompt,
      negativePrompt,
      duration = 5,
      cfg_scale = 0.5,
      static_mask,
      dynamic_masks,
      sceneNumber,
      conceptId,
      title,
      formData = {}
    } = req.body || {};

    if (!imageUrl) return res.status(400).json({ error:'imageUrl required' });

    const apiKey = process.env.FREEPIK_API_KEY ||
                   process.env.VITE_FREEPIK_API_KEY ||
                   process.env.REACT_APP_FREEPIK_API_KEY;
    if (!apiKey) throw new Error('Freepik API 키가 설정되지 않았습니다');

    const optimized = optimizeVideoPrompt(prompt, formData);

    // Kling v2.1 Pro 공식 인자만 포함
    const requestBody = {
      webhook_url: null,
      image: imageUrl,
      image_tail: imageTail,
      prompt: optimized,
      negative_prompt: negativePrompt || 'blurry, low quality, watermark, cartoon, distorted',
      duration: duration,
      cfg_scale,
      static_mask,
      dynamic_masks
    };

    // undefined/null/빈배열 필드 자동 제거
    Object.keys(requestBody).forEach(key => {
      if (
        requestBody[key] === undefined ||
        requestBody[key] === null ||
        (Array.isArray(requestBody[key]) && requestBody[key].length === 0)
      ) {
        delete requestBody[key];
      }
    });

    // aspect_ratio 인자 없음 (비율 지정하려면 image/image_tail 자체를 가공해서 넘겨야 함)
    // 비율 정보는 prompt에 포함하거나, 내부적으로만 관리

    console.log('[image-to-video] Kling API 요청 파라미터:', {
      endpoint: `${FREEPIK_API_BASE}/ai/image-to-video/kling-v2-1-pro`,
      ...requestBody,
      prompt: optimized.slice(0,140) + (optimized.length>140?'...':'')
    });

    const result = await safeFreepikCall(
      `${FREEPIK_API_BASE}/ai/image-to-video/kling-v2-1-pro`,
      {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'x-freepik-api-key': apiKey,
          'User-Agent':'AI-Ad-Creator/2025'
        },
        body: JSON.stringify(requestBody)
      },
      'image-to-video-kling'
    );

    if (!result.data?.task_id) {
      console.error('[image-to-video-kling] task_id 없음:', JSON.stringify(result,null,2));
      throw new Error('비디오 생성 태스크 ID를 받지 못했습니다');
    }

    res.status(200).json({
      success:true,
      task:{
        taskId: result.data.task_id,
        conceptId: conceptId || null,
        sceneNumber: sceneNumber || null,
        title: title || null,
        duration: duration,
        createdAt: new Date().toISOString()
      },
      meta:{
        processingTime: Date.now() - startTime,
        provider:'Freepik image-to-video kling-v2-1-pro',
        rawStatus: result.data.status || null
      }
    });

  } catch (error) {
    console.error('[image-to-video-kling] 오류:', error);
    res.status(500).json({
      success:false,
      error: error.message
    });
  }
}

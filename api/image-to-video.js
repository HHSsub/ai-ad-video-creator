// api/image-to-video.js - Freepik Kling v2.1 Pro, duration(문자열), 공식필드만, 모든 로그/에러/요청정보 출력

import 'dotenv/config';

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const KLING_ENDPOINT = `${FREEPIK_API_BASE}/ai/image-to-video/kling-v2-1-pro`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAX_RETRY = 5;

const CAMERA_BRAND_REGEX = /\b(Canon|Nikon|Sony|Fujifilm|Fuji|Panasonic|Leica|Hasselblad|EOS|Alpha|Lumix|R5|R6|Z6|A7R|A7S|GFX)\b/gi;

function sanitizeCameraSegments(text) {
  if (!text) return '';
  let t = text.replace(CAMERA_BRAND_REGEX, 'professional');
  const trimmed = t.trim();
  if (/^camera:/i.test(trimmed)) {
    const without = trimmed.replace(/^camera:\s*/i, '');
    t = `${without} (technical: professional focal length framing)`;
  }
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

  const duplicateCheck = new RegExp(formData?.brandName || '', 'i');
  let merged = duplicateCheck.test(base) ? base : `${head}. ${base}`;
  if (merged.length < 60) merged += ' high quality commercial narrative, product usage clearly visible.';
  merged = merged.slice(0, 1800);
  return merged;
}

async function safeFreepikCall(url, options, label, logObj={}) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      console.log(`[${label}] 시도 ${attempt}/${MAX_RETRY}`);
      console.log(`[${label}] 요청정보`, JSON.stringify(logObj));
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
      const json = await res.json();
      console.log(`[${label}] 응답`, JSON.stringify(json));
      return json;
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
      imageTail,
      prompt,
      negativePrompt,
      duration,
      cfg_scale,
      static_mask,
      dynamic_masks,
      // sceneNumber,
      // conceptId,
      // title,
      formData = {}
    } = req.body || {};

    if (!imageUrl) {
      console.error('[image-to-video] 필수 imageUrl 없음!');
      return res.status(400).json({ error:'imageUrl required' });
    }

    const apiKey = process.env.FREEPIK_API_KEY ||
                   process.env.VITE_FREEPIK_API_KEY ||
                   process.env.REACT_APP_FREEPIK_API_KEY;
    if (!apiKey) {
      console.error('[image-to-video] Freepik API 키 없음!');
      throw new Error('Freepik API 키가 설정되지 않았습니다');
    }

    const optimized = optimizeVideoPrompt(prompt, formData);

    let validDuration = parseInt(duration, 10);
    if (![5,10].includes(validDuration)) {
      console.warn('[image-to-video] duration이 5 또는 10이 아님. 기본값 5로 보정');
      validDuration = 5;
    }

    // 공식문서 기반 인자만 남김 (duration은 반드시 문자열 "5"/"10"로 보냄)
    const requestBody = {
      image: imageUrl,
      image_tail: imageTail,
      prompt: optimized,
      negative_prompt: negativePrompt || 'blurry, low quality, watermark, cartoon, distorted',
      duration: String(validDuration)
    };
    if (cfg_scale !== undefined) requestBody.cfg_scale = cfg_scale;
    if (static_mask !== undefined) requestBody.static_mask = static_mask;
    if (dynamic_masks !== undefined && Array.isArray(dynamic_masks) && dynamic_masks.length > 0) requestBody.dynamic_masks = dynamic_masks;

    console.log('[image-to-video] 최종 요청 파라미터:', JSON.stringify({
      endpoint: KLING_ENDPOINT,
      ...requestBody
    }));

    const result = await safeFreepikCall(
      KLING_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'x-freepik-api-key': apiKey,
          'User-Agent':'AI-Ad-Creator/2025'
        },
        body: JSON.stringify(requestBody)
      },
      'image-to-video-kling',
      {requestBody}
    );

    if (!result.data?.task_id) {
      console.error('[image-to-video-kling] task_id 없음:', JSON.stringify(result,null,2));
      throw new Error('비디오 생성 태스크 ID를 받지 못했습니다');
    }

    res.status(200).json({
      success:true,
      task:{
        taskId: result.data.task_id,
        duration: validDuration,
        createdAt: new Date().toISOString()
      },
      meta:{
        processingTime: Date.now() - startTime,
        provider:'Freepik image-to-video kling-v2-1-pro',
        rawStatus: result.data.status || null
      }
    });

  } catch (error) {
    console.error('[image-to-video-kling] 전체 실패:', error);
    res.status(500).json({
      success:false,
      error: error.message
    });
  }
}

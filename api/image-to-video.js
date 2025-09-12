// api/image-to-video.js - Freepik image-to-video 변환 + 영상 비율(aspect_ratio) & 브랜드/제품 이미지 플래그 반영 확장 버전

import 'dotenv/config';

// 간단한 재시도 유틸
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MAX_RETRY = 5;
const FREEPIK_API_BASE = 'https://api.freepik.com/v1';

// ======================= 영상 비율 매핑 함수 =======================
function mapUserAspectRatio(value) {
  if (!value) return 'widescreen_16_9';
  if (typeof value !== 'string') return 'widescreen_16_9';
  if (value.includes('16:9') || value.includes('가로')) return 'widescreen_16_9';
  if (value.includes('9:16') || value.includes('세로')) return 'vertical_9_16';
  if (value.includes('1:1') || value.includes('정사각')) return 'square_1_1';
  return 'widescreen_16_9';
}

// 비디오용 프롬프트 최적화 (간단 텍스트 클린)
function optimizeVideoPrompt(prompt) {
  if (!prompt) return 'natural smooth motion';
  let p = prompt
    .replace(/\*\*/g, '')
    .replace(/[`"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (p.length < 20) p += ' high quality cinematic smooth motion';
  return p.slice(0, 1800);
}

// Freepik API 안전 호출
async function safeFreepikCall(url, options, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[${label}] HTTP ${res.status} 응답:`, text.slice(0, 200));
        if ([429, 500, 502, 503, 504].includes(res.status) && attempt < MAX_RETRY) {
          const wait = 1000 * attempt;
            console.log(`[${label}] 재시도 대기 ${wait}ms`);
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
        await sleep(800 * attempt);
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl required' });
    }
    
    // 영상 비율 매핑
    const aspectRatioCode = mapUserAspectRatio(formData.videoAspectRatio);
    const brandLogoProvided = !!(formData.brandLogoProvided || formData.brandLogo);
    const productImageProvided = !!(formData.productImageProvided || formData.productImage);

    console.log('[image-to-video] 시작:', {
      sceneNumber,
      conceptId,
      duration,
      title,
      imageUrl: imageUrl.substring(0, 60) + '...',
      aspectRatio: formData.videoAspectRatio,
      aspectRatioCode,
      brandLogoProvided,
      productImageProvided
    });

    // API 키 확인
    const apiKey = process.env.FREEPIK_API_KEY || 
                   process.env.VITE_FREEPIK_API_KEY ||
                   process.env.REACT_APP_FREEPIK_API_KEY;
    
    if (!apiKey) {
      throw new Error('Freepik API 키가 설정되지 않았습니다');
    }

    // 엔드포인트
    const endpoint = `${FREEPIK_API_BASE}/ai/image-to-video/minimax-hailuo-02-768p`;
    
    // 프롬프트 최적화 + 플래그 부가
    const basePrompt = optimizeVideoPrompt(prompt || 'natural smooth motion');
    const enrichedPrompt = `${basePrompt}
${brandLogoProvided ? 'Brand logo must appear at least briefly (non-destructive overlay planned).' : ''}
${productImageProvided ? 'Product presence continuity expected.' : ''}`.trim();

    // Freepik 제한: 6 or 10초
    const validDuration = [6, 10].includes(duration) ? duration : 6;
    const requestBody = {
      prompt: enrichedPrompt,
      first_frame_image: imageUrl,
      duration: validDuration,
      prompt_optimizer: true,
      aspect_ratio: aspectRatioCode,
      webhook_url: null
    };

    console.log('[image-to-video] API 요청 파라미터:', {
      endpoint,
      prompt: enrichedPrompt.substring(0, 140) + (enrichedPrompt.length > 140 ? '...' : ''),
      duration: requestBody.duration,
      aspect_ratio: requestBody.aspect_ratio,
      first_frame_image: imageUrl.substring(0, 60) + '...',
      prompt_optimizer: requestBody.prompt_optimizer
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-freepik-api-key': apiKey,
        'User-Agent': 'AI-Ad-Creator/2025'
      },
      body: JSON.stringify(requestBody)
    };

    // API 호출 (재시도 로직 포함)
    const result = await safeFreepikCall(endpoint, options, 'image-to-video');
    
    console.log('[image-to-video] API 응답 구조:', {
      hasData: !!result.data,
      dataKeys: result.data ? Object.keys(result.data) : [],
      hasTaskId: !!(result.data?.task_id),
      status: result.data?.status || 'unknown'
    });
    
    if (!result.data || !result.data.task_id) {
      console.error('[image-to-video] 응답에 task_id 없음:', JSON.stringify(result, null, 2));
      throw new Error('비디오 생성 태스크 ID를 받지 못했습니다');
    }
    
    const taskId = result.data.task_id;
    const processingTime = Date.now() - startTime;
    
    console.log('[image-to-video] 성공:', {
      taskId,
      sceneNumber,
      conceptId,
      처리시간: processingTime + 'ms'
    });

    res.status(200).json({
      success: true,
      task: {
        taskId,
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
      meta: {
        processingTime,
        provider: 'Freepik image-to-video minimax-hailuo-02',
        rawStatus: result.data.status || null
      }
    });

  } catch (error) {
    console.error('[image-to-video] ❌ 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

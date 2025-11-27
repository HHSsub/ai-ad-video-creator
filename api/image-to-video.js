import 'dotenv/config';

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAX_RETRY = 5;

// 🔥 engines.json에서 현재 엔진 설정 로드
function loadCurrentEngine() {
  try {
    const enginesPath = path.join(process.cwd(), 'config', 'engines.json');
    const enginesData = JSON.parse(fs.readFileSync(enginesPath, 'utf8'));
    const imageToVideo = enginesData.currentEngine.imageToVideo;
    return {
      endpoint: `${FREEPIK_API_BASE}${imageToVideo.endpoint}`,
      model: imageToVideo.model,
      statusEndpoint: imageToVideo.statusEndpoint
    };
  } catch (error) {
    console.error('[loadCurrentEngine] 오류:', error.message);
    // 폴백: hailuo 사용
    return {
      endpoint: `${FREEPIK_API_BASE}/ai/image-to-video/minimax-hailuo-02-1080p`,
      model: 'hailuo-2.3-standard',
      statusEndpoint: '/ai/image-to-video/minimax-hailuo-02-1080p/{task-id}'
    };
  }
}

function sanitizeCameraSegments(text) {
  if (!text) return '';
  return text.replace(/\b(Canon|Nikon|Sony|Fujifilm|Fuji|Panasonic|Leica|Hasselblad|EOS|Alpha|Lumix|R5|R6|Z6|A7R|A7S|GFX)\b/gi, 'professional').replace(/Camera:\s*/gi, '');
}

function optimizeVideoPrompt(rawPrompt, formData) {
  const base = sanitizeCameraSegments((rawPrompt || '').replace(/\*\*/g,'').replace(/[`"]/g,'').replace(/\s+/g,' ').trim());
  let head = [
    formData?.brandName ? `Brand: ${formData.brandName}` : null,
    formData?.productServiceName ? `Product: ${formData.productServiceName}` : formData?.productServiceCategory ? `Product Category: ${formData.productServiceCategory}` : null,
    formData?.coreTarget ? `Target: ${formData.coreTarget}` : null,
    formData?.videoPurpose ? `Purpose: ${formData.videoPurpose}` : null,
    formData?.coreDifferentiation ? `Differentiation: ${formData.coreDifferentiation}` : null
  ].filter(Boolean).join(', ');
  if (!head) head = 'Commercial brand scenario';
  let merged = base.includes(formData?.brandName || '') ? base : `${head}. ${base}`;
  if (merged.length < 60) merged += ' high quality commercial narrative, product usage clearly visible.';
  return merged.slice(0, 1800);
}

async function safeFreepikCall(url, options, label, logObj={}) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      console.log(`[${label}] 시도 ${attempt}/${MAX_RETRY}`);
      console.log(`[${label}] 요청정보`, JSON.stringify(logObj));
      const res = await fetch(url, options);
      const rawTxt = await res.text();
      let json = {};
      try { json = JSON.parse(rawTxt); } catch { json = rawTxt; }
      if (!res.ok) {
        console.error(`[${label}] HTTP ${res.status}`, rawTxt);
        if ([429,500,502,503,504].includes(res.status) && attempt < MAX_RETRY) {
          const wait = attempt * 1200;
          console.log(`[${label}] 재시도 대기: ${wait}ms`);
          await sleep(wait);
          continue;
        }
        throw new Error(`[${label}] HTTP ${res.status}: ${rawTxt}`);
      }
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

    // duration은 반드시 "5" 또는 "10" (문자열)만 허용
    let validDuration = String([5,10].includes(Number(duration)) ? Number(duration) : 5);

    // 공식문서 기반 인자만 남김
    const requestBody = {
      image: imageUrl,
      prompt: optimized,
      negative_prompt: negativePrompt || 'blurry, low quality, watermark, cartoon, distorted',
      duration: validDuration
    };
    if (imageTail) requestBody.image_tail = imageTail;
    if (cfg_scale !== undefined) requestBody.cfg_scale = cfg_scale;
    if (static_mask !== undefined) requestBody.static_mask = static_mask;
    if (dynamic_masks !== undefined && Array.isArray(dynamic_masks) && dynamic_masks.length > 0) requestBody.dynamic_masks = dynamic_masks;

    console.log('[image-to-video] 최종 요청 바디:', JSON.stringify(requestBody));

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

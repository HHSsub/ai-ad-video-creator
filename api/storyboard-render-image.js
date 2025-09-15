// api/storyboard-render-image.js - 완전 수정 버전

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000;
const POLLING_TIMEOUT = 120000; // 2분 타임아웃
const POLLING_INTERVAL = 3000; // 3초마다 폴링

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 재시도 가능한 에러 판단
function isRetryableError(statusCode, errorMessage) {
  if ([429, 500, 502, 503, 504].includes(statusCode)) return true;
  const msg = (errorMessage || '').toLowerCase();
  return msg.includes('timeout') ||
         msg.includes('overloaded') ||
         msg.includes('rate limit') ||
         msg.includes('quota');
}

// 안전한 API 호출
async function safeFreepikCall(url, options, label = 'API') {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[${label}] 시도 ${attempt}/${MAX_RETRIES}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          console.error(`[${label}] HTTP ${response.status}:`, errorText);
        } catch (e) {
          errorText = `HTTP ${response.status}`;
        }

        if (isRetryableError(response.status, errorText) && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY * attempt;
          console.log(`[${label}] ${delay}ms 후 재시도...`);
          await sleep(delay);
          continue;
        }

        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(`[${label}] 성공 (시도 ${attempt})`);
      return data;

    } catch (error) {
      lastError = error;
      console.error(`[${label}] 시도 ${attempt} 실패:`, error.message);

      if (isRetryableError(null, error.message) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt;
        console.log(`[${label}] ${delay}ms 후 재시도...`);
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  throw lastError || new Error(`${label} 최대 재시도 초과`);
}

// 태스크 상태 폴링 (비동기 완료 대기)
async function pollTaskStatus(taskId, apiKey) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < POLLING_TIMEOUT) {
    try {
      console.log(`[pollTaskStatus] 태스크 ${taskId.substring(0, 8)} 상태 확인 중...`);
      
      const response = await fetch(`${FREEPIK_API_BASE}/ai/text-to-image/flux-dev/${taskId}`, {
        method: 'GET',
        headers: {
          'x-freepik-api-key': apiKey,
          'User-Agent': 'AI-Ad-Creator/2025'
        }
      });

      if (!response.ok) {
        console.error(`[pollTaskStatus] 상태 확인 실패: ${response.status}`);
        await sleep(POLLING_INTERVAL);
        continue;
      }

      const result = await response.json();
      console.log(`[pollTaskStatus] 응답:`, JSON.stringify(result, null, 2));

      // 단일 태스크 응답 처리
      if (result.data) {
        const taskData = result.data;
        const status = taskData.status;
        
        console.log(`[pollTaskStatus] 태스크 상태: ${status}`);
        
        if (status === 'COMPLETED') {
          if (taskData.generated && Array.isArray(taskData.generated) && taskData.generated.length > 0) {
            const imageUrl = taskData.generated[0];
            console.log(`[pollTaskStatus] ✅ 완료 - 이미지 URL: ${imageUrl.substring(0, 60)}...`);
            return imageUrl;
          } else {
            console.warn(`[pollTaskStatus] COMPLETED 상태이지만 generated 배열이 비어있음`);
          }
        } else if (status === 'FAILED') {
          throw new Error(`태스크 실패: ${taskData.error || 'Unknown error'}`);
        } else if (['CREATED', 'IN_PROGRESS', 'PROCESSING'].includes(status)) {
          console.log(`[pollTaskStatus] 진행 중... (${status})`);
          await sleep(POLLING_INTERVAL);
          continue;
        } else {
          console.warn(`[pollTaskStatus] 알 수 없는 상태: ${status}`);
          await sleep(POLLING_INTERVAL);
          continue;
        }
      }
      
      await sleep(POLLING_INTERVAL);
      
    } catch (error) {
      console.error(`[pollTaskStatus] 폴링 오류:`, error.message);
      await sleep(POLLING_INTERVAL);
    }
  }
  
  throw new Error(`태스크 ${taskId} 타임아웃 (${POLLING_TIMEOUT / 1000}초 초과)`);
}

// Freepik Flux Dev API 호출 + 폴링
async function generateImageWithFreepik(imagePrompt, apiKey) {
  console.log('[generateImageWithFreepik] Flux Dev 모델 사용 + 폴링:', {
    prompt: imagePrompt.prompt?.substring(0, 100) + '...',
    size: imagePrompt.image?.size,
    style: imagePrompt.styling?.style,
    seed: imagePrompt.seed
  });

  // ✅ 올바른 Flux Dev 엔드포인트
  const endpoint = `${FREEPIK_API_BASE}/ai/text-to-image/flux-dev`;

  // ✅ 정확한 요청 형식 (문서 기준)
  const requestBody = {
    prompt: imagePrompt.prompt,
    aspect_ratio: imagePrompt.image?.size || "widescreen_16_9",
    styling: {
      effects: {},
      colors: []
    },
    seed: imagePrompt.seed || Math.floor(10000 + Math.random() * 90000),
    webhook_url: null // 동기 처리 (폴링 사용)
  };

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-freepik-api-key': apiKey,
      'User-Agent': 'AI-Ad-Creator/2025'
    },
    body: JSON.stringify(requestBody)
  };

  console.log('[generateImageWithFreepik] API 요청:', {
    endpoint,
    prompt: requestBody.prompt.substring(0, 100) + '...',
    aspect_ratio: requestBody.aspect_ratio,
    seed: requestBody.seed
  });

  try {
    // 1. 태스크 생성
    const result = await safeFreepikCall(endpoint, options, 'flux-dev-create');
    
    console.log('[generateImageWithFreepik] 태스크 생성 응답:', JSON.stringify(result, null, 2));

    if (!result.data || !result.data.task_id) {
      throw new Error('태스크 ID를 받지 못했습니다');
    }

    const taskId = result.data.task_id;
    console.log(`[generateImageWithFreepik] 태스크 생성 완료: ${taskId}`);

    // 2. 태스크 완료까지 폴링
    const imageUrl = await pollTaskStatus(taskId, apiKey);

    return {
      success: true,
      imageUrl: imageUrl,
      method: 'freepik-flux-dev-polling',
      taskId: taskId
    };

  } catch (error) {
    console.error('[generateImageWithFreepik] 전체 실패:', error);
    throw error;
  }
}

// 폴백 이미지 생성
function generateFallbackImage(sceneNumber, conceptId) {
  const themes = [
    { bg: '2563EB', text: 'FFFFFF', label: 'Professional+Business' },
    { bg: '059669', text: 'FFFFFF', label: 'Product+Showcase' },
    { bg: 'DC2626', text: 'FFFFFF', label: 'Lifestyle+Scene' },
    { bg: '7C2D12', text: 'FFFFFF', label: 'Premium+Brand' },
    { bg: '4338CA', text: 'FFFFFF', label: 'Innovation+Tech' },
    { bg: '0891B2', text: 'FFFFFF', label: 'Call+To+Action' }
  ];

  const themeIndex = ((sceneNumber || 1) - 1) % themes.length;
  const theme = themes[themeIndex];

  return `https://via.placeholder.com/1920x1080/${theme.bg}/${theme.text}?text=${theme.label}+Scene+${sceneNumber || 1}`;
}

export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();

  try {
    let { imagePrompt, sceneNumber, conceptId, prompt } = req.body || {};

    console.log('[storyboard-render-image] 요청 수신:', {
      sceneNumber,
      conceptId,
      hasImagePrompt: !!imagePrompt,
      legacyPrompt: !!prompt,
      promptPreview: imagePrompt?.prompt?.substring(0, 50) || (prompt?.substring?.(0,50)+'...') || ''
    });

    // 하위 호환 - 구형 형식 지원
    if(!imagePrompt && prompt){
      imagePrompt = {
        prompt,
        negative_prompt: 'blurry, low quality, watermark, cartoon, distorted',
        image: { size: 'widescreen_16_9' },
        styling: { style: 'photo' },
        seed: Math.floor(10000 + Math.random()*90000),
        num_images: 1
      };
      console.log('[storyboard-render-image] 구형 요청을 imagePrompt로 래핑');
    }

    // imagePrompt 검증
    if (!imagePrompt || !imagePrompt.prompt || typeof imagePrompt.prompt !== 'string' || imagePrompt.prompt.trim().length < 5) {
      console.error('[storyboard-render-image] 유효하지 않은 imagePrompt:', imagePrompt);
      return res.status(400).json({ 
        error: 'Valid imagePrompt required',
        received: imagePrompt
      });
    }

    // API 키 확인
    const apiKey = process.env.FREEPIK_API_KEY ||
                  process.env.VITE_FREEPIK_API_KEY ||
                  process.env.REACT_APP_FREEPIK_API_KEY;

    if (!apiKey) {
      console.error('[storyboard-render-image] Freepik API 키가 없음');
      const fallbackUrl = generateFallbackImage(sceneNumber, conceptId);
      return res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        message: 'API 키 없음',
        processingTime: Date.now() - startTime,
        metadata: { error: 'no_api_key' }
      });
    }

    console.log('[storyboard-render-image] API 키 확인:', apiKey.substring(0, 10) + '...');

    try {
      // ✅ 수정된 Freepik API 호출 (폴링 포함)
      const result = await generateImageWithFreepik(imagePrompt, apiKey);

      const processingTime = Date.now() - startTime;

      console.log('[storyboard-render-image] ✅ 성공 완료:', {
        sceneNumber,
        conceptId,
        imageUrl: result.imageUrl.substring(0, 60) + '...',
        processingTime: processingTime + 'ms',
        taskId: result.taskId
      });

      return res.status(200).json({
        success: true,
        url: result.imageUrl,
        processingTime: processingTime,
        method: result.method,
        fallback: false,
        metadata: {
          sceneNumber,
          conceptId,
          promptUsed: imagePrompt.prompt.substring(0, 100) + '...',
          apiProvider: 'Freepik Flux Dev 2025',
          size: imagePrompt.image?.size,
          style: imagePrompt.styling?.style,
          seed: imagePrompt.seed,
          taskId: result.taskId
        }
      });

    } catch (freepikError) {
      console.error('[storyboard-render-image] Freepik 호출 실패:', freepikError.message);

      // Freepik 실패 시 폴백 이미지 사용
      const fallbackUrl = generateFallbackImage(sceneNumber, conceptId);

      return res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        processingTime: Date.now() - startTime,
        error: freepikError.message,
        metadata: {
          sceneNumber,
          conceptId,
          promptUsed: imagePrompt.prompt.substring(0, 100) + '...',
          apiProvider: 'Fallback',
          originalError: freepikError.message
        }
      });
    }

  } catch (error) {
    console.error('[storyboard-render-image] 전체 시스템 오류:', error);

    const fallbackUrl = generateFallbackImage(
      req.body?.sceneNumber || 1,
      req.body?.conceptId || 1
    );

    return res.status(200).json({
      success: true,
      url: fallbackUrl,
      fallback: true,
      processingTime: Date.now() - startTime,
      error: error.message,
      metadata: {
        systemError: true,
        originalError: error.message
      }
    });
  }
}

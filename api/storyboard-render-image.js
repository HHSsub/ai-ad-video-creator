// api/storyboard-render-image.js - Freepik Mystic API 공식문서 기반 완전수정
// (모든 flux-dev 참조를 mystic 엔드포인트/파라미터로 변경)
// Freepik 문서 기준: POST /v1/ai/mystic, GET /v1/ai/mystic/{task-id}
// 참고: https://docs.freepik.com/api-reference/mystic/post-mystic 및 상태조회 문서 기준

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000;
const POLLING_TIMEOUT = 120000; // 2 minutes
const POLLING_INTERVAL = 3000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 재시도 가능한 에러 판단
function isRetryableError(statusCode, errorMessage) {
  if ([429, 500, 502, 503, 504].includes(statusCode)) return true;
  const msg = (errorMessage || '').toLowerCase();
  return msg.includes('timeout') ||
         msg.includes('overloaded') ||
         msg.includes('rate limit') ||
         msg.includes('quota') ||
         msg.includes('econnreset') ||
         msg.includes('ecancelled');
}

// 안전한 API 호출 (재시도 로직 포함)
async function safeFreepikCall(url, options, label = 'API') {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[${label}] 시도 ${attempt}/${MAX_RETRIES} -> ${url}`);

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
          // 가능한 한 많은 정보 수집
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await response.json();
            errorText = JSON.stringify(json);
          } else {
            errorText = await response.text();
          }
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

      // 성공 시 JSON 파싱
      const data = await response.json();
      console.log(`[${label}] 성공 (시도 ${attempt})`);
      return data;

    } catch (error) {
      lastError = error;
      console.error(`[${label}] 시도 ${attempt} 실패:`, error.message);

      // 재시도 가능한 오류인지 확인
      if (isRetryableError(null, error.message) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt;
        console.log(`[${label}] ${delay}ms 후 재시도...`);
        await sleep(delay);
        continue;
      }

      // 더이상 재시도하지 않음
      break;
    }
  }

  throw lastError || new Error(`${label} 최대 재시도 초과`);
}

// 태스크 상태 폴링 (Mystic 엔드포인트 문서에 따름)
async function pollTaskStatus(taskId, apiKey) {
  const startTime = Date.now();
  while (Date.now() - startTime < POLLING_TIMEOUT) {
    try {
      console.log(`[pollTaskStatus] Mystic 태스크 ${taskId.substring(0, 8)} 상태 확인 중...`);

      const response = await fetch(`${FREEPIK_API_BASE}/ai/mystic/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: {
          'x-freepik-api-key': apiKey,
          'User-Agent': 'AI-Ad-Creator/2025',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        let errtxt = '';
        try { errtxt = await response.text(); } catch(e) {}
        console.error(`[pollTaskStatus] 상태 확인 실패: ${response.status} ${errtxt}`);
        await sleep(POLLING_INTERVAL);
        continue;
      }

      const result = await response.json();
      console.log(`[pollTaskStatus] 응답:`, result);

      if (result && result.data) {
        const taskData = result.data;
        const status = (taskData.status || '').toUpperCase();

        console.log(`[pollTaskStatus] 태스크 상태: ${status}`);

        if (status === 'COMPLETED') {
          if (taskData.generated && Array.isArray(taskData.generated) && taskData.generated.length > 0) {
            const imageUrl = taskData.generated[0];
            console.log(`[pollTaskStatus] ✅ 완료 - 이미지 URL: ${imageUrl.substring(0, 80)}...`);
            return { imageUrl, raw: taskData };
          } else {
            console.warn(`[pollTaskStatus] COMPLETED 상태이지만 generated 배열이 비어있음`);
            return { imageUrl: null, raw: taskData };
          }
        } else if (status === 'FAILED') {
          throw new Error(`태스크 실패: ${taskData.error || 'Unknown error'}`);
        } else if (['IN_PROGRESS', 'PENDING', 'PROCESSING'].includes(status)) {
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

// Freepik Mystic API 공식문서 기반 요청생성
async function generateImageWithFreepik(imagePrompt, apiKey) {
  console.log('[generateImageWithFreepik] Mystic 모델 스펙 사용 + 폴링:', {
    prompt: imagePrompt.prompt,
    size: imagePrompt.image?.size,
    style: imagePrompt.styling?.style,
    seed: imagePrompt.seed
  });

  // Mystic 생성 엔드포인트 (문서: POST /v1/ai/mystic)
  const endpoint = `${FREEPIK_API_BASE}/ai/mystic`;

  // 문서 필드명 기준으로 요청 바디 구성 (문서: prompt, aspect_ratio, resolution, model, engine 등)
  const requestBody = {
    prompt: imagePrompt.prompt,
    webhook_url: imagePrompt.webhook_url || null,
    structure_reference: imagePrompt.structure_reference || null, // base64 string if provided
    structure_strength: imagePrompt.structure_strength ?? 50,
    style_reference: imagePrompt.style_reference || null, // base64 string if provided
    adherence: imagePrompt.adherence ?? 50,
    hdr: imagePrompt.hdr ?? 50,
    resolution: imagePrompt.resolution || (imagePrompt.image?.resolution || "2k"),
    aspect_ratio: imagePrompt.image?.size || imagePrompt.aspect_ratio || "widescreen_16_9",
    model: imagePrompt.model || "realism",
    creative_detailing: imagePrompt.creative_detailing ?? 33,
    engine: imagePrompt.engine || "automatic",
    fixed_generation: imagePrompt.fixed_generation ?? false,
    filter_nsfw: imagePrompt.filter_nsfw ?? true,
    // styling: styles/characters/colors 구조 (문서 상의 형식 유지)
    styling: imagePrompt.styling ? {
      styles: imagePrompt.styling?.styles || [],
      characters: imagePrompt.styling?.characters || [],
      colors: imagePrompt.styling?.colors || []
    } : undefined,
    // optional reproducibility seed
    seed: imagePrompt.seed || undefined,
    num_images: imagePrompt.num_images || 1
  };

  // undefined/null/빈값 제거: Freepik 문서가 빈값 허용하지 않을 수 있으므로 정리
  Object.keys(requestBody).forEach(key => {
    const v = requestBody[key];
    if (v === undefined || v === null) delete requestBody[key];
    if (typeof v === 'string' && v.trim() === '') delete requestBody[key];
    if (Array.isArray(v) && v.length === 0) delete requestBody[key];
  });

  // styling 내부 정리
  if (requestBody.styling) {
    Object.keys(requestBody.styling).forEach(k => {
      const vv = requestBody.styling[k];
      if (vv === undefined || vv === null) delete requestBody.styling[k];
      if (Array.isArray(vv) && vv.length === 0) delete requestBody.styling[k];
    });
    if (Object.keys(requestBody.styling).length === 0) delete requestBody.styling;
  }

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-freepik-api-key': apiKey,
      'User-Agent': 'AI-Ad-Creator/2025',
      'Accept': 'application/json'
    },
    body: JSON.stringify(requestBody)
  };

  console.log('[generateImageWithFreepik] API 요청 엔드포인트:', endpoint);
  console.log('[generateImageWithFreepik] 요청 바디 예시 (prompt 절대 자르지 않음):', {
    promptPreview: (imagePrompt.prompt || '').substring(0, 200) + (imagePrompt.prompt && imagePrompt.prompt.length > 200 ? '...[truncated preview]' : ''),
    resolvedBodyKeys: Object.keys(requestBody)
  });

  try {
    // 태스크 생성: POST /v1/ai/mystic
    const result = await safeFreepikCall(endpoint, options, 'mystic-create');
    console.log('[generateImageWithFreepik] 태스크 생성 응답:', result);

    if (!result || !result.data || !result.data.task_id) {
      throw new Error('태스크 ID를 받지 못했습니다 (Freepik 응답 비정상)');
    }

    const taskId = result.data.task_id;
    console.log(`[generateImageWithFreepik] 태스크 생성 완료: ${taskId}`);

    // 폴링으로 완료될 때까지 대기 (또는 webhook 사용 가능)
    const pollResult = await pollTaskStatus(taskId, apiKey);

    // pollResult: { imageUrl, raw }
    const imageUrl = pollResult.imageUrl || null;

    return {
      success: true,
      imageUrl: imageUrl,
      method: 'freepik-mystic-polling',
      taskId: taskId,
      raw: pollResult.raw
    };

  } catch (error) {
    console.error('[generateImageWithFreepik] 전체 실패:', error);
    throw error;
  }
}

// 폴백 이미지 생성 (디자인/디버깅 용)
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
  // CORS 기본 처리
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
      promptPreview: (imagePrompt?.prompt || prompt || '').substring(0, 200)
    });

    // 하위 호환 - 구형 형식 지원
    if (!imagePrompt && prompt) {
      imagePrompt = {
        prompt,
        negative_prompt: 'blurry, low quality, watermark, cartoon, distorted',
        image: { size: 'widescreen_16_9' },
        styling: { style: 'photo' },
        seed: Math.floor(10000 + Math.random() * 90000),
        num_images: 1
      };
      console.log('[storyboard-render-image] 구형 요청을 imagePrompt로 래핑');
    }

    if (!imagePrompt || !imagePrompt.prompt || typeof imagePrompt.prompt !== 'string' || imagePrompt.prompt.trim().length < 5) {
      console.error('[storyboard-render-image] 유효하지 않은 imagePrompt:', imagePrompt);
      return res.status(400).json({
        error: 'Valid imagePrompt required',
        received: imagePrompt
      });
    }

    // Freepik API Key (환경변수 우선)
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

    console.log('[storyboard-render-image] API 키 확인:', apiKey.substring(0, 8) + '...');

    try {
      // 프롬프트 절대 자르지 않음: imagePrompt.prompt 전체를 전달
      const result = await generateImageWithFreepik(imagePrompt, apiKey);

      const processingTime = Date.now() - startTime;

      console.log('[storyboard-render-image] ✅ 성공 완료:', {
        sceneNumber,
        conceptId,
        imageUrl: result.imageUrl,
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
          promptUsed: imagePrompt.prompt, // 절대 자르지 않음
          apiProvider: 'Freepik Mystic 2025',
          size: imagePrompt.image?.size || imagePrompt.aspect_ratio,
          style: imagePrompt.styling?.style || null,
          seed: imagePrompt.seed || null,
          taskId: result.taskId,
          raw: result.raw || null
        }
      });

    } catch (freepikError) {
      console.error('[storyboard-render-image] Freepik 호출 실패:', freepikError && freepikError.message ? freepikError.message : String(freepikError));

      const fallbackUrl = generateFallbackImage(sceneNumber, conceptId);

      return res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        processingTime: Date.now() - startTime,
        error: freepikError && freepikError.message ? freepikError.message : String(freepikError),
        metadata: {
          sceneNumber,
          conceptId,
          promptUsed: imagePrompt.prompt, // 절대 자르지 않음
          apiProvider: 'Fallback',
          originalError: freepikError && freepikError.message ? freepikError.message : String(freepikError)
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
      error: error.message || String(error),
      metadata: {
        systemError: true,
        originalError: error.message || String(error)
      }
    });
  }
}

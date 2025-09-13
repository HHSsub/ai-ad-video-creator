// api/storyboard-render-image.js - init.js 결과물을 정확히 받아서 처리

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000;

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

// 2025년 최신 Freepik Text-to-Image API 호출 (init.js 결과물 사용)
async function generateImageWithFreepik(imagePrompt, apiKey) {
  console.log('[generateImageWithFreepik] init.js 결과물 사용:', {
    prompt: imagePrompt.prompt?.substring(0, 100) + '...',
    size: imagePrompt.image?.size,
    style: imagePrompt.styling?.style,
    seed: imagePrompt.seed
  });

  // 2025년 최신 엔드포인트 - /v1 추가 필수
  const endpoint = `${FREEPIK_API_BASE}/ai/text-to-image`;

  // init.js에서 생성된 정확한 형식 그대로 사용
  const requestBody = {
    prompt: imagePrompt.prompt,
    negative_prompt: imagePrompt.negative_prompt || "blurry, low quality, watermark, cartoon, distorted",
    num_images: imagePrompt.num_images || 1,
    image: {
      size: imagePrompt.image?.size || "widescreen_16_9"
    },
    styling: {
      style: imagePrompt.styling?.style || "photo"
    },
    seed: imagePrompt.seed || Math.floor(10000 + Math.random() * 90000)
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

  console.log('[generateImageWithFreepik] Freepik API 요청:', {
    endpoint,
    prompt: requestBody.prompt.substring(0, 100) + '...',
    size: requestBody.image.size,
    style: requestBody.styling.style,
    seed: requestBody.seed
  });

  try {
    const result = await safeFreepikCall(endpoint, options, 'text-to-image');

    // 응답 로깅 (base64는 너무 길어서 줄임)
    const logResult = JSON.parse(JSON.stringify(result));
    if (logResult.data && Array.isArray(logResult.data)) {
      logResult.data.forEach((item, index) => {
        if (item.base64 && item.base64.length > 100) {
          logResult.data[index] = { ...item, base64: `[BASE64_DATA_${item.base64.length}_CHARS]` };
        }
      });
    }
    console.log('[generateImageWithFreepik] 응답 구조:', JSON.stringify(logResult, null, 2));

    // 2025년 Freepik API는 base64로 이미지를 반환함
    let imageUrl = null;

    if (result.data && Array.isArray(result.data) && result.data.length > 0) {
      const firstItem = result.data[0];

      // base64 데이터가 있는 경우 data URL로 변환
      if (firstItem.base64) {
        console.log('[generateImageWithFreepik] Base64 데이터 감지, Data URL로 변환 중...');
        imageUrl = `data:image/jpeg;base64,${firstItem.base64}`;
        console.log('[generateImageWithFreepik] Data URL 생성 완료 (길이: ' + imageUrl.length + ' chars)');

      } else if (firstItem.url) {
        imageUrl = firstItem.url;
        console.log('[generateImageWithFreepik] 직접 URL 사용:', imageUrl);

      } else if (typeof firstItem === 'string' && firstItem.startsWith('http')) {
        imageUrl = firstItem;
        console.log('[generateImageWithFreepik] 배열 첫 번째 요소가 URL:', imageUrl);
      }
    } else if (result.url) {
      imageUrl = result.url;
    }

    if (!imageUrl) {
      console.error('[generateImageWithFreepik] 이미지 데이터 추출 실패. 응답 구조:', logResult);
      throw new Error('응답에서 이미지 데이터(base64 또는 URL)를 찾을 수 없음');
    }

    console.log('[generateImageWithFreepik] 이미지 데이터 추출 성공 (타입: ' + (imageUrl.startsWith('data:') ? 'Data URL' : 'HTTP URL') + ')');

    return {
      success: true,
      imageUrl: imageUrl,
      method: 'freepik-2025'
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
    // init.js에서 생성된 정확한 형식으로 받음
    let { imagePrompt, sceneNumber, conceptId, prompt } = req.body || {};

    console.log('[storyboard-render-image] 요청 수신:', {
      sceneNumber,
      conceptId,
      hasImagePrompt: !!imagePrompt,
      legacyPrompt: !!prompt,
      promptPreview: imagePrompt?.prompt?.substring(0, 50) || (prompt?.substring?.(0,50)+'...') || ''
    });

    // ★ Z+: 하위 호환 - 구형 형식 {prompt, sceneNumber, conceptId} 만 온 경우 imagePrompt로 래핑
    if(!imagePrompt && prompt){
      imagePrompt = {
        prompt,
        negative_prompt: 'blurry, low quality, watermark, cartoon, distorted',
        image: { size: 'widescreen_16_9' },
        styling: { style: 'photo' },
        seed: Math.floor(10000 + Math.random()*90000),
        num_images: 1
      };
      console.log('[storyboard-render-image][Z+] 구형 요청을 imagePrompt로 래핑 적용');
    }

    // imagePrompt 검증 (init.js 결과물 형식)
    if (!imagePrompt || !imagePrompt.prompt || typeof imagePrompt.prompt !== 'string' || imagePrompt.prompt.trim().length < 5) {
      console.error('[storyboard-render-image] 유효하지 않은 imagePrompt:', imagePrompt);
      return res.status(400).json({ 
        error: 'Valid imagePrompt required from storyboard-init (or legacy prompt)',
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
      // init.js 결과물을 그대로 Freepik에 전달
      const result = await generateImageWithFreepik(imagePrompt, apiKey);

      const processingTime = Date.now() - startTime;

      console.log('[storyboard-render-image] 성공 완료:', {
        sceneNumber,
        conceptId,
        imageUrl: result.imageUrl.substring(0, 60) + '...',
        processingTime: processingTime + 'ms'
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
          apiProvider: 'Freepik 2025',
          size: imagePrompt.image?.size,
          style: imagePrompt.styling?.style,
          seed: imagePrompt.seed
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

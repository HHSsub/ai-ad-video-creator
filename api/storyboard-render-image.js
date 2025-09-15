// api/storyboard-render-image.js - 완전 수정된 버전

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
      console.log(`[${label}] 시도 ${attempt}/${MAX_RETRIES} - ${url}`);

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

// 🔥 다중 엔드포인트 시도로 Flux Realism 찾기
async function generateImageWithFreepik(imagePrompt, apiKey) {
  console.log('[generateImageWithFreepik] Flux Realism 모델 추적 시작:', {
    prompt: imagePrompt.prompt?.substring(0, 100) + '...',
    size: imagePrompt.image?.size,
    style: imagePrompt.styling?.style,
    seed: imagePrompt.seed
  });

  // 🔥 가능한 모든 Flux Realism 엔드포인트 (우선순위 순)
  const endpointAttempts = [
    // 가장 가능성 높은 Realism 엔드포인트들
    {
      url: `${FREEPIK_API_BASE}/ai/text-to-image/flux-realism`,
      model: 'flux-realism',
      payload: (imagePrompt) => ({
        prompt: imagePrompt.prompt,
        aspect_ratio: imagePrompt.image?.size || "widescreen_16_9",
        styling: { style: imagePrompt.styling?.style || "photo" },
        seed: imagePrompt.seed || Math.floor(10000 + Math.random() * 90000),
        webhook_url: null
      })
    },
    {
      url: `${FREEPIK_API_BASE}/ai/text-to-image/flux-realistic`,
      model: 'flux-realistic',
      payload: (imagePrompt) => ({
        prompt: imagePrompt.prompt,
        aspect_ratio: imagePrompt.image?.size || "widescreen_16_9",
        styling: { style: imagePrompt.styling?.style || "photo" },
        seed: imagePrompt.seed || Math.floor(10000 + Math.random() * 90000),
        webhook_url: null
      })
    },
    {
      url: `${FREEPIK_API_BASE}/ai/flux-realism`,
      model: 'flux-realism-alt',
      payload: (imagePrompt) => ({
        prompt: imagePrompt.prompt,
        aspect_ratio: imagePrompt.image?.size || "widescreen_16_9",
        styling: { style: imagePrompt.styling?.style || "photo" },
        seed: imagePrompt.seed || Math.floor(10000 + Math.random() * 90000)
      })
    },
    // Freepik의 일반 AI 엔드포인트에 모델 파라미터 추가
    {
      url: `${FREEPIK_API_BASE}/ai/text-to-image`,
      model: 'generic-realism',
      payload: (imagePrompt) => ({
        prompt: imagePrompt.prompt,
        model: 'flux-realism', // 모델 파라미터로 지정
        aspect_ratio: imagePrompt.image?.size || "widescreen_16_9",
        styling: { style: imagePrompt.styling?.style || "photo" },
        seed: imagePrompt.seed || Math.floor(10000 + Math.random() * 90000),
        webhook_url: null
      })
    },
    // Flux Dev 폴백 (프리미엄 사용자면 이것도 고품질)
    {
      url: `${FREEPIK_API_BASE}/ai/text-to-image/flux-dev`,
      model: 'flux-dev-fallback',
      payload: (imagePrompt) => ({
        prompt: imagePrompt.prompt,
        aspect_ratio: imagePrompt.image?.size || "widescreen_16_9",
        styling: { style: imagePrompt.styling?.style || "photo" },
        seed: imagePrompt.seed || Math.floor(10000 + Math.random() * 90000),
        webhook_url: null
      })
    },
    // 일반 Flux 폴백
    {
      url: `${FREEPIK_API_BASE}/ai/text-to-image/flux`,
      model: 'flux-general',
      payload: (imagePrompt) => ({
        prompt: imagePrompt.prompt,
        aspect_ratio: imagePrompt.image?.size || "widescreen_16_9",
        styling: { style: imagePrompt.styling?.style || "photo" },
        seed: imagePrompt.seed || Math.floor(10000 + Math.random() * 90000),
        webhook_url: null
      })
    }
  ];

  let lastError = null;
  
  for (const attempt of endpointAttempts) {
    try {
      console.log(`[generateImageWithFreepik] 엔드포인트 시도: ${attempt.url} (모델: ${attempt.model})`);
      
      const requestBody = attempt.payload(imagePrompt);
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-freepik-api-key': apiKey,
          'User-Agent': 'AI-Ad-Creator/2025-Premium'
        },
        body: JSON.stringify(requestBody)
      };

      console.log(`[generateImageWithFreepik] 요청 페이로드:`, {
        url: attempt.url,
        prompt: requestBody.prompt.substring(0, 100) + '...',
        aspect_ratio: requestBody.aspect_ratio,
        model: attempt.model
      });

      const result = await safeFreepikCall(attempt.url, options, `${attempt.model}`);
      
      // 🔥 응답에서 이미지 URL 추출 (모든 가능한 구조 처리)
      let imageUrl = null;
      
      // 방법 1: data.generated 배열 (최신 API)
      if (result.data && result.data.generated && Array.isArray(result.data.generated)) {
        imageUrl = result.data.generated[0];
        console.log(`[generateImageWithFreepik] ✅ ${attempt.model} 성공 - generated 배열에서 URL 추출`);
      }
      // 방법 2: data 배열 (이전 버전)
      else if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        const firstItem = result.data[0];
        if (firstItem.base64) {
          imageUrl = `data:image/jpeg;base64,${firstItem.base64}`;
          console.log(`[generateImageWithFreepik] ✅ ${attempt.model} 성공 - Base64 변환`);
        } else if (firstItem.url) {
          imageUrl = firstItem.url;
          console.log(`[generateImageWithFreepik] ✅ ${attempt.model} 성공 - 직접 URL`);
        }
      }
      // 방법 3: 직접 URL (가장 단순한 구조)
      else if (result.url) {
        imageUrl = result.url;
        console.log(`[generateImageWithFreepik] ✅ ${attempt.model} 성공 - 루트 URL`);
      }
      // 방법 4: 중첩된 구조들
      else if (result.image && result.image.url) {
        imageUrl = result.image.url;
        console.log(`[generateImageWithFreepik] ✅ ${attempt.model} 성공 - image.url`);
      }

      if (imageUrl) {
        console.log(`[generateImageWithFreepik] 🎉 최종 성공! 모델: ${attempt.model}, URL 타입: ${imageUrl.startsWith('data:') ? 'Data URL' : 'HTTP URL'}`);
        
        return {
          success: true,
          imageUrl: imageUrl,
          method: `freepik-${attempt.model}-2025`,
          endpoint: attempt.url,
          modelUsed: attempt.model
        };
      } else {
        console.warn(`[generateImageWithFreepik] ${attempt.model} 응답에서 이미지 URL 없음:`, JSON.stringify(result, null, 2));
        continue; // 다음 엔드포인트 시도
      }
      
    } catch (error) {
      console.log(`[generateImageWithFreepik] ${attempt.model} 실패: ${error.message}`);
      lastError = error;
      continue; // 다음 엔드포인트 시도
    }
  }

  // 모든 엔드포인트 실패
  console.error('[generateImageWithFreepik] 🚨 모든 Flux 엔드포인트 실패!');
  throw lastError || new Error('모든 Freepik Flux 엔드포인트 실패');
}

// 폴백 이미지 생성 (더 정교한 테마)
function generateFallbackImage(sceneNumber, conceptId) {
  const themes = [
    { bg: '1e40af', text: 'FFFFFF', label: 'Professional+Scene' },
    { bg: '059669', text: 'FFFFFF', label: 'Product+Focus' },
    { bg: 'dc2626', text: 'FFFFFF', label: 'Dynamic+Action' },
    { bg: '7c2d12', text: 'FFFFFF', label: 'Premium+Brand' },
    { bg: '4338ca', text: 'FFFFFF', label: 'Tech+Innovation' },
    { bg: '0891b2', text: 'FFFFFF', label: 'Call+To+Action' }
  ];

  const themeIndex = ((sceneNumber || 1) - 1) % themes.length;
  const theme = themes[themeIndex];

  return `https://via.placeholder.com/1920x1080/${theme.bg}/${theme.text}?text=${theme.label}+Concept+${conceptId || 1}+Scene+${sceneNumber || 1}`;
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

    console.log('[storyboard-render-image] 🚀 프리미엄 Flux Realism 요청:', {
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
      console.error('[storyboard-render-image] ❌ 유효하지 않은 imagePrompt:', imagePrompt);
      return res.status(400).json({ 
        error: 'Valid imagePrompt required from storyboard-init',
        received: imagePrompt
      });
    }

    // API 키 확인
    const apiKey = process.env.FREEPIK_API_KEY ||
                  process.env.VITE_FREEPIK_API_KEY ||
                  process.env.REACT_APP_FREEPIK_API_KEY;

    if (!apiKey) {
      console.error('[storyboard-render-image] ❌ Freepik API 키가 없음');
      const fallbackUrl = generateFallbackImage(sceneNumber, conceptId);
      return res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        message: 'API 키 없음 - 플레이스홀더 사용',
        processingTime: Date.now() - startTime,
        metadata: { error: 'no_api_key' }
      });
    }

    console.log('[storyboard-render-image] ✅ API 키 확인:', apiKey.substring(0, 10) + '...');

    try {
      // 🔥 다중 엔드포인트 Flux Realism 시도
      const result = await generateImageWithFreepik(imagePrompt, apiKey);

      const processingTime = Date.now() - startTime;

      console.log('[storyboard-render-image] 🎉 최종 성공:', {
        sceneNumber,
        conceptId,
        modelUsed: result.modelUsed,
        endpoint: result.endpoint,
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
          apiProvider: 'Freepik Premium Multi-Endpoint',
          modelUsed: result.modelUsed,
          endpointUsed: result.endpoint,
          size: imagePrompt.image?.size,
          style: imagePrompt.styling?.style,
          seed: imagePrompt.seed
        }
      });

    } catch (freepikError) {
      console.error('[storyboard-render-image] 🚨 모든 Freepik 엔드포인트 실패:', freepikError.message);

      // 최후의 폴백 이미지 사용
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
          apiProvider: 'Fallback - All Endpoints Failed',
          originalError: freepikError.message,
          attemptedEndpoints: 'flux-realism, flux-realistic, flux-dev, flux-general'
        }
      });
    }

  } catch (error) {
    console.error('[storyboard-render-image] 🚨 전체 시스템 오류:', error);

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

// api/storyboard-render-image.js - 2025년 최신 Freepik API 사용

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

// 프롬프트 최적화 (2025년 기준)
function optimizePrompt(prompt) {
  let optimized = prompt.trim();
  
  // 길이 제한 (Freepik 2025 제한: 1000자)
  if (optimized.length > 900) {
    optimized = optimized.substring(0, 850) + '...';
  }
  
  // 필수 품질 키워드 추가
  const qualityTerms = ['high quality', 'professional', 'detailed', '4K', 'commercial'];
  const hasQuality = qualityTerms.some(term => 
    optimized.toLowerCase().includes(term.toLowerCase())
  );
  
  if (!hasQuality) {
    optimized += ', high quality, professional, commercial photography, 4K, detailed';
  }
  
  // 부정적 요소 제거를 위한 키워드
  if (!optimized.includes('sharp focus')) {
    optimized += ', sharp focus, clean composition';
  }
  
  return optimized;
}

// 2025년 최신 Freepik Text-to-Image API 호출
async function generateImageWithFreepik(prompt, apiKey) {
  const optimizedPrompt = optimizePrompt(prompt);
  
  console.log('[generateImageWithFreepik] 프롬프트:', optimizedPrompt.substring(0, 100) + '...');
  
  // 2025년 최신 엔드포인트 및 파라미터
  const endpoint = `${FREEPIK_API_BASE}/ai/text-to-image`;
  
  const requestBody = {
    prompt: optimizedPrompt,
    num_images: 1,
    image: {
      size: "widescreen_16_9"
    },
    styling: {
      style: "photo",
      color: "color",
      lighting: "natural"
    },
    negative_prompt: "blurry, low quality, watermark, text overlay, distorted, ugly, deformed",
    seed: Math.floor(Math.random() * 999999),
    enhance_prompt: true,
    safety_tolerance: "strict"
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
  
  console.log('[generateImageWithFreepik] API 요청 시작');
  
  try {
    const result = await safeFreepikCall(endpoint, options, 'text-to-image');
    
    console.log('[generateImageWithFreepik] 전체 응답:', JSON.stringify(result, null, 2));
    
    // 2025년 Freepik 응답에서 이미지 URL 추출
    let imageUrl = null;
    
    // 다양한 응답 구조 대응
    if (result.data) {
      if (Array.isArray(result.data) && result.data.length > 0) {
        imageUrl = result.data[0]; // 직접 URL 배열
      } else if (result.data.url) {
        imageUrl = result.data.url; // 객체 안의 url
      } else if (result.data.image_url) {
        imageUrl = result.data.image_url; // image_url 필드
      } else if (result.data.images && Array.isArray(result.data.images) && result.data.images.length > 0) {
        imageUrl = result.data.images[0].url || result.data.images[0]; // images 배열
      }
    } else if (result.url) {
      imageUrl = result.url; // 최상위 url
    } else if (result.image_url) {
      imageUrl = result.image_url; // 최상위 image_url
    }
    
    if (!imageUrl || typeof imageUrl !== 'string') {
      console.error('[generateImageWithFreepik] 이미지 URL 추출 실패:', result);
      throw new Error('응답에서 유효한 이미지 URL을 찾을 수 없음');
    }
    
    // URL 유효성 검사
    if (!imageUrl.startsWith('http')) {
      console.error('[generateImageWithFreepik] 잘못된 URL 형식:', imageUrl);
      throw new Error('유효하지 않은 이미지 URL 형식');
    }
    
    console.log('[generateImageWithFreepik] 이미지 URL 추출 성공:', imageUrl);
    
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

// 폴백 이미지 생성 (더 다양하게)
function generateFallbackImage(conceptId, sceneNumber) {
  const themes = [
    { bg: '2563EB', text: 'FFFFFF', label: 'Professional+Business' },
    { bg: '059669', text: 'FFFFFF', label: 'Product+Showcase' },
    { bg: 'DC2626', text: 'FFFFFF', label: 'Lifestyle+Scene' },
    { bg: '7C2D12', text: 'FFFFFF', label: 'Premium+Brand' },
    { bg: '4338CA', text: 'FFFFFF', label: 'Innovation+Tech' },
    { bg: '0891B2', text: 'FFFFFF', label: 'Call+To+Action' }
  ];
  
  const themeIndex = ((conceptId || 1) - 1) % themes.length;
  const theme = themes[themeIndex];
  const scene = sceneNumber || 1;
  
  return `https://via.placeholder.com/1920x1080/${theme.bg}/${theme.text}?text=${theme.label}+Scene+${scene}`;
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
    const { prompt, sceneNumber, conceptId, style } = req.body || {};
    
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
      return res.status(400).json({ error: 'Valid prompt required (minimum 5 characters)' });
    }
    
    console.log('[storyboard-render-image] 요청 시작:', {
      conceptId,
      sceneNumber,
      style,
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 50) + '...'
    });

    // API 키 확인 (우선순위에 따라)
    const apiKey = process.env.FREEPIK_API_KEY ||
                   process.env.VITE_FREEPIK_API_KEY ||
                   process.env.REACT_APP_FREEPIK_API_KEY;
    
    if (!apiKey) {
      console.error('[storyboard-render-image] Freepik API 키가 없음');
      const fallbackUrl = generateFallbackImage(conceptId, sceneNumber);
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
      // Freepik 2025 이미지 생성 시도
      const result = await generateImageWithFreepik(prompt, apiKey);
      
      const processingTime = Date.now() - startTime;
      
      console.log('[storyboard-render-image] 성공 완료:', {
        conceptId,
        sceneNumber,
        imageUrl: result.imageUrl.substring(0, 60) + '...',
        processingTime: processingTime + 'ms'
      });
      
      // 로컬 저장하지 않고 직접 Freepik URL 반환
      return res.status(200).json({
        success: true,
        url: result.imageUrl, // 직접 Freepik URL 사용
        processingTime: processingTime,
        method: result.method,
        fallback: false,
        metadata: {
          conceptId,
          sceneNumber,
          style,
          promptUsed: optimizePrompt(prompt).substring(0, 100) + '...',
          apiProvider: 'Freepik 2025'
        }
      });
      
    } catch (freepikError) {
      console.error('[storyboard-render-image] Freepik 호출 실패:', freepikError.message);
      
      // Freepik 실패 시 폴백 이미지 사용
      const fallbackUrl = generateFallbackImage(conceptId, sceneNumber);
      
      return res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        processingTime: Date.now() - startTime,
        error: freepikError.message,
        metadata: {
          conceptId,
          sceneNumber,
          style,
          promptUsed: prompt.substring(0, 100) + '...',
          apiProvider: 'Fallback',
          originalError: freepikError.message
        }
      });
    }
    
  } catch (error) {
    console.error('[storyboard-render-image] 전체 시스템 오류:', error);
    
    const fallbackUrl = generateFallbackImage(
      req.body?.conceptId || 1, 
      req.body?.sceneNumber || 1
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

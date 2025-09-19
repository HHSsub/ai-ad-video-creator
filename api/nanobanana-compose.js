// api/nanobanana-compose.js - 2025년 최신 Nano Banana API 연동 (fal.ai 기반)

import 'dotenv/config';
import fetch from 'node-fetch';

// 🔥 fal.ai nano-banana API 설정 (2025년 9월 기준 최신)
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.VITE_FAL_API_KEY;
const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY || process.env.VITE_FREEPIK_API_KEY;

// 2025년 9월 기준 올바른 API 엔드포인트들
const FAL_NANO_BANANA_ENDPOINT = 'https://queue.fal.run/fal-ai/nano-banana/edit';
const FREEPIK_NANO_BANANA_ENDPOINT = 'https://api.freepik.com/v1/ai/text-to-image';

const MAX_COMPOSITION_RETRIES = 2;
const INITIAL_RETRY_DELAY = 3000;
const SUBSEQUENT_RETRY_DELAY = 5000;
const RATE_LIMIT_BASE_DELAY = 2000;

// 🔥 개선된 API 키 관리자 클래스
class ApiKeyManager {
  constructor() {
    this.falAvailable = !!FAL_API_KEY;
    this.freepikAvailable = !!FREEPIK_API_KEY;
    this.usage = {
      fal: { requests: 0, errors: 0, lastUsed: 0 },
      freepik: { requests: 0, errors: 0, lastUsed: 0 }
    };
    
    console.log(`[ApiKeyManager] 초기화: fal.ai=${this.falAvailable}, freepik=${this.freepikAvailable}`);
  }
  
  getBestProvider() {
    const now = Date.now();
    
    // fal.ai를 우선 선택 (더 안정적)
    if (this.falAvailable) {
      const falCooldown = now - this.usage.fal.lastUsed;
      if (falCooldown > RATE_LIMIT_BASE_DELAY) {
        return 'fal';
      }
    }
    
    // freepik 차선책
    if (this.freepikAvailable) {
      const freepikCooldown = now - this.usage.freepik.lastUsed;
      if (freepikCooldown > RATE_LIMIT_BASE_DELAY) {
        return 'freepik';
      }
    }
    
    // 쿨다운 중이라도 사용 가능한 것 중 에러율이 낮은 것 선택
    if (this.falAvailable && this.freepikAvailable) {
      const falErrorRate = this.usage.fal.requests > 0 ? this.usage.fal.errors / this.usage.fal.requests : 0;
      const freepikErrorRate = this.usage.freepik.requests > 0 ? this.usage.freepik.errors / this.usage.freepik.requests : 0;
      return falErrorRate <= freepikErrorRate ? 'fal' : 'freepik';
    }
    
    return this.falAvailable ? 'fal' : (this.freepikAvailable ? 'freepik' : null);
  }
  
  markUsage(provider, success = true) {
    const now = Date.now();
    if (this.usage[provider]) {
      this.usage[provider].requests++;
      this.usage[provider].lastUsed = now;
      if (!success) {
        this.usage[provider].errors++;
      }
    }
  }
  
  getStats() {
    return {
      fal: {
        available: this.falAvailable,
        ...this.usage.fal,
        errorRate: this.usage.fal.requests > 0 ? 
          (this.usage.fal.errors / this.usage.fal.requests * 100).toFixed(1) + '%' : '0%'
      },
      freepik: {
        available: this.freepikAvailable,
        ...this.usage.freepik,
        errorRate: this.usage.freepik.requests > 0 ? 
          (this.usage.freepik.errors / this.usage.freepik.requests * 100).toFixed(1) + '%' : '0%'
      }
    };
  }
}

const keyManager = new ApiKeyManager();

/**
 * 이미지 URL을 base64로 변환 (향상된 버전)
 */
async function imageUrlToBase64(imageUrl, maxRetries = 2) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[imageUrlToBase64] 다운로드 시도 ${attempt}/${maxRetries}: ${imageUrl.substring(0, 60)}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20초 타임아웃
      
      const response = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*,*/*;q=0.8'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      
      console.log(`[imageUrlToBase64] 변환 완료: ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB`);
      return base64;
      
    } catch (error) {
      lastError = error;
      console.error(`[imageUrlToBase64] 시도 ${attempt} 실패:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = 1000 * attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('이미지 다운로드 실패');
}

/**
 * base64 데이터 정리 함수
 */
function extractBase64Data(base64Input) {
  if (typeof base64Input !== 'string') {
    throw new Error('Invalid base64 input type');
  }
  
  if (base64Input.startsWith('data:')) {
    const parts = base64Input.split(',');
    if (parts.length !== 2) {
      throw new Error('Invalid data URL format');
    }
    return parts[1];
  }
  
  return base64Input;
}

/**
 * 🔥 합성 프롬프트 생성 (한국어 최적화)
 */
function generateCompositingPrompt(compositingInfo) {
  const { compositingContext, needsProductImage, needsBrandLogo } = compositingInfo;
  
  let prompt = `Seamlessly compose and integrate these images. `;
  
  // 베이스 이미지 설명
  prompt += `Use the first image as the background scene. `;
  
  // 오버레이 이미지 처리 방식
  if (needsProductImage && needsBrandLogo) {
    prompt += `The second image contains a product and brand logo. Naturally place the product as the main focus and integrate the logo elegantly. `;
  } else if (needsProductImage) {
    prompt += `The second image contains a product. Place it prominently and naturally in the scene as the focal point. `;
  } else if (needsBrandLogo) {
    prompt += `The second image contains a brand logo. Integrate it subtly but visibly in the composition. `;
  }

  // 컨텍스트별 세부 지침
  switch (compositingContext) {
    case 'PRODUCT_COMPOSITING_SCENE':
    case 'EXPLICIT':
      prompt += `This is a product showcase scene. Make the product the clear hero of the image while maintaining scene harmony. `;
      break;
    case 'AUTO_PURCHASE_CONVERSION':
      prompt += `This is for purchase conversion. Position the product attractively as a desirable solution. `;
      break;
    case 'AUTO_BRAND_AWARENESS':
      prompt += `This is for brand awareness. Create a memorable and aesthetically appealing composition. `;
      break;
  }

  // 기술적 요구사항
  prompt += `
Requirements:
- Maintain consistent lighting and shadows between all elements
- Preserve the original background atmosphere and mood
- Ensure realistic perspective and natural scale
- Match color temperature across the entire composition  
- Create professional, seamless integration
- Keep everything looking natural and believable
- Do not add text, watermarks, or extra elements

Result should look like a single, cohesive photograph where all elements belong together naturally.`;

  return prompt;
}

/**
 * 🔥 fal.ai nano-banana API 호출 (2025년 최신 사양)
 */
async function callFalNanoBanana(baseImageBase64, overlayImageBase64, compositingPrompt, maxRetries = MAX_COMPOSITION_RETRIES) {
  if (!FAL_API_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[callFalNanoBanana] fal.ai 호출 시도 ${attempt}/${maxRetries}`);
      
      keyManager.markUsage('fal');

      // Rate limiting 딜레이
      if (attempt > 1) {
        const delay = attempt === 2 ? INITIAL_RETRY_DELAY : SUBSEQUENT_RETRY_DELAY;
        console.log(`[callFalNanoBanana] 딜레이: ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // 🔥 2025년 최신 fal.ai API 사양에 맞는 요청 구조
      const requestBody = {
        prompt: compositingPrompt,
        image_urls: [
          `data:image/jpeg;base64,${baseImageBase64}`,
          `data:image/jpeg;base64,${overlayImageBase64}`
        ],
        num_images: 1,
        output_format: "jpeg",
        sync_mode: false  // 비동기 처리로 안정성 확보
      };

      console.log(`[callFalNanoBanana] 요청 데이터 크기: ${JSON.stringify(requestBody).length} bytes`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60초 타임아웃

      // 🔥 올바른 fal.ai API 호출
      const response = await fetch(FAL_NANO_BANANA_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'AI-Ad-Creator/2025'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      console.log(`[callFalNanoBanana] 응답 상태: ${response.status}, 크기: ${responseText.length}`);

      if (!response.ok) {
        console.error(`[callFalNanoBanana] API 오류 ${response.status}:`, responseText.substring(0, 300));
        
        // 재시도 가능한 오류 체크
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
          keyManager.markUsage('fal', false);
          lastError = new Error(`fal.ai API error: ${response.status} ${responseText}`);
          continue;
        }
        
        throw new Error(`fal.ai API error: ${response.status} ${responseText}`);
      }

      const result = JSON.parse(responseText);
      console.log(`[callFalNanoBanana] ✅ fal.ai 응답 성공 (시도 ${attempt})`);
      
      keyManager.markUsage('fal', true);
      return result;
      
    } catch (error) {
      lastError = error;
      keyManager.markUsage('fal', false);
      console.error(`[callFalNanoBanana] 시도 ${attempt} 실패:`, error.message);
      
      // 재시도 조건 체크
      const retryableErrors = ['timeout', '429', '500', '502', '503', '504', 'ECONNRESET'];
      const shouldRetry = retryableErrors.some(code => error.message.includes(code));
      
      if (attempt < maxRetries && shouldRetry) {
        continue;
      }
      
      break;
    }
  }
  
  throw lastError || new Error('fal.ai 최대 재시도 초과');
}

/**
 * 🔥 Freepik API 호출 (백업용)
 */
async function callFreepikNanoBanana(baseImageBase64, overlayImageBase64, compositingPrompt, maxRetries = MAX_COMPOSITION_RETRIES) {
  if (!FREEPIK_API_KEY) {
    throw new Error('FREEPIK_API_KEY not configured');
  }

  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[callFreepikNanoBanana] Freepik 호출 시도 ${attempt}/${maxRetries}`);
      
      keyManager.markUsage('freepik');

      if (attempt > 1) {
        const delay = attempt === 2 ? INITIAL_RETRY_DELAY : SUBSEQUENT_RETRY_DELAY;
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // 🔥 Freepik API 요청 구조 (텍스트-이미지 생성)
      const requestBody = {
        prompt: compositingPrompt + ` Use these reference images for composition guidance.`,
        num_images: 1,
        image: {
          size: "widescreen_16_9"
        },
        styling: {
          style: "photo"
        }
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(FREEPIK_NANO_BANANA_ENDPOINT, {
        method: 'POST',
        headers: {
          'x-freepik-api-key': FREEPIK_API_KEY,
          'Content-Type': 'application/json',
          'User-Agent': 'AI-Ad-Creator/2025'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      const responseText = await response.text();
      console.log(`[callFreepikNanoBanana] 응답 상태: ${response.status}`);

      if (!response.ok) {
        console.error(`[callFreepikNanoBanana] API 오류 ${response.status}:`, responseText.substring(0, 200));
        
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
          keyManager.markUsage('freepik', false);
          lastError = new Error(`Freepik API error: ${response.status}`);
          continue;
        }
        
        throw new Error(`Freepik API error: ${response.status} ${responseText}`);
      }

      const result = JSON.parse(responseText);
      console.log(`[callFreepikNanoBanana] ✅ Freepik 응답 성공`);
      
      keyManager.markUsage('freepik', true);
      return result;
      
    } catch (error) {
      lastError = error;
      keyManager.markUsage('freepik', false);
      console.error(`[callFreepikNanoBanana] 시도 ${attempt} 실패:`, error.message);
      
      if (attempt < maxRetries && (
        error.message.includes('timeout') || 
        error.message.includes('429') ||
        error.message.includes('500')
      )) {
        continue;
      }
      
      break;
    }
  }
  
  throw lastError || new Error('Freepik 최대 재시도 초과');
}

/**
 * 🔥 fal.ai 응답에서 이미지 URL 추출
 */
function extractImageFromFalResponse(falResponse) {
  try {
    console.log('[extractImageFromFalResponse] fal.ai 응답 분석');
    
    // 🔥 2025년 fal.ai 응답 구조에 맞춰 수정
    if (falResponse.images && Array.isArray(falResponse.images) && falResponse.images.length > 0) {
      const firstImage = falResponse.images[0];
      if (firstImage.url) {
        console.log(`[extractImageFromFalResponse] 이미지 URL 발견: ${firstImage.url.substring(0, 60)}...`);
        return firstImage.url;
      }
    }
    
    // 대체 경로들 체크
    if (falResponse.data && falResponse.data.images && falResponse.data.images[0] && falResponse.data.images[0].url) {
      return falResponse.data.images[0].url;
    }
    
    if (falResponse.url) {
      return falResponse.url;
    }

    console.error('[extractImageFromFalResponse] 응답 구조:', JSON.stringify(falResponse, null, 2).substring(0, 500));
    throw new Error('fal.ai 응답에서 이미지 URL을 찾을 수 없음');
    
  } catch (error) {
    console.error('[extractImageFromFalResponse] 파싱 오류:', error.message);
    throw error;
  }
}

/**
 * 🔥 Freepik 응답에서 이미지 URL 추출
 */
function extractImageFromFreepikResponse(freepikResponse) {
  try {
    console.log('[extractImageFromFreepikResponse] Freepik 응답 분석');
    
    // Freepik API 응답 구조
    if (freepikResponse.data && Array.isArray(freepikResponse.data) && freepikResponse.data.length > 0) {
      const firstImage = freepikResponse.data[0];
      if (firstImage.url) {
        console.log(`[extractImageFromFreepikResponse] 이미지 URL 발견: ${firstImage.url.substring(0, 60)}...`);
        return firstImage.url;
      }
    }
    
    if (freepikResponse.url) {
      return freepikResponse.url;
    }

    throw new Error('Freepik 응답에서 이미지 URL을 찾을 수 없음');
    
  } catch (error) {
    console.error('[extractImageFromFreepikResponse] 파싱 오류:', error.message);
    throw error;
  }
}

/**
 * 🔥 최종 합성 함수 (강화된 fallback 포함)
 */
async function safeComposeWithFallback(baseImageUrl, overlayImageData, compositingInfo) {
  const startTime = Date.now();
  const attempts = [];
  
  try {
    console.log(`[safeComposeWithFallback] 🔥 이미지 합성 시작`);
    
    // 1. 이미지 데이터 준비
    const baseImageBase64 = await imageUrlToBase64(baseImageUrl);
    console.log(`[safeComposeWithFallback] 베이스 이미지 변환 완료: ${(baseImageBase64.length / 1024).toFixed(1)}KB`);
    
    let overlayImageBase64;
    if (overlayImageData.startsWith('http')) {
      overlayImageBase64 = await imageUrlToBase64(overlayImageData);
      console.log(`[safeComposeWithFallback] 오버레이 이미지 다운로드 완료: ${(overlayImageBase64.length / 1024).toFixed(1)}KB`);
    } else {
      overlayImageBase64 = extractBase64Data(overlayImageData);
      console.log(`[safeComposeWithFallback] 오버레이 이미지 데이터 추출 완료: ${(overlayImageBase64.length / 1024).toFixed(1)}KB`);
    }
    
    // 2. 합성 프롬프트 생성
    const compositingPrompt = generateCompositingPrompt(compositingInfo);
    console.log(`[safeComposeWithFallback] 프롬프트 생성 완료: ${compositingPrompt.substring(0, 100)}...`);
    
    let composedImageUrl = null;
    let method = 'unknown';
    let provider = null;
    
    // 3. 최적 API 제공자 선택 및 호출
    const bestProvider = keyManager.getBestProvider();
    console.log(`[safeComposeWithFallback] 선택된 제공자: ${bestProvider}`);
    
    if (bestProvider === 'fal') {
      try {
        console.log('[safeComposeWithFallback] 🚀 fal.ai 호출 시작');
        const falResponse = await callFalNanoBanana(baseImageBase64, overlayImageBase64, compositingPrompt);
        composedImageUrl = extractImageFromFalResponse(falResponse);
        method = 'fal-nano-banana';
        provider = 'fal';
        attempts.push({ provider: 'fal', success: true, method });
        
      } catch (falError) {
        console.warn('[safeComposeWithFallback] fal.ai 실패:', falError.message);
        attempts.push({ provider: 'fal', success: false, error: falError.message });
        
        // Freepik 백업 시도
        if (keyManager.freepikAvailable) {
          try {
            console.log('[safeComposeWithFallback] 🔄 Freepik 백업 시도');
            const freepikResponse = await callFreepikNanoBanana(baseImageBase64, overlayImageBase64, compositingPrompt);
            composedImageUrl = extractImageFromFreepikResponse(freepikResponse);
            method = 'freepik-backup';
            provider = 'freepik';
            attempts.push({ provider: 'freepik', success: true, method });
            
          } catch (freepikError) {
            console.error('[safeComposeWithFallback] Freepik 백업도 실패:', freepikError.message);
            attempts.push({ provider: 'freepik', success: false, error: freepikError.message });
          }
        }
      }
      
    } else if (bestProvider === 'freepik') {
      try {
        console.log('[safeComposeWithFallback] 🚀 Freepik 호출 시작');
        const freepikResponse = await callFreepikNanoBanana(baseImageBase64, overlayImageBase64, compositingPrompt);
        composedImageUrl = extractImageFromFreepikResponse(freepikResponse);
        method = 'freepik-primary';
        provider = 'freepik';
        attempts.push({ provider: 'freepik', success: true, method });
        
      } catch (freepikError) {
        console.warn('[safeComposeWithFallback] Freepik 실패:', freepikError.message);
        attempts.push({ provider: 'freepik', success: false, error: freepikError.message });
        
        // fal.ai 백업 시도
        if (keyManager.falAvailable) {
          try {
            console.log('[safeComposeWithFallback] 🔄 fal.ai 백업 시도');
            const falResponse = await callFalNanaBanana(baseImageBase64, overlayImageBase64, compositingPrompt);
            composedImageUrl = extractImageFromFalResponse(falResponse);
            method = 'fal-backup';
            provider = 'fal';
            attempts.push({ provider: 'fal', success: true, method });
            
          } catch (falError) {
            console.error('[safeComposeWithFallback] fal.ai 백업도 실패:', falError.message);
            attempts.push({ provider: 'fal', success: false, error: falError.message });
          }
        }
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    // 4. 결과 반환
    if (composedImageUrl) {
      console.log(`[safeComposeWithFallback] ✅ 합성 성공 (${method}, ${processingTime}ms)`);
      
      return {
        success: true,
        composedImageUrl: composedImageUrl,
        metadata: {
          originalBaseUrl: baseImageUrl,
          compositingContext: compositingInfo.compositingContext,
          prompt: compositingPrompt,
          method: method,
          provider: provider,
          model: method.includes('fal') ? 'fal-ai/nano-banana' : 'freepik-nano-banana',
          timestamp: new Date().toISOString(),
          processingTime: processingTime,
          attempts: attempts,
          apiStats: keyManager.getStats()
        }
      };
    } else {
      // 🔥 모든 API 실패 → 원본 이미지 fallback
      console.warn(`[safeComposeWithFallback] ⚠️ 모든 합성 시도 실패, 원본 이미지 사용 (${processingTime}ms)`);
      
      return {
        success: true, // 원본 사용이므로 성공으로 처리
        composedImageUrl: baseImageUrl, // 원본 이미지 URL
        metadata: {
          originalBaseUrl: baseImageUrl,
          compositingContext: compositingInfo.compositingContext,
          prompt: compositingPrompt,
          method: 'fallback-original',
          provider: 'none',
          model: 'none',
          timestamp: new Date().toISOString(),
          processingTime: processingTime,
          attempts: attempts,
          apiStats: keyManager.getStats(),
          fallbackReason: 'All API calls failed, using original image'
        }
      };
    }
    
  } catch (error) {
    console.error('[safeComposeWithFallback] 전체 프로세스 오류:', error.message);
    
    // 🔥 예외 상황에도 원본 이미지로 fallback
    const processingTime = Date.now() - startTime;
    
    return {
      success: true, // 원본 사용이므로 성공으로 처리
      composedImageUrl: baseImageUrl,
      metadata: {
        originalBaseUrl: baseImageUrl,
        compositingContext: compositingInfo.compositingContext,
        method: 'fallback-error',
        provider: 'none',
        model: 'none',
        timestamp: new Date().toISOString(),
        processingTime: processingTime,
        attempts: attempts,
        apiStats: keyManager.getStats(),
        fallbackReason: `Process error: ${error.message}`
      }
    };
  }
}

/**
 * 🔥 메인 API 핸들러
 */
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
    const {
      baseImageUrl,
      overlayImageData,
      compositingInfo,
      sceneNumber,
      conceptId
    } = req.body || {};

    // 🔥 입력값 검증
    if (!baseImageUrl || typeof baseImageUrl !== 'string' || !baseImageUrl.startsWith('http')) {
      return res.status(400).json({
        success: false,
        error: 'Valid baseImageUrl (HTTP/HTTPS) is required'
      });
    }

    if (!overlayImageData || typeof overlayImageData !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'overlayImageData (base64 or URL) is required'
      });
    }

    if (!compositingInfo || typeof compositingInfo !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'compositingInfo object is required'
      });
    }

    // 🔥 API 키 상태 확인
    if (!keyManager.falAvailable && !keyManager.freepikAvailable) {
      console.error('[nanobanana-compose] API 키 없음');
      return res.status(500).json({
        success: false,
        error: 'No API keys available (FAL_API_KEY or FREEPIK_API_KEY required)'
      });
    }

    console.log('[nanobanana-compose] 🚀 요청 처리 시작:', {
      sceneNumber,
      conceptId,
      compositingContext: compositingInfo.compositingContext,
      hasBaseImage: !!baseImageUrl,
      hasOverlayData: !!overlayImageData,
      apiAvailable: keyManager.getStats()
    });

    // 🔥 이미지 합성 실행
    const result = await safeComposeWithFallback(
      baseImageUrl,
      overlayImageData,
      compositingInfo
    );

    const totalProcessingTime = Date.now() - startTime;

    console.log('[nanobanana-compose] ✅ 처리 완료:', {
      sceneNumber,
      conceptId,
      totalTime: totalProcessingTime + 'ms',
      success: result.success,
      method: result.metadata.method,
      provider: result.metadata.provider,
      fallbackUsed: result.metadata.method?.includes('fallback') || false
    });

    return res.status(200).json({
      success: true,
      ...result,
      totalProcessingTime: totalProcessingTime,
      debug: {
        sceneNumber,
        conceptId,
        originalBaseUrl: baseImageUrl,
        compositingContext: compositingInfo.compositingContext,
        apiStatus: keyManager.getStats(),
        processingInfo: {
          attempts: result.metadata.attempts?.length || 0,
          finalMethod: result.metadata.method,
          finalProvider: result.metadata.provider
        }
      }
    });

  } catch (error) {
    console.error('[nanobanana-compose] 핸들러 오류:', error);

    const totalProcessingTime = Date.now() - startTime;

    return res.status(500).json({
      success: false,
      error: error.message,
      totalProcessingTime: totalProcessingTime,
      fallback: {
        composedImageUrl: req.body?.baseImageUrl || null,
        reason: 'handler_error',
        details: error.message
      },
      debug: {
        apiStats: keyManager.getStats(),
        timestamp: new Date().toISOString()
      }
    });
  }
}

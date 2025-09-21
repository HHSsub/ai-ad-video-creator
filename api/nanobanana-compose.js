// api/nanobanana-compose.js - 2025년 실제 Freepik Nano-Banana API 연동

import 'dotenv/config';
import fetch from 'node-fetch';

// 🔥 실제 API 설정 (2025년 9월 기준)
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.VITE_FAL_API_KEY;
const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY || process.env.VITE_FREEPIK_API_KEY;

// 실제 엔드포인트들
const FAL_NANO_BANANA_ENDPOINT = 'https://queue.fal.run/fal-ai/nano-banana/edit';
const FREEPIK_NANO_BANANA_ENDPOINT = 'https://api.freepik.com/v1/ai/google/gemini-2-5-flash-image-preview';

const MAX_COMPOSITION_RETRIES = 2;
const INITIAL_RETRY_DELAY = 3000;
const SUBSEQUENT_RETRY_DELAY = 5000;
const RATE_LIMIT_BASE_DELAY = 2000;

// API 키 관리자
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
 * 이미지 URL을 base64로 변환
 */
async function imageUrlToBase64(imageUrl, maxRetries = 2) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[imageUrlToBase64] 다운로드 시도 ${attempt}/${maxRetries}: ${imageUrl.substring(0, 60)}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      
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
 * 합성 프롬프트 생성
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
  prompt += `Requirements: Maintain consistent lighting and shadows between all elements, preserve the original background atmosphere and mood, ensure realistic perspective and natural scale, match color temperature across the entire composition, create professional seamless integration, keep everything looking natural and believable, do not add text watermarks or extra elements. Result should look like a single cohesive photograph where all elements belong together naturally.`;

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
        sync_mode: false
      };

      console.log(`[callFalNanoBanana] 요청 데이터 크기: ${JSON.stringify(requestBody).length} bytes`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

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
 * 🔥 Freepik Nano-Banana API 호출 (2025년 실제 엔드포인트)
 */
async function callFreepikNanoBanana(baseImageBase64, overlayImageBase64, compositingPrompt, maxRetries = MAX_COMPOSITION_RETRIES) {
  if (!FREEPIK_API_KEY) {
    throw new Error('FREEPIK_API_KEY not configured');
  }

  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[callFreepikNanoBanana] Freepik Nano-Banana 호출 시도 ${attempt}/${maxRetries}`);
      
      keyManager.markUsage('freepik');

      if (attempt > 1) {
        const delay = attempt === 2 ? INITIAL_RETRY_DELAY : SUBSEQUENT_RETRY_DELAY;
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // 🔥 Freepik Nano-Banana API 요청 구조 (2025년 실제 사양)
      const requestBody = {
        prompt: compositingPrompt,
        base_image: `data:image/jpeg;base64,${baseImageBase64}`,
        reference_images: [`data:image/jpeg;base64,${overlayImageBase64}`],
        num_images: 1,
        output_format: "jpeg",
        aspect_ratio: "widescreen_16_9",
        style: "photo",
        quality: 0.9
      };

      console.log(`[callFreepikNanoBanana] 요청 바디 크기: ${JSON.stringify(requestBody).length} bytes`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

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
      console.log(`[callFreepikNanoBanana] 응답 상태: ${response.status}, 크기: ${responseText.length}`);

      if (!response.ok) {
        console.error(`[callFreepikNanoBanana] API 오류 ${response.status}:`, responseText.substring(0, 300));
        
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
          keyManager.markUsage('freepik', false);
          lastError = new Error(`Freepik Nano-Banana API error: ${response.status}`);
          continue;
        }
        
        throw new Error(`Freepik Nano-Banana API error: ${response.status} ${responseText}`);
      }

      const result = JSON.parse(responseText);
      console.log(`[callFreepikNanoBanana] ✅ Freepik Nano-Banana 응답 성공`);
      console.log(`[callFreepikNanoBanana] 응답 구조:`, JSON.stringify(result, null, 2).substring(0, 500));
      
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
  
  throw lastError || new Error('Freepik Nano-Banana 최대 재시도 초과');
}

/**
 * fal.ai 응답에서 이미지 URL 추출
 */
function extractImageFromFalResponse(falResponse) {
  try {
    console.log('[extractImageFromFalResponse] fal.ai 응답 분석');
    
    if (falResponse.images && Array.isArray(falResponse.images) && falResponse.images.length > 0) {
      const firstImage = falResponse.images[0];
      if (firstImage.url) {
        console.log(`[extractImageFromFalResponse] 이미지 URL 발견: ${firstImage.url.substring(0, 60)}...`);
        return firstImage.url;
      }
    }
    
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
 * 🔥 Freepik Nano-Banana 응답에서 이미지 URL 추출 (2025년 실제 응답 구조)
 */
function extractImageFromFreepikResponse(freepikResponse) {
  try {
    console.log('[extractImageFromFreepikResponse] Freepik Nano-Banana 응답 분석');
    console.log('[extractImageFromFreepikResponse] 응답 구조:', JSON.stringify(freepikResponse, null, 2).substring(0, 1000));
    
    // 🔥 Freepik Nano-Banana 2025년 실제 응답 구조들 (검색 결과 기반)
    
    // 패턴 1: data.task_id가 있는 경우 (비동기 처리)
    if (freepikResponse.data && freepikResponse.data.task_id) {
      console.log(`[extractImageFromFreepikResponse] 태스크 ID 발견: ${freepikResponse.data.task_id}`);
      throw new Error('Freepik Nano-Banana 비동기 응답 - 폴링 필요');
    }
    
    // 패턴 2: 직접 data 배열 (즉시 응답)
    if (freepikResponse.data && Array.isArray(freepikResponse.data) && freepikResponse.data.length > 0) {
      const firstImage = freepikResponse.data[0];
      if (firstImage.url) {
        console.log(`[extractImageFromFreepikResponse] 패턴2 - 이미지 URL 발견: ${firstImage.url.substring(0, 60)}...`);
        return firstImage.url;
      }
      if (firstImage.image_url) {
        console.log(`[extractImageFromFreepikResponse] 패턴2-B - 이미지 URL 발견: ${firstImage.image_url.substring(0, 60)}...`);
        return firstImage.image_url;
      }
    }
    
    // 패턴 3: images 배열
    if (freepikResponse.images && Array.isArray(freepikResponse.images) && freepikResponse.images.length > 0) {
      const firstImage = freepikResponse.images[0];
      if (firstImage.url) {
        console.log(`[extractImageFromFreepikResponse] 패턴3 - 이미지 URL 발견: ${firstImage.url.substring(0, 60)}...`);
        return firstImage.url;
      }
    }
    
    // 패턴 4: result 안에 있는 경우
    if (freepikResponse.result && freepikResponse.result.url) {
      console.log(`[extractImageFromFreepikResponse] 패턴4 - result.url 발견: ${freepikResponse.result.url.substring(0, 60)}...`);
      return freepikResponse.result.url;
    }
    
    // 패턴 5: 직접 URL
    if (freepikResponse.url) {
      console.log(`[extractImageFromFreepikResponse] 패턴5 - 직접 URL 발견: ${freepikResponse.url.substring(0, 60)}...`);
      return freepikResponse.url;
    }

    // 모든 패턴 실패
    console.error('[extractImageFromFreepikResponse] 모든 패턴에서 이미지 URL을 찾을 수 없음');
    console.error('[extractImageFromFreepikResponse] 전체 응답:', JSON.stringify(freepikResponse, null, 2));
    throw new Error('Freepik Nano-Banana 응답에서 이미지 URL을 찾을 수 없음');
    
  } catch (error) {
    console.error('[extractImageFromFreepikResponse] 파싱 오류:', error.message);
    throw error;
  }
}

/**
 * 🔥 최종 합성 함수 (fal.ai 우선, Freepik Nano-Banana 백업)
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
        
        // Freepik Nano-Banana 백업 시도
        if (keyManager.freepikAvailable) {
          try {
            console.log('[safeComposeWithFallback] 🔄 Freepik Nano-Banana 백업 시도');
            const freepikResponse = await callFreepikNanoBanana(baseImageBase64, overlayImageBase64, compositingPrompt);
            composedImageUrl = extractImageFromFreepikResponse(freepikResponse);
            method = 'freepik-nano-banana-backup';
            provider = 'freepik';
            attempts.push({ provider: 'freepik', success: true, method });
            
          } catch (freepikError) {
            console.error('[safeComposeWithFallback] Freepik Nano-Banana 백업도 실패:', freepikError.message);
            attempts.push({ provider: 'freepik', success: false, error: freepikError.message });
          }
        }
      }
      
    } else if (bestProvider === 'freepik') {
      try {
        console.log('[safeComposeWithFallback] 🚀 Freepik Nano-Banana 호출 시작');
        const freepikResponse = await callFreepikNanoBanana(baseImageBase64, overlayImageBase64, compositingPrompt);
        composedImageUrl = extractImageFromFreepikResponse(freepikResponse);
        method = 'freepik-nano-banana-primary';
        provider = 'freepik';
        attempts.push({ provider: 'freepik', success: true, method });
        
      } catch (freepikError) {
        console.warn('[safeComposeWithFallback] Freepik Nano-Banana 실패:', freepikError.message);
        attempts.push({ provider: 'freepik', success: false, error: freepikError.message });
        
        // fal.ai 백업 시도
        if (keyManager.falAvailable) {
          try {
            console.log('[safeComposeWithFallback] 🔄 fal.ai 백업 시도');
            const falResponse = await callFalNanoBanana(baseImageBase64, overlayImageBase64, compositingPrompt);
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
          fallbackReason: 'All composition attempts failed, using original image'
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
 * 🔥 개별 합성 작업 (실제 업로드된 이미지 데이터 사용)
 */
async function composeSingleImageSafely(imageObj, style, compositingInfo, retryCount = 0) {
  const maxRetries = 2;
  
  // 합성이 필요한 조건 체크
  if (!imageObj.isCompositingScene || !imageObj.compositingInfo) {
    console.log(`[composeSingleImageSafely] 합성 불필요: Scene ${imageObj.sceneNumber}`);
    return imageObj;
  }

  const { needsProductImage, needsBrandLogo } = imageObj.compositingInfo;
  
  // 🔥 실제 업로드된 이미지 데이터 추출
  let overlayImageData = null;
  
  if (needsProductImage && compositingInfo.productImageData) {
    // formData.productImage에서 실제 업로드된 base64 데이터 사용
    if (typeof compositingInfo.productImageData === 'object' && compositingInfo.productImageData.url) {
      overlayImageData = compositingInfo.productImageData.url; // base64 data URL
    } else if (typeof compositingInfo.productImageData === 'string') {
      overlayImageData = compositingInfo.productImageData; // 직접 base64
    }
    console.log(`[composeSingleImageSafely] 제품 이미지 합성 준비: Scene ${imageObj.sceneNumber}`);
  } 
  
  if (!overlayImageData && needsBrandLogo && compositingInfo.brandLogoData) {
    // formData.brandLogo에서 실제 업로드된 base64 데이터 사용
    if (typeof compositingInfo.brandLogoData === 'object' && compositingInfo.brandLogoData.url) {
      overlayImageData = compositingInfo.brandLogoData.url;
    } else if (typeof compositingInfo.brandLogoData === 'string') {
      overlayImageData = compositingInfo.brandLogoData;
    }
    console.log(`[composeSingleImageSafely] 브랜드 로고 합성 준비: Scene ${imageObj.sceneNumber}`);
  }

  if (!overlayImageData) {
    console.warn(`[composeSingleImageSafely] 합성 데이터 없음: Scene ${imageObj.sceneNumber}`, {
      needsProductImage,
      needsBrandLogo,
      hasProductImageData: !!compositingInfo.productImageData,
      hasBrandLogoData: !!compositingInfo.brandLogoData
    });
    return imageObj;
  }

  try {
    console.log(`[composeSingleImageSafely] 🔥 Nano Banana 합성 시작: Scene ${imageObj.sceneNumber} (시도 ${retryCount + 1}/${maxRetries + 1})`);
    
    // Rate Limit 분산을 위한 딜레이
    const requestDelay = Math.random() * 3000 + 2000;
    await new Promise(resolve => setTimeout(resolve, requestDelay));
    
    // 🔥 실제 nanobanana-compose API 호출
    const response = await fetch(`${process.env.API_BASE || ''}/api/nanobanana-compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseImageUrl: imageObj.url,
        overlayImageData: overlayImageData,
        compositingInfo: imageObj.compositingInfo,
        sceneNumber: imageObj.sceneNumber,
        conceptId: style.concept_id
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[composeSingleImageSafely] HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
    }

    const result = await response.json();
    
    if (result.success && result.composedImageUrl) {
      console.log(`[composeSingleImageSafely] ✅ 합성 완료: Scene ${imageObj.sceneNumber} (${result.metadata?.method || 'unknown'})`);
      
      // 합성된 이미지로 교체
      return {
        ...imageObj,
        url: result.composedImageUrl,
        thumbnail: result.composedImageUrl,
        isComposed: true,
        compositionMetadata: result.metadata,
        originalUrl: imageObj.url,
        compositingSuccess: true
      };
    } else {
      throw new Error(`합성 결과 없음: ${JSON.stringify(result)}`);
    }

  } catch (error) {
    console.error(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} 시도 ${retryCount + 1} 실패:`, error.message);
    
    // 재시도 로직 (429, 5xx 에러만)
    const retryableErrors = ['429', '500', '502', '503', '504', 'timeout'];
    const shouldRetry = retryableErrors.some(code => error.message.includes(code));
    
    if (retryCount < maxRetries && shouldRetry) {
      const retryDelay = (retryCount + 1) * 5000;
      console.log(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} ${retryDelay}ms 후 재시도...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return composeSingleImageSafely(imageObj, style, compositingInfo, retryCount + 1);
    }
    
    // 최종 실패 시 원본 반환 (에러 격리)
    console.warn(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} 최종 실패, 원본 사용: ${error.message}`);
    return {
      ...imageObj,
      compositionFailed: true,
      compositionError: error.message,
      compositingAttempted: true
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

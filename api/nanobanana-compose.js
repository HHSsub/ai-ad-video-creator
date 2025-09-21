// api/nanobanana-compose.js - 실제 Gemini API 키 풀 활용한 나노바나나 합성

import { GoogleGenerativeAI } from '@google/generative-ai';
import { safeCallGemini, getApiKeyStatus } from '../src/utils/apiHelpers.js';
import fetch from 'node-fetch';

const MAX_RETRIES = 2;
const RETRY_DELAY = 3000;

/**
 * 이미지 URL을 base64로 변환
 */
async function imageUrlToBase64(imageUrl, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[imageUrlToBase64] 다운로드 시도 ${attempt}/${maxRetries}: ${imageUrl.substring(0, 60)}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
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
function generateCompositingPrompt(compositingInfo, needsProductImage, needsBrandLogo) {
  const { compositingContext } = compositingInfo;
  
  let prompt = `Seamlessly compose and integrate these images into a professional advertising scene. `;
  
  // 베이스 이미지 설명
  prompt += `Use the first image as the background scene. `;
  
  // 오버레이 이미지 처리 방식
  if (needsProductImage && needsBrandLogo) {
    prompt += `The second image contains a product and brand logo. Naturally place the product as the main focus in the foreground and integrate the logo elegantly in a corner or subtle position. `;
  } else if (needsProductImage) {
    prompt += `The second image contains a product. Place it prominently and naturally in the scene as the focal point, making it look like it belongs in this environment. `;
  } else if (needsBrandLogo) {
    prompt += `The second image contains a brand logo. Integrate it subtly but visibly in the composition, typically in a corner or branded area. `;
  }

  // 컨텍스트별 세부 지침
  switch (compositingContext) {
    case 'PRODUCT_COMPOSITING_SCENE':
    case 'EXPLICIT':
      prompt += `This is a product showcase advertisement. Make the product the clear hero of the image while maintaining scene harmony. `;
      break;
    case 'AUTO_PURCHASE_CONVERSION':
      prompt += `This is for purchase conversion. Position the product attractively as a desirable solution that viewers would want to buy. `;
      break;
    case 'AUTO_BRAND_AWARENESS':
      prompt += `This is for brand awareness. Create a memorable and aesthetically appealing composition that builds brand recognition. `;
      break;
    default:
      prompt += `Create a natural, professional advertising composition. `;
  }

  // 기술적 요구사항
  prompt += `Requirements: Maintain consistent lighting and shadows between all elements, preserve the original background atmosphere and mood, ensure realistic perspective and natural scale, match color temperature across the entire composition, create professional seamless integration, keep everything looking natural and believable, do not add text or watermarks. Result should look like a single cohesive professional advertisement photograph where all elements belong together naturally.`;

  return prompt;
}

/**
 * 🔥 실제 Gemini API 나노바나나 호출 (API 키 풀 활용)
 */
async function callGeminiNanoBanana(baseImageBase64, overlayImageBase64, prompt, retryCount = 0) {
  const maxRetries = MAX_RETRIES;
  
  try {
    console.log(`[callGeminiNanoBanana] 나노바나나 합성 시도 ${retryCount + 1}/${maxRetries + 1}`);
    
    // 🔥 API 키 풀에서 안전한 Gemini 호출
    const geminiPrompt = `${prompt}

Please combine and edit these two images:
1. Base scene image (background)
2. Product/logo image to be composited

Create a professional, seamless composition that looks natural and cohesive.`;

    // 이미지 데이터 준비 (Gemini API 형식)
    const imageData = [
      {
        inlineData: {
          data: baseImageBase64,
          mimeType: 'image/jpeg'
        }
      },
      {
        inlineData: {
          data: overlayImageBase64,
          mimeType: 'image/jpeg'
        }
      }
    ];

    // 🔥 API 키 풀 활용한 안전한 호출
    const result = await safeCallGemini([
      geminiPrompt,
      ...imageData
    ], {
      model: 'gemini-2.5-flash-image-preview', // 🔥 나노바나나 모델
      maxRetries: 3,
      label: `nanobanana-compose-attempt-${retryCount + 1}`
    });

    // 응답에서 이미지 추출
    if (result.text) {
      // 텍스트 응답에서 이미지 데이터 찾기
      const parts = result.text.split('\n');
      for (const part of parts) {
        if (part.includes('data:image/') || part.startsWith('data:image/')) {
          console.log(`[callGeminiNanoBanana] ✅ 이미지 데이터 URL 발견`);
          return {
            success: true,
            imageUrl: part.trim(),
            method: 'gemini-nano-banana',
            model: result.model,
            keyIndex: result.keyIndex,
            processingTime: result.processingTime
          };
        }
      }
    }

    // 대안: 응답을 base64로 처리
    console.log(`[callGeminiNanoBanana] 텍스트 응답 분석 중: ${result.text.substring(0, 100)}...`);
    
    // 실패 시 재시도
    if (retryCount < maxRetries) {
      const delay = RETRY_DELAY * (retryCount + 1);
      console.log(`[callGeminiNanoBanana] ${delay}ms 후 재시도...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callGeminiNanoBanana(baseImageBase64, overlayImageBase64, prompt, retryCount + 1);
    }

    throw new Error('Gemini 나노바나나에서 이미지 응답을 찾을 수 없음');

  } catch (error) {
    console.error(`[callGeminiNanoBanana] 시도 ${retryCount + 1} 실패:`, error.message);
    
    // 재시도 로직
    const retryableErrors = ['429', '500', '502', '503', '504', 'timeout', 'quota'];
    const shouldRetry = retryableErrors.some(code => error.message.toLowerCase().includes(code));
    
    if (retryCount < maxRetries && shouldRetry) {
      const delay = RETRY_DELAY * (retryCount + 1);
      console.log(`[callGeminiNanoBanana] ${delay}ms 후 재시도...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callGeminiNanoBanana(baseImageBase64, overlayImageBase64, prompt, retryCount + 1);
    }
    
    throw error;
  }
}

/**
 * 🔥 최종 합성 함수 (실제 작동)
 */
async function safeComposeWithNanoBanana(baseImageUrl, overlayImageData, compositingInfo) {
  const startTime = Date.now();
  
  try {
    console.log(`[safeComposeWithNanoBanana] 🔥 Gemini 나노바나나 합성 시작`);
    
    // 1. API 키 상태 확인
    const keyStatus = getApiKeyStatus();
    console.log(`[safeComposeWithNanoBanana] Gemini API 키 상태: ${keyStatus.gemini.availableKeys}/${keyStatus.gemini.totalKeys}개 사용가능`);
    
    if (keyStatus.gemini.totalKeys === 0) {
      throw new Error('Gemini API 키가 설정되지 않았습니다');
    }
    
    // 2. 이미지 데이터 준비
    const baseImageBase64 = await imageUrlToBase64(baseImageUrl);
    console.log(`[safeComposeWithNanoBanana] 베이스 이미지 변환 완료: ${(baseImageBase64.length / 1024).toFixed(1)}KB`);
    
    let overlayImageBase64;
    if (overlayImageData.startsWith('http')) {
      overlayImageBase64 = await imageUrlToBase64(overlayImageData);
      console.log(`[safeComposeWithNanoBanana] 오버레이 이미지 다운로드 완료: ${(overlayImageBase64.length / 1024).toFixed(1)}KB`);
    } else {
      overlayImageBase64 = extractBase64Data(overlayImageData);
      console.log(`[safeComposeWithNanoBanana] 오버레이 이미지 데이터 추출 완료: ${(overlayImageBase64.length / 1024).toFixed(1)}KB`);
    }
    
    // 3. 합성 정보 분석
    const needsProductImage = compositingInfo.needsProductImage || false;
    const needsBrandLogo = compositingInfo.needsBrandLogo || false;
    
    // 4. 합성 프롬프트 생성
    const prompt = generateCompositingPrompt(compositingInfo, needsProductImage, needsBrandLogo);
    console.log(`[safeComposeWithNanoBanana] 프롬프트 생성 완료: ${prompt.substring(0, 100)}...`);
    
    // 5. 🔥 실제 Gemini 나노바나나 API 호출
    const result = await callGeminiNanoBanana(baseImageBase64, overlayImageBase64, prompt);
    
    const processingTime = Date.now() - startTime;
    
    if (result.success) {
      console.log(`[safeComposeWithNanoBanana] ✅ 나노바나나 합성 성공 (${processingTime}ms)`);
      
      return {
        success: true,
        composedImageUrl: result.imageUrl,
        metadata: {
          originalBaseUrl: baseImageUrl,
          compositingContext: compositingInfo.compositingContext,
          prompt: prompt,
          method: result.method,
          provider: 'gemini',
          model: result.model,
          keyIndex: result.keyIndex,
          timestamp: new Date().toISOString(),
          processingTime: processingTime,
          nanoBananaSuccess: true
        }
      };
    } else {
      throw new Error('나노바나나 합성 실패');
    }
    
  } catch (error) {
    console.error('[safeComposeWithNanoBanana] 전체 프로세스 오류:', error.message);
    
    // 🔥 실패 시 원본 이미지로 fallback
    const processingTime = Date.now() - startTime;
    
    console.warn(`[safeComposeWithNanoBanana] ⚠️ 합성 실패, 원본 이미지 사용: ${error.message}`);
    
    return {
      success: true, // 원본 사용이므로 성공으로 처리
      composedImageUrl: baseImageUrl,
      metadata: {
        originalBaseUrl: baseImageUrl,
        compositingContext: compositingInfo.compositingContext,
        method: 'fallback-original',
        provider: 'none',
        model: 'none',
        timestamp: new Date().toISOString(),
        processingTime: processingTime,
        nanoBananaAttempted: true,
        nanoBananaError: error.message,
        fallbackReason: `나노바나나 합성 실패: ${error.message}`
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
    const keyStatus = getApiKeyStatus();
    console.log(`[nanobanana-compose] Gemini API 키 상태: ${keyStatus.gemini.availableKeys}/${keyStatus.gemini.totalKeys}개 사용가능`);

    // API 키가 없으면 원본 반환
    if (keyStatus.gemini.totalKeys === 0) {
      console.error('[nanobanana-compose] Gemini API 키가 없음');
      return res.status(200).json({
        success: true,
        composedImageUrl: baseImageUrl,
        metadata: {
          method: 'fallback-no-api-key',
          fallbackReason: 'Gemini API 키가 설정되지 않음',
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime
        }
      });
    }

    console.log('[nanobanana-compose] 🚀 Gemini 나노바나나 합성 시작:', {
      sceneNumber,
      conceptId,
      compositingContext: compositingInfo.compositingContext,
      hasBaseImage: !!baseImageUrl,
      hasOverlayData: !!overlayImageData
    });

    // 🔥 이미지 합성 실행
    const result = await safeComposeWithNanoBanana(
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
      nanoBananaUsed: result.metadata.nanoBananaSuccess || false
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
        geminiApiStatus: keyStatus.gemini,
        processingInfo: {
          finalMethod: result.metadata.method,
          nanoBananaUsed: result.metadata.nanoBananaSuccess || false,
          keyUsed: result.metadata.keyIndex
        }
      }
    });

  } catch (error) {
    console.error('[nanobanana-compose] 핸들러 오류:', error);

    const totalProcessingTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      composedImageUrl: req.body?.baseImageUrl || null,
      metadata: {
        method: 'fallback-handler-error',
        fallbackReason: `핸들러 오류: ${error.message}`,
        timestamp: new Date().toISOString(),
        processingTime: totalProcessingTime
      },
      debug: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
}

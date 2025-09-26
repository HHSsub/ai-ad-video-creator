// api/nanobanana-compose.js - 🔥 Gemini 2.5 Flash Image 정식 적용 + 모델명 로깅 + 재시도 강화
import { safeCallGemini, getApiKeyStatus } from '../src/utils/apiHelpers.js';

const MAX_RETRIES = 4; // 🔥 재시도 횟수 증가
const RETRY_DELAY = 8000; // 🔥 재시도 간격 증가 (8초)
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB 제한
const COMPOSITION_TIMEOUT = 240000; // 🔥 합성 타임아웃 4분으로 증가

/**
 * 🔥 이미지 URL을 base64로 안전하게 변환 (크기 제한 포함)
 */
async function imageUrlToBase64(imageUrl, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[imageUrlToBase64] 다운로드 시도 ${attempt}/${maxRetries}: ${imageUrl.substring(0, 60)}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45초 타임아웃
      
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
      
      // 🔥 파일 크기 체크
      if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
        throw new Error(`이미지가 너무 큽니다: ${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB (최대 20MB)`);
      }
      
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      
      console.log(`[imageUrlToBase64] 변환 완료: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);
      return base64;
      
    } catch (error) {
      lastError = error;
      console.error(`[imageUrlToBase64] 시도 ${attempt} 실패:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = 2000 * attempt; // 지수적 백오프
        console.log(`[imageUrlToBase64] ${delay}ms 후 재시도...`);
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
 * 🔥 MIME 타입 감지 (확장자 기반)
 */
function detectMimeType(imageUrl, fallback = 'image/jpeg') {
  try {
    const url = new URL(imageUrl);
    const pathname = url.pathname.toLowerCase();
    
    if (pathname.includes('.png')) return 'image/png';
    if (pathname.includes('.webp')) return 'image/webp';
    if (pathname.includes('.gif')) return 'image/gif';
    return 'image/jpeg';
  } catch {
    return fallback;
  }
}

/**
 * 합성 프롬프트 생성 (더 구체적이고 실용적으로)
 */
function generateCompositingPrompt(compositingInfo, needsProductImage, needsBrandLogo) {
  const { compositingContext, videoPurpose } = compositingInfo;
  
  let prompt = `Seamlessly composite the foreground image into the background, creating a single, ultra-realistic, and perfectly cohesive photograph.
Harmonize Lighting & Color: Match the foreground's lighting to the background's light source direction, color temperature, and shadow softness. The color and contrast must blend perfectly with the environment.
Cast Realistic Shadows: Generate a physically accurate contact shadow where the foreground meets the surface, ensuring the shadow's blur and darkness are consistent with the environment's lighting.
Integrate Edges & Focus: Meticulously blend the foreground edges to match the background's depth of field (bokeh) and atmospheric conditions. Eliminate any artificial 'cut-out' appearance.
Render Environmental Interaction: Create subtle, realistic reflections of the background onto the foreground's surface (especially if glossy or metallic).
Final Polish: Apply a unified, professional color grade over the entire image. The final result must be a masterpiece of photorealism, cohesive, 8K, high detail.

INSTRUCTIONS:
1. Use the first image as the base background scene
2. Integrate the second image (product/logo) naturally into the scene
3. Maintain consistent lighting, shadows, and perspective
4. Ensure all elements look like they belong together naturally
5. Create a professional advertising composition
6. DO NOT add any text, watermarks, or artificial elements

`;

  prompt += `Background: The first image provides the scene context and lighting environment. `;

  // imageRef로 통합된 이미지가 실제로 제품인지 로고인지는 영상 목적 등으로 판별
  if (needsProductImage && needsBrandLogo) {
    prompt += `Overlay: The second image contains either the product or brand logo, depending on advertising purpose. `;
  } else if (needsProductImage) {
    prompt += `Overlay: The second image contains the product (or a product-focused image). `;
  } else if (needsBrandLogo) {
    prompt += `Overlay: The second image contains the brand logo (or a logo-focused image). `;
  } else {
    prompt += `Overlay: The second image is either a product or brand logo according to the context. `;
  }

  switch (compositingContext) {
    case 'PRODUCT_COMPOSITING_SCENE':
    case 'EXPLICIT':
      prompt += `Focus: This is a product showcase advertisement. Make the product the clear hero while maintaining environmental harmony. `;
      break;
    case 'AUTO_PURCHASE_CONVERSION':
      prompt += `Focus: This is for purchase conversion. Position elements to create desire and showcase the product as an attractive solution. `;
      break;
    case 'AUTO_BRAND_AWARENESS':
      prompt += `Focus: This is for brand awareness. Create a memorable, aesthetically pleasing composition that builds brand recognition. `;
      break;
    default:
      prompt += `Focus: Create a natural, professional advertising composition. `;
  }

  prompt += `Return the composed image as the output.`;

  return prompt;
}

/**
 * 🔥 Gemini 2.5 Flash Image API 호출 (수정된 모델명 + 상태 추적 강화)
 */
async function callGeminiImageComposition(baseImageBase64, overlayImageBase64, prompt, retryCount = 0) {
  const maxRetries = MAX_RETRIES;
  const startTime = Date.now();
  
  try {
    console.log(`[callGeminiImageComposition] 🔥 Gemini 이미지 합성 시도 ${retryCount + 1}/${maxRetries + 1}`);
    console.log(`[callGeminiImageComposition] 📊 입력 데이터: 베이스=${Math.round(baseImageBase64.length/1024)}KB, 오버레이=${Math.round(overlayImageBase64.length/1024)}KB`);
    
    const keyStatus = getApiKeyStatus();
    if (keyStatus.gemini.totalKeys === 0) {
      throw new Error('Gemini API 키가 설정되지 않았습니다');
    }
    
    console.log(`[callGeminiImageComposition] API 키 상태: ${keyStatus.gemini.availableKeys}/${keyStatus.gemini.totalKeys}개 사용가능`);
    
    if (retryCount > 0) {
      const delay = RETRY_DELAY * retryCount + Math.random() * 3000;
      console.log(`[callGeminiImageComposition] Rate Limit 방지 딜레이: ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const geminiContent = [
      { text: prompt },
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

    const modelName = 'gemini-2.5-flash-image-preview';
    console.log(`[callGeminiImageComposition] 🎯 사용 모델: ${modelName}`);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Gemini API 호출 타임아웃')), COMPOSITION_TIMEOUT);
    });

    const result = await Promise.race([
      safeCallGemini(geminiContent, {
        model: modelName,
        maxRetries: 1,
        label: `nanobanana-compose-attempt-${retryCount + 1}`,
        isImageComposition: true
      }),
      timeoutPromise
    ]);

    const processingTime = Date.now() - startTime;
    console.log(`[callGeminiImageComposition] API 응답 받음: ${processingTime}ms, 모델: ${modelName}, 응답길이=${result.text.length}`);

    let imageData = null;
    const dataUrlMatch = result.text.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
    if (dataUrlMatch) {
      imageData = dataUrlMatch[0];
      console.log(`[callGeminiImageComposition] ✅ Data URL 형태로 이미지 발견 (${Math.round(dataUrlMatch[1].length/1024)}KB)`);
    }
    if (!imageData) {
      const lines = result.text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(trimmed)) {
          imageData = `data:image/jpeg;base64,${trimmed}`;
          console.log(`[callGeminiImageComposition] ✅ 순수 base64로 이미지 발견 (${Math.round(trimmed.length/1024)}KB)`);
          break;
        }
      }
    }
    if (!imageData) {
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.image || parsed.data || parsed.result) {
            const imgData = parsed.image || parsed.data || parsed.result;
            if (typeof imgData === 'string' && imgData.length > 1000) {
              imageData = imgData.startsWith('data:') ? imgData : `data:image/jpeg;base64,${imgData}`;
              console.log(`[callGeminiImageComposition] ✅ JSON 응답에서 이미지 발견`);
            }
          }
        }
      } catch (e) {}
    }

    if (imageData) {
      console.log(`[callGeminiImageComposition] ✅ 합성 성공: 모델=${modelName}, 키=${result.keyIndex}, 시간=${processingTime}ms`);
      return {
        success: true,
        imageUrl: imageData,
        method: 'gemini-2.5-flash-image-preview',
        model: modelName,
        keyIndex: result.keyIndex,
        processingTime: processingTime,
        responseLength: result.text.length,
        attempts: retryCount + 1
      };
    }
    if (retryCount < maxRetries) {
      console.log(`[callGeminiImageComposition] ⚠️ 이미지 데이터 없음, 재시도... (${retryCount + 1}/${maxRetries})`);
      console.log(`[callGeminiImageComposition] 응답 샘플: ${result.text.substring(0, 200)}...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return callGeminiImageComposition(baseImageBase64, overlayImageBase64, prompt, retryCount + 1);
    }
    throw new Error('Gemini 응답에서 이미지 데이터를 찾을 수 없음');
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`[callGeminiImageComposition] 시도 ${retryCount + 1} 실패 (${processingTime}ms):`, error.message);
    const retryableErrors = ['429', '500', '502', '503', '504', 'timeout', 'quota', 'overload', 'rate limit', '사용 불가능'];
    const shouldRetry = retryableErrors.some(code => error.message.toLowerCase().includes(code));
    if (retryCount < maxRetries && shouldRetry) {
      const delay = RETRY_DELAY * (retryCount + 1) + Math.random() * 3000;
      console.log(`[callGeminiImageComposition] ${Math.round(delay)}ms 후 재시도... (${error.message.substring(0, 50)})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callGeminiImageComposition(baseImageBase64, overlayImageBase64, prompt, retryCount + 1);
    }
    throw error;
  }
}

async function safeComposeWithGemini(baseImageUrl, overlayImageData, compositingInfo) {
  const startTime = Date.now();
  const maxAttempts = MAX_RETRIES + 1;
  let lastError;
  
  try {
    console.log(`[safeComposeWithGemini] 🔥 Gemini 2.5 Flash Image 합성 시작 (최대 ${maxAttempts}회 시도)`);
    console.log(`[safeComposeWithGemini] 합성 컨텍스트: ${compositingInfo.compositingContext}`);
    const keyStatus = getApiKeyStatus();
    console.log(`[safeComposeWithGemini] Gemini API 키 상태: ${keyStatus.gemini.availableKeys}/${keyStatus.gemini.totalKeys}개 사용가능`);
    if (keyStatus.gemini.totalKeys === 0) {
      throw new Error('Gemini API 키가 설정되지 않았습니다');
    }
    if (keyStatus.gemini.availableKeys === 0) {
      console.warn('[safeComposeWithGemini] ⚠️ 사용 가능한 Gemini 키가 없음, 30분 후 재시도 권장');
    }
    console.log(`[safeComposeWithGemini] 베이스 이미지 다운로드: ${baseImageUrl.substring(0, 50)}...`);
    const baseImageBase64 = await imageUrlToBase64(baseImageUrl);
    const baseMimeType = detectMimeType(baseImageUrl);
    console.log(`[safeComposeWithGemini] 베이스 이미지 준비: ${(baseImageBase64.length / 1024).toFixed(1)}KB (${baseMimeType})`);
    let overlayImageBase64;
    let overlayMimeType = 'image/jpeg';
    if (overlayImageData.startsWith('http')) {
      console.log(`[safeComposeWithGemini] 오버레이 이미지 다운로드: ${overlayImageData.substring(0, 50)}...`);
      overlayImageBase64 = await imageUrlToBase64(overlayImageData);
      overlayMimeType = detectMimeType(overlayImageData);
    } else {
      console.log(`[safeComposeWithGemini] 오버레이 이미지 base64 추출 중...`);
      overlayImageBase64 = extractBase64Data(overlayImageData);
      if (overlayImageData.startsWith('data:')) {
        const mimeMatch = overlayImageData.match(/data:([^;]+)/);
        if (mimeMatch) overlayMimeType = mimeMatch[1];
      }
    }
    console.log(`[safeComposeWithGemini] 오버레이 이미지 준비: ${(overlayImageBase64.length / 1024).toFixed(1)}KB (${overlayMimeType})`);
    let needsProductImage = false;
    let needsBrandLogo = false;
    if (compositingInfo && compositingInfo.videoPurpose) {
      if (
        compositingInfo.videoPurpose.includes('제품') ||
        (typeof compositingInfo.compositingContext === 'string' && compositingInfo.compositingContext.toLowerCase().includes('product'))
      ) {
        needsProductImage = true;
      }
      if (
        compositingInfo.videoPurpose.includes('브랜드') ||
        (typeof compositingInfo.compositingContext === 'string' && compositingInfo.compositingContext.toLowerCase().includes('brand'))
      ) {
        needsBrandLogo = true;
      }
    }
    if (overlayImageData) {
      needsProductImage = needsProductImage || true;
      needsBrandLogo = needsBrandLogo || true;
    }
    console.log(`[safeComposeWithGemini] 합성 요구사항: 제품=${needsProductImage}, 로고=${needsBrandLogo}`);
    const prompt = generateCompositingPrompt(compositingInfo, needsProductImage, needsBrandLogo);
    console.log(`[safeComposeWithGemini] 프롬프트 생성 완료: ${prompt.substring(0, 150)}...`);
    const result = await callGeminiImageComposition(baseImageBase64, overlayImageBase64, prompt);
    const processingTime = Date.now() - startTime;
    if (result.success) {
      console.log(`[safeComposeWithGemini] ✅ 합성 성공 (${processingTime}ms, 모델: ${result.model}, 시도: ${result.attempts}회)`);
      return {
        success: true,
        composedImageUrl: result.imageUrl,
        metadata: {
          originalBaseUrl: baseImageUrl,
          compositingContext: compositingInfo.compositingContext,
          prompt: prompt.substring(0, 200) + '...',
          method: result.method,
          provider: 'gemini',
          model: result.model,
          keyIndex: result.keyIndex,
          timestamp: new Date().toISOString(),
          processingTime: processingTime,
          responseLength: result.responseLength,
          totalAttempts: result.attempts,
          geminiSuccess: true,
          needsProductImage,
          needsBrandLogo
        }
      };
    } else {
      throw new Error('Gemini 이미지 합성 결과 없음');
    }
  } catch (error) {
    lastError = error;
    console.error('[safeComposeWithGemini] 합성 프로세스 오류:', error.message);
    const processingTime = Date.now() - startTime;
    console.warn(`[safeComposeWithGemini] ⚠️ 합성 실패, 원본 이미지 사용: ${error.message}`);
    return {
      success: true,
      composedImageUrl: baseImageUrl,
      metadata: {
        originalBaseUrl: baseImageUrl,
        compositingContext: compositingInfo.compositingContext,
        method: 'fallback-original',
        provider: 'none',
        model: 'none',
        timestamp: new Date().toISOString(),
        processingTime: processingTime,
        geminiAttempted: true,
        geminiError: error.message,
        fallbackReason: `Gemini 합성 실패: ${error.message}`,
        errorType: error.constructor.name,
        lastError: lastError?.message
      }
    };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      compositingSuccess: false,
      error: 'Method not allowed',
      allowed: ['POST']
    });
  }

  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 8);
  
  try {
    console.log(`[nanobanana-compose] 🚀 요청 수신 [${requestId}]: Scene ${req.body?.sceneNumber || '?'}, Concept ${req.body?.conceptId || '?'}`);

    const { baseImageUrl, overlayImageData, compositingInfo, sceneNumber, conceptId } = req.body;

    if (!baseImageUrl || typeof baseImageUrl !== 'string') {
      console.error(`[nanobanana-compose] [${requestId}] ❌ 잘못된 baseImageUrl`);
      return res.status(400).json({
        success: false,
        compositingSuccess: false,
        error: 'baseImageUrl (string) is required',
        received: { hasBaseImageUrl: !!baseImageUrl, type: typeof baseImageUrl },
        requestId
      });
    }

    if (!overlayImageData || typeof overlayImageData !== 'string') {
      console.error(`[nanobanana-compose] [${requestId}] ❌ 잘못된 overlayImageData`);
      return res.status(400).json({
        success: false,
        compositingSuccess: false,
        error: 'overlayImageData (string) is required',
        received: { hasOverlayImageData: !!overlayImageData },
        requestId
      });
    }

    if (!compositingInfo || typeof compositingInfo !== 'object') {
      console.error(`[nanobanana-compose] [${requestId}] ❌ 잘못된 compositingInfo`);
      return res.status(400).json({
        success: false,
        compositingSuccess: false,
        error: 'compositingInfo object is required',
        received: { hasCompositingInfo: !!compositingInfo },
        requestId
      });
    }

    const keyStatus = getApiKeyStatus();
    console.log(`[nanobanana-compose] [${requestId}] API 키 상태: Gemini ${keyStatus.gemini.availableKeys}/${keyStatus.gemini.totalKeys}개 사용가능`);

    if (keyStatus.gemini.totalKeys === 0) {
      console.error(`[nanobanana-compose] [${requestId}] ❌ Gemini API 키가 없음`);
      return res.status(200).json({
        success: true,
        compositingSuccess: false,
        composedImageUrl: baseImageUrl,
        metadata: {
          method: 'fallback-no-api-key',
          fallbackReason: 'Gemini API 키가 설정되지 않음',
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          requestId
        }
      });
    }

    console.log(`[nanobanana-compose] [${requestId}] 합성 시작: ${compositingInfo.compositingContext}`);
    
    const result = await safeComposeWithGemini(
      baseImageUrl,
      overlayImageData,
      compositingInfo
    );

    const totalProcessingTime = Date.now() - startTime;
    const compositingSuccess = result.metadata.method !== 'fallback-original';

    console.log(`[nanobanana-compose] [${requestId}] ✅ 처리 완료: Scene ${sceneNumber}, 총 시간 ${totalProcessingTime}ms, 방법: ${result.metadata.method}`);

    return res.status(200).json({
      success: true,
      compositingSuccess: compositingSuccess,
      composedImageUrl: result.composedImageUrl,
      metadata: {
        ...result.metadata,
        totalProcessingTime: totalProcessingTime,
        sceneNumber,
        conceptId,
        requestId,
        timestamp: new Date().toISOString()
      },
      debug: {
        sceneNumber,
        conceptId,
        requestId,
        originalBaseUrl: baseImageUrl,
        compositingContext: compositingInfo.compositingContext,
        geminiApiStatus: {
          totalKeys: keyStatus.gemini.totalKeys,
          availableKeys: keyStatus.gemini.availableKeys
        },
        processingInfo: {
          finalMethod: result.metadata.method,
          geminiUsed: result.metadata.geminiSuccess || false,
          keyUsed: result.metadata.keyIndex || null,
          wasSuccessful: compositingSuccess,
          totalAttempts: result.metadata.totalAttempts || 1,
          usedModel: result.metadata.model || 'none'
        }
      }
    });

  } catch (error) {
    console.error(`[nanobanana-compose] [${requestId}] ❌ 핸들러 오류:`, error);

    const totalProcessingTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      compositingSuccess: false,
      composedImageUrl: req.body?.baseImageUrl || null,
      metadata: {
        method: 'fallback-handler-error',
        fallbackReason: `핸들러 오류: ${error.message}`,
        timestamp: new Date().toISOString(),
        processingTime: totalProcessingTime,
        errorType: error.constructor.name,
        requestId
      },
      debug: {
        error: error.message,
        requestId,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
}

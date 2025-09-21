// api/nanobanana-compose.js - Gemini 2.0 Flash Multimodal API 정식 적용 + API 키 풀 완전 활용

import { safeCallGemini, getApiKeyStatus } from '../src/utils/apiHelpers.js';

const MAX_RETRIES = 2;
const RETRY_DELAY = 3000;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB 제한

/**
 * 🔥 이미지 URL을 base64로 안전하게 변환 (크기 제한 포함)
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
  const { compositingContext } = compositingInfo;
  
  let prompt = `You are an expert image compositor specializing in professional advertising visuals. 
Your task is to seamlessly integrate uploaded brand assets into a background scene to create a cohesive, natural-looking advertisement.

INSTRUCTIONS:
1. Use the first image as the base background scene
2. Integrate the second image (product/logo) naturally into the scene
3. Maintain consistent lighting, shadows, and perspective
4. Ensure all elements look like they belong together naturally
5. Create a professional advertising composition

`;
  
  // 베이스 이미지 설명
  prompt += `Background: The first image provides the scene context and lighting environment. `;
  
  // 오버레이 이미지 처리 방식
  if (needsProductImage && needsBrandLogo) {
    prompt += `Overlay: The second image contains both product and brand logo. Place the product prominently as the hero element, and integrate the logo subtly in an appropriate corner or branded area. `;
  } else if (needsProductImage) {
    prompt += `Overlay: The second image contains a product. Integrate it as the focal point of the composition, making it look naturally placed within the scene environment. `;
  } else if (needsBrandLogo) {
    prompt += `Overlay: The second image contains a brand logo. Place it elegantly and subtly within the composition, typically in a corner or branded space that doesn't overwhelm the scene. `;
  }

  // 컨텍스트별 세부 지침
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

  // 기술적 요구사항 (더 구체적으로)
  prompt += `
TECHNICAL REQUIREMENTS:
- Match lighting direction and color temperature between all elements
- Create realistic shadows and reflections for integrated objects
- Maintain consistent perspective and natural scale relationships
- Preserve the original atmosphere and mood of the background
- Ensure seamless integration with no obvious compositing artifacts
- Keep all text elements readable if present
- Avoid adding any new text or watermarks
- Result should look like a single, professional photograph

Generate a cohesive, professional advertisement image that looks completely natural.`;

  return prompt;
}

/**
 * 🔥 Gemini 2.0 Flash Multimodal API 호출 (공식 문서 기반)
 */
async function callGeminiImageComposition(baseImageBase64, overlayImageBase64, prompt, retryCount = 0) {
  const maxRetries = MAX_RETRIES;
  
  try {
    console.log(`[callGeminiImageComposition] 🔥 Gemini 이미지 합성 시도 ${retryCount + 1}/${maxRetries + 1}`);
    
    // 🔥 API 키 풀 상태 확인
    const keyStatus = getApiKeyStatus();
    if (keyStatus.gemini.totalKeys === 0) {
      throw new Error('Gemini API 키가 설정되지 않았습니다');
    }
    
    console.log(`[callGeminiImageComposition] API 키 상태: ${keyStatus.gemini.availableKeys}/${keyStatus.gemini.totalKeys}개 사용가능`);
    
    // 🔥 Rate Limit 방지를 위한 딜레이 (2차 호출부터)
    if (retryCount > 0) {
      const delay = RETRY_DELAY * retryCount + Math.random() * 2000; // 지터 추가
      console.log(`[callGeminiImageComposition] Rate Limit 방지 딜레이: ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // 🔥 Gemini 2.0 Flash Multimodal - 정확한 API 형식
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

    // 🔥 safeCallGemini를 통한 키 풀 활용 호출
    const result = await safeCallGemini(geminiContent, {
      model: 'gemini-2.0-flash-exp', // 🔥 최신 이미지 생성 모델
      maxRetries: 2,
      label: `nanobanana-compose-attempt-${retryCount + 1}`
    });

    console.log(`[callGeminiImageComposition] API 응답 받음: ${result.text.substring(0, 100)}...`);

    // 🔥 응답에서 이미지 데이터 추출 (여러 형태 지원)
    let imageData = null;
    
    // 1. data: URL 형태 확인
    const dataUrlMatch = result.text.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
    if (dataUrlMatch) {
      imageData = dataUrlMatch[0]; // 전체 data URL
      console.log(`[callGeminiImageComposition] ✅ Data URL 형태로 이미지 발견`);
    }
    
    // 2. 순수 base64 형태 확인 (길이 기반)
    if (!imageData) {
      const lines = result.text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(trimmed)) {
          imageData = `data:image/jpeg;base64,${trimmed}`;
          console.log(`[callGeminiImageComposition] ✅ 순수 base64로 이미지 발견`);
          break;
        }
      }
    }
    
    // 3. JSON 응답 내부 확인
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
      } catch (e) {
        // JSON 파싱 실패는 무시
      }
    }

    if (imageData) {
      return {
        success: true,
        imageUrl: imageData,
        method: 'gemini-2.0-flash-multimodal',
        model: result.model,
        keyIndex: result.keyIndex,
        processingTime: result.processingTime,
        responseLength: result.text.length
      };
    }

    // 🔥 이미지 데이터를 찾지 못한 경우 재시도
    if (retryCount < maxRetries) {
      console.log(`[callGeminiImageComposition] 이미지 데이터 없음, 재시도...`);
      console.log(`[callGeminiImageComposition] 응답 샘플: ${result.text.substring(0, 200)}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return callGeminiImageComposition(baseImageBase64, overlayImageBase64, prompt, retryCount + 1);
    }

    throw new Error('Gemini 응답에서 이미지 데이터를 찾을 수 없음');

  } catch (error) {
    console.error(`[callGeminiImageComposition] 시도 ${retryCount + 1} 실패:`, error.message);
    
    // 🔥 재시도 로직 (특정 에러만)
    const retryableErrors = ['429', '500', '502', '503', '504', 'timeout', 'quota', 'overload'];
    const shouldRetry = retryableErrors.some(code => error.message.toLowerCase().includes(code));
    
    if (retryCount < maxRetries && shouldRetry) {
      const delay = RETRY_DELAY * (retryCount + 1) + Math.random() * 3000; // 지터 포함
      console.log(`[callGeminiImageComposition] ${Math.round(delay)}ms 후 재시도... (${error.message})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callGeminiImageComposition(baseImageBase64, overlayImageBase64, prompt, retryCount + 1);
    }
    
    throw error;
  }
}

/**
 * 🔥 최종 합성 함수 (완전 수정)
 */
async function safeComposeWithGemini(baseImageUrl, overlayImageData, compositingInfo) {
  const startTime = Date.now();
  
  try {
    console.log(`[safeComposeWithGemini] 🔥 Gemini 2.0 Flash 이미지 합성 시작`);
    
    // 1. API 키 상태 확인
    const keyStatus = getApiKeyStatus();
    console.log(`[safeComposeWithGemini] Gemini API 키 상태: ${keyStatus.gemini.availableKeys}/${keyStatus.gemini.totalKeys}개 사용가능`);
    
    if (keyStatus.gemini.totalKeys === 0) {
      throw new Error('Gemini API 키가 설정되지 않았습니다');
    }
    
    // 2. 베이스 이미지 다운로드 및 변환
    console.log(`[safeComposeWithGemini] 베이스 이미지 다운로드: ${baseImageUrl.substring(0, 50)}...`);
    const baseImageBase64 = await imageUrlToBase64(baseImageUrl);
    const baseMimeType = detectMimeType(baseImageUrl);
    
    console.log(`[safeComposeWithGemini] 베이스 이미지 준비: ${(baseImageBase64.length / 1024).toFixed(1)}KB (${baseMimeType})`);
    
    // 3. 오버레이 이미지 준비
    let overlayImageBase64;
    let overlayMimeType = 'image/jpeg';
    
    if (overlayImageData.startsWith('http')) {
      console.log(`[safeComposeWithGemini] 오버레이 이미지 다운로드: ${overlayImageData.substring(0, 50)}...`);
      overlayImageBase64 = await imageUrlToBase64(overlayImageData);
      overlayMimeType = detectMimeType(overlayImageData);
    } else {
      console.log(`[safeComposeWithGemini] 오버레이 이미지 base64 추출 중...`);
      overlayImageBase64 = extractBase64Data(overlayImageData);
      // data URL에서 MIME 타입 추출
      if (overlayImageData.startsWith('data:')) {
        const mimeMatch = overlayImageData.match(/data:([^;]+)/);
        if (mimeMatch) overlayMimeType = mimeMatch[1];
      }
    }
    
    console.log(`[safeComposeWithGemini] 오버레이 이미지 준비: ${(overlayImageBase64.length / 1024).toFixed(1)}KB (${overlayMimeType})`);
    
    // 4. 합성 정보 분석
    const needsProductImage = compositingInfo.needsProductImage || false;
    const needsBrandLogo = compositingInfo.needsBrandLogo || false;
    
    console.log(`[safeComposeWithGemini] 합성 요구사항: 제품=${needsProductImage}, 로고=${needsBrandLogo}`);
    
    // 5. 합성 프롬프트 생성
    const prompt = generateCompositingPrompt(compositingInfo, needsProductImage, needsBrandLogo);
    console.log(`[safeComposeWithGemini] 프롬프트 생성 완료: ${prompt.substring(0, 150)}...`);
    
    // 6. 🔥 실제 Gemini 2.0 Flash API 호출
    const result = await callGeminiImageComposition(baseImageBase64, overlayImageBase64, prompt);
    
    const processingTime = Date.now() - startTime;
    
    if (result.success) {
      console.log(`[safeComposeWithGemini] ✅ 합성 성공 (${processingTime}ms, 모델: ${result.model})`);
      
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
          geminiSuccess: true,
          needsProductImage,
          needsBrandLogo
        }
      };
    } else {
      throw new Error('Gemini 이미지 합성 실패');
    }
    
  } catch (error) {
    console.error('[safeComposeWithGemini] 합성 프로세스 오류:', error.message);
    
    // 🔥 실패 시 원본 이미지로 fallback (에러 격리)
    const processingTime = Date.now() - startTime;
    
    console.warn(`[safeComposeWithGemini] ⚠️ 합성 실패, 원본 이미지 사용: ${error.message}`);
    
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
        geminiAttempted: true,
        geminiError: error.message,
        fallbackReason: `Gemini 합성 실패: ${error.message}`,
        errorType: error.constructor.name
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

    console.log(`[nanobanana-compose] 🚀 요청 수신: Scene ${sceneNumber}, Concept ${conceptId}`);

    // 🔥 입력값 검증
    if (!baseImageUrl || typeof baseImageUrl !== 'string' || !baseImageUrl.startsWith('http')) {
      return res.status(400).json({
        success: false,
        error: 'Valid baseImageUrl (HTTP/HTTPS) is required',
        received: { baseImageUrl: baseImageUrl ? baseImageUrl.substring(0, 50) + '...' : null }
      });
    }

    if (!overlayImageData || typeof overlayImageData !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'overlayImageData (base64 or URL) is required',
        received: { hasOverlayData: !!overlayImageData }
      });
    }

    if (!compositingInfo || typeof compositingInfo !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'compositingInfo object is required',
        received: { hasCompositingInfo: !!compositingInfo }
      });
    }

    // 🔥 API 키 상태 확인 및 로깅
    const keyStatus = getApiKeyStatus();
    console.log(`[nanobanana-compose] API 키 상태: Gemini ${keyStatus.gemini.availableKeys}/${keyStatus.gemini.totalKeys}개 사용가능`);

    // API 키가 없으면 원본 반환
    if (keyStatus.gemini.totalKeys === 0) {
      console.error('[nanobanana-compose] ❌ Gemini API 키가 없음');
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

    // 🔥 이미지 합성 실행
    console.log(`[nanobanana-compose] 합성 시작: ${compositingInfo.compositingContext}`);
    
    const result = await safeComposeWithGemini(
      baseImageUrl,
      overlayImageData,
      compositingInfo
    );

    const totalProcessingTime = Date.now() - startTime;

    console.log(`[nanobanana-compose] ✅ 처리 완료: Scene ${sceneNumber}, 총 시간 ${totalProcessingTime}ms, 방법: ${result.metadata.method}`);

    // 🔥 최종 응답
    return res.status(200).json({
      success: true,
      composedImageUrl: result.composedImageUrl,
      metadata: {
        ...result.metadata,
        totalProcessingTime: totalProcessingTime,
        sceneNumber,
        conceptId,
        timestamp: new Date().toISOString()
      },
      debug: {
        sceneNumber,
        conceptId,
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
          wasSuccessful: result.metadata.method !== 'fallback-original'
        }
      }
    });

  } catch (error) {
    console.error('[nanobanana-compose] ❌ 핸들러 오류:', error);

    const totalProcessingTime = Date.now() - startTime;

    // 🔥 에러 시에도 원본 이미지로 응답 (서비스 연속성)
    return res.status(200).json({
      success: true, // 원본 사용으로 성공 처리
      composedImageUrl: req.body?.baseImageUrl || null,
      metadata: {
        method: 'fallback-handler-error',
        fallbackReason: `핸들러 오류: ${error.message}`,
        timestamp: new Date().toISOString(),
        processingTime: totalProcessingTime,
        errorType: error.constructor.name
      },
      debug: {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }
    });
  }
}

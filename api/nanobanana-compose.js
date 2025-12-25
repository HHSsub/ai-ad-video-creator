// api/nanobanana-compose.js - 합성 기능 개선 + 최신 Gemini 2.5 API 사용
import { safeCallGemini, getApiKeyStatus } from '../src/utils/apiHelpers.js';


// 🔥 Gemini를 이용한 이미지 합성 함수 - 2025년 최신 API 사용
export async function safeComposeWithGemini(baseImageUrl, overlayImageData, compositingInfo) {
  const startTime = Date.now();
  let lastError = null;

  try {
    console.log('[safeComposeWithGemini] 합성 시작:', {
      baseImageUrl: baseImageUrl ? '제공됨' : '없음',
      overlayImageData: overlayImageData ? '제공됨' : '없음',
      compositingContext: compositingInfo?.compositingContext || 'N/A'
    });

    // 🔥 입력 검증
    if (!baseImageUrl || typeof baseImageUrl !== 'string') {
      throw new Error('baseImageUrl이 유효하지 않습니다');
    }

    if (!overlayImageData || typeof overlayImageData !== 'string') {
      throw new Error('overlayImageData가 유효하지 않습니다');
    }

    if (!compositingInfo || typeof compositingInfo !== 'object') {
      throw new Error('compositingInfo가 유효하지 않습니다');
    }

    // 🔥 합성 필요성 분석
    const needsProductImage = compositingInfo.videoPurpose === 'product' ||
      compositingInfo.videoPurpose === 'conversion' ||
      compositingInfo.compositingContext?.includes('PRODUCT');

    const needsBrandLogo = compositingInfo.videoPurpose === 'service' ||
      compositingInfo.videoPurpose === 'brand' ||
      compositingInfo.compositingContext?.includes('LOGO');

    console.log('[safeComposeWithGemini] 합성 분석:', {
      needsProductImage,
      needsBrandLogo,
      videoPurpose: compositingInfo.videoPurpose
    });

    // 🔥 Gemini 2.5 이미지 합성 프롬프트 - 2025년 최신 버전
    const compositingPrompt = `
**TASK**: AI 광고 영상용 이미지 합성 - 최신 Gemini 2.5 Flash Image Preview 사용

Seamlessly composite the foreground product into the background, creating a single, ultra-realistic, and perfectly cohesive photograph.
Harmonize Lighting & Color: Match the product's lighting to the background's light source direction, color temperature, and shadow softness. The product's color and contrast must blend perfectly with the scene's ambient light.
Cast Realistic Shadows: Generate a physically accurate contact shadow where the product meets the surface, ensuring the shadow's blur and darkness are consistent with the environment's lighting.
Integrate Edges & Focus: Meticulously blend the product's edges to match the background's depth of field (bokeh) and atmospheric conditions. Eliminate any artificial 'cut-out' appearance.
Render Environmental Interaction: Create subtle, realistic reflections of the background onto the product's surface (especially if glossy or metallic).
Final Polish: Apply a unified, professional color grade over the entire image. The final result must be a masterpiece of photorealism, cohesive, 8K, high detail.

**INPUT IMAGES**:
1. 베이스 이미지: 광고 배경 장면
2. 오버레이 이미지: ${needsProductImage ? '제품 이미지' : '브랜드 로고'}

**COMPOSITING REQUIREMENTS**:
- 목적: ${compositingInfo.videoPurpose || 'product'} 광고 영상 제작
- 장면 설명: ${compositingInfo.sceneDescription || '제품/브랜드 합성 장면'}
- 합성 맥락: ${compositingInfo.compositingContext || '자연스러운 제품 배치'}

**ADVANCED COMPOSITING INSTRUCTIONS** (2025 최신 기법 적용):
1. **자연스러운 통합**: 오버레이 이미지를 베이스 이미지의 조명, 원근감, 색감에 맞춰 자연스럽게 합성
2. **적응형 크기 조절**: 제품/로고 크기를 장면에 맞게 적절히 조절 (너무 크거나 작지 않게)
3. **광고 효과 최적화**: 제품/브랜드가 돋보이도록 하되 전체적으로 조화로운 이미지 생성
4. **고품질 렌더링**: 경계선이 자연스럽고 픽셀레이션이 없는 고품질 합성 결과물
5. **맥락적 배치**: 장면의 흐름과 스토리에 맞는 위치에 제품/로고 배치

**OUTPUT FORMAT**: 
- 합성이 완료된 고품질 이미지를 즉시 반환
- 베이스 이미지 해상도 및 종횡비 유지
- ${needsProductImage ? '제품이 자연스럽게 장면에 녹아든' : '브랜드 로고가 적절히 표시된'} 최종 이미지

**CRITICAL**: 
- 원본 이미지들의 품질을 유지하면서 합성
- 광고용이므로 전문적이고 매력적인 비주얼 완성
- 2025년 최신 AI 이미지 생성 기술 활용`;

    // 🔥 Gemini 2.5 API 호출 - 최신 이미지 합성 기능 사용
    console.log('[safeComposeWithGemini] Gemini 2.5 Flash Image Preview 호출 시작');

    const result = await safeCallGemini(compositingPrompt, {
      label: 'nanobanana-image-compositing',
      maxRetries: 3,
      isImageComposition: true,
      images: [
        {
          url: baseImageUrl,
          type: 'base_scene'
        },
        {
          // 🔥 URL/Data 자동 분기
          [overlayImageData.startsWith('http') ? 'url' : 'data']: overlayImageData,
          type: needsProductImage ? 'product_image' : 'brand_logo'
        }
      ],
      // 🔥 2025년 최신 파라미터
      model: 'gemini-2.5-flash-image-preview', // 최신 이미지 합성 모델
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        topP: 0.8,
        topK: 40
      }
    });

    // 🔥 이미지 데이터 확인 (Base64 or URL)
    if (result && result.success && (result.imageData || result.imageUrl)) {
      const processingTime = Date.now() - startTime;
      console.log(`[safeComposeWithGemini] ✅ 합성 성공: ${processingTime}ms`);

      return {
        success: true,
        // composedImageUrl: result.imageUrl, // 기존방식 (URL)
        composedImageData: result.imageData, // 🔥 Base64 데이터 반환
        metadata: {
          originalBaseUrl: baseImageUrl,
          compositingContext: compositingInfo.compositingContext,
          method: 'gemini-2.5-flash-image-preview',
          provider: 'google',
          model: result.model || 'gemini-2.5-flash-image-preview',
          timestamp: new Date().toISOString(),
          processingTime: processingTime,
          responseLength: result.responseLength,
          totalAttempts: result.attempts,
          geminiSuccess: true,
          needsProductImage,
          needsBrandLogo,
          // 🔥 2025년 추가 메타데이터
          apiVersion: '2.5',
          imageCompositionMethod: 'advanced-ai-blend',
          qualityScore: result.qualityScore || 'high'
        }
      };
    } else {
      throw new Error('Gemini 2.5 이미지 합성 결과 없음');
    }
  } catch (error) {
    lastError = error;
    console.error('[safeComposeWithGemini] 합성 프로세스 오류:', error.message);
    const processingTime = Date.now() - startTime;

    console.warn(`[safeComposeWithGemini] ⚠️ 합성 실패, 원본 이미지 사용: ${error.message}`);

    return {
      success: true,
      composedImageUrl: baseImageUrl, // 🔥 실패 시 원본 이미지 반환
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
        fallbackReason: `Gemini 2.5 합성 실패: ${error.message}`,
        errorType: error.constructor.name,
        lastError: lastError?.message,
        // 🔥 실패 시에도 메타데이터 제공
        apiVersion: '2.5',
        attemptedModel: 'gemini-2.5-flash-image-preview'
      }
    };
  }
}

export default async function handler(req, res) {
  // 🔥 CORS 설정 개선
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      compositingSuccess: false,
      error: 'Method not allowed. Only POST requests are supported.',
      allowed: ['POST'],
      apiVersion: '2.5'
    });
  }

  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 8);

  try {
    console.log(`[nanobanana-compose] 🚀 [${requestId}] 2025 합성 요청 수신: Scene ${req.body?.sceneNumber || '?'}, Concept ${req.body?.conceptId || '?'}`);

    const { baseImageUrl, overlayImageData, compositingInfo, sceneNumber, conceptId } = req.body;

    // 🔥 입력 검증 강화
    if (!baseImageUrl || typeof baseImageUrl !== 'string') {
      console.error(`[nanobanana-compose] [${requestId}] ❌ 잘못된 baseImageUrl`);
      return res.status(400).json({
        success: false,
        compositingSuccess: false,
        error: 'baseImageUrl (string) is required',
        received: { hasBaseImageUrl: !!baseImageUrl, type: typeof baseImageUrl },
        requestId,
        apiVersion: '2.5'
      });
    }

    if (!overlayImageData || typeof overlayImageData !== 'string') {
      console.error(`[nanobanana-compose] [${requestId}] ❌ 잘못된 overlayImageData`);
      return res.status(400).json({
        success: false,
        compositingSuccess: false,
        error: 'overlayImageData (string) is required',
        received: { hasOverlayImageData: !!overlayImageData },
        requestId,
        apiVersion: '2.5'
      });
    }

    if (!compositingInfo || typeof compositingInfo !== 'object') {
      console.error(`[nanobanana-compose] [${requestId}] ❌ 잘못된 compositingInfo`);
      return res.status(400).json({
        success: false,
        compositingSuccess: false,
        error: 'compositingInfo object is required',
        received: { hasCompositingInfo: !!compositingInfo },
        requestId,
        apiVersion: '2.5'
      });
    }

    // 🔥 API 키 상태 확인 - 2025년 버전
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
          fallbackReason: 'Gemini 2.5 API 키가 설정되지 않음',
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          requestId,
          apiVersion: '2.5'
        }
      });
    }

    // 🔥 Gemini 2.5 합성 실행
    console.log(`[nanobanana-compose] [${requestId}] Gemini 2.5 합성 시작: ${compositingInfo.compositingContext}`);

    const result = await safeComposeWithGemini(
      baseImageUrl,
      overlayImageData,
      compositingInfo
    );

    const totalProcessingTime = Date.now() - startTime;
    const compositingSuccess = result.metadata.method !== 'fallback-original';

    console.log(`[nanobanana-compose] [${requestId}] ✅ 처리 완료: Scene ${sceneNumber}, 총 시간 ${totalProcessingTime}ms, 방법: ${result.metadata.method}`);

    // 🔥 2025년 응답 형식
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
        timestamp: new Date().toISOString(),
        apiVersion: '2.5'
      },
      debug: {
        sceneNumber,
        conceptId,
        requestId,
        originalBaseUrl: baseImageUrl,
        compositingContext: compositingInfo.compositingContext,
        geminiApiStatus: {
          totalKeys: keyStatus.gemini.totalKeys,
          availableKeys: keyStatus.gemini.availableKeys,
          version: '2.5'
        },
        processingInfo: {
          finalMethod: result.metadata.method,
          geminiUsed: result.metadata.geminiSuccess || false,
          keyUsed: result.metadata.keyIndex || null,
          wasSuccessful: compositingSuccess,
          totalAttempts: result.metadata.totalAttempts || 1,
          usedModel: result.metadata.model || 'none',
          apiVersion: '2.5',
          imageCompositionTech: result.metadata.imageCompositionMethod || 'standard'
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
        requestId,
        apiVersion: '2.5'
      },
      debug: {
        error: error.message,
        requestId,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        apiVersion: '2.5'
      }
    });
  }
}

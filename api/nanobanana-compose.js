// api/nanobanana-compose.js - Gemini Nano Banana를 활용한 이미지 합성

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

/**
 * Gemini Nano Banana를 사용한 이미지 합성
 * @param {string} baseImageUrl - 베이스 이미지 URL (Freepik에서 생성된 이미지)
 * @param {string} overlayImageData - 합성할 이미지 데이터 (base64 또는 URL)
 * @param {object} compositingInfo - 합성 정보
 * @param {string} apiKey - Gemini API 키
 */
async function composeWithNanoBanana(baseImageUrl, overlayImageData, compositingInfo, apiKey) {
  console.log('[nanobanana-compose] 합성 시작:', {
    baseImageUrl: baseImageUrl.substring(0, 80) + '...',
    hasOverlayData: !!overlayImageData,
    compositingContext: compositingInfo.compositingContext
  });

  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Gemini Pro Vision 모델 사용 (이미지 편집 기능)
  const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

  try {
    // 베이스 이미지 다운로드
    const baseImageResponse = await fetch(baseImageUrl);
    if (!baseImageResponse.ok) {
      throw new Error(`베이스 이미지 다운로드 실패: ${baseImageResponse.status}`);
    }
    const baseImageBuffer = await baseImageResponse.arrayBuffer();
    const baseImageBase64 = Buffer.from(baseImageBuffer).toString('base64');

    // 오버레이 이미지 처리 (base64 형태로 변환)
    let overlayImageBase64;
    if (overlayImageData.startsWith('data:')) {
      // 이미 base64 형태
      overlayImageBase64 = overlayImageData.split(',')[1];
    } else if (overlayImageData.startsWith('http')) {
      // URL 형태 - 다운로드 필요
      const overlayResponse = await fetch(overlayImageData);
      if (!overlayResponse.ok) {
        throw new Error(`오버레이 이미지 다운로드 실패: ${overlayResponse.status}`);
      }
      const overlayBuffer = await overlayResponse.arrayBuffer();
      overlayImageBase64 = Buffer.from(overlayBuffer).toString('base64');
    } else {
      throw new Error('지원하지 않는 오버레이 이미지 형식');
    }

    // 합성 프롬프트 생성
    const compositionPrompt = generateCompositionPrompt(compositingInfo);
    
    console.log('[nanobanana-compose] 합성 프롬프트:', compositionPrompt);

    // Gemini에 합성 요청
    const result = await model.generateContent([
      {
        text: compositionPrompt
      },
      {
        inlineData: {
          data: baseImageBase64,
          mimeType: "image/jpeg"
        }
      },
      {
        inlineData: {
          data: overlayImageBase64,
          mimeType: "image/jpeg"
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    console.log('[nanobanana-compose] Gemini 응답:', text.substring(0, 200) + '...');

    // 실제 구현에서는 Gemini의 이미지 편집 결과를 받아야 하지만,
    // 현재는 시뮬레이션으로 베이스 이미지를 반환
    // TODO: 실제 Nano Banana 이미지 편집 결과 처리
    
    return {
      success: true,
      composedImageUrl: baseImageUrl, // 임시: 실제로는 편집된 이미지 URL
      compositionDescription: text,
      metadata: {
        originalBaseUrl: baseImageUrl,
        compositingContext: compositingInfo.compositingContext,
        prompt: compositionPrompt,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('[nanobanana-compose] 오류:', error);
    throw error;
  }
}

/**
 * 합성 컨텍스트에 따른 프롬프트 생성
 */
function generateCompositionPrompt(compositingInfo) {
  const { compositingContext, needsProductImage, needsBrandLogo } = compositingInfo;
  
  let basePrompt = `Please analyze these two images and create a natural composition instruction. `;
  
  if (needsProductImage && needsBrandLogo) {
    basePrompt += `The second image contains both a product and a brand logo that need to be seamlessly integrated into the first image (background scene). `;
  } else if (needsProductImage) {
    basePrompt += `The second image contains a product that needs to be naturally placed in the first image (background scene). `;
  } else if (needsBrandLogo) {
    basePrompt += `The second image contains a brand logo that needs to be subtly integrated into the first image (background scene). `;
  }

  // 컨텍스트별 세부 지침
  switch (compositingContext) {
    case 'PRODUCT_COMPOSITING_SCENE':
      basePrompt += `This is a designated product compositing scene. The product should be the focal point while maintaining the aesthetic of the background. `;
      break;
    case 'AUTO_PURCHASE_CONVERSION':
      basePrompt += `This is scene 2 in a purchase conversion video. The product should be prominently displayed as a solution to a problem. `;
      break;
    case 'AUTO_BRAND_AWARENESS':
      basePrompt += `This is the final scene for brand awareness. The composition should create a strong brand impression. `;
      break;
    default:
      basePrompt += `Please create a natural composition that enhances the overall visual narrative. `;
  }

  basePrompt += `
  Requirements:
  - Maintain realistic lighting and shadows
  - Preserve the original background atmosphere
  - Ensure the composition looks natural and professional
  - Keep consistent color temperature
  - Avoid obvious compositing artifacts
  
  Please describe how to optimally compose these elements together.`;

  return basePrompt;
}

/**
 * 재시도 로직을 포함한 안전한 합성 함수
 */
async function safeCompose(baseImageUrl, overlayImageData, compositingInfo, apiKey) {
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[nanobanana-compose] 합성 시도 ${attempt}/${MAX_RETRIES}`);
      
      return await composeWithNanoBanana(baseImageUrl, overlayImageData, compositingInfo, apiKey);
      
    } catch (error) {
      lastError = error;
      console.error(`[nanobanana-compose] 시도 ${attempt} 실패:`, error.message);
      
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt;
        console.log(`[nanobanana-compose] ${delay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('합성 최대 재시도 초과');
}

/**
 * 메인 API 핸들러
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
      baseImageUrl,        // Freepik에서 생성된 베이스 이미지 URL
      overlayImageData,    // 합성할 제품/로고 이미지 (base64 또는 URL)
      compositingInfo,     // 합성 정보 객체
      sceneNumber,         // 씬 번호 (디버깅용)
      conceptId           // 컨셉 ID (디버깅용)
    } = req.body || {};

    // 입력값 검증
    if (!baseImageUrl || typeof baseImageUrl !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'baseImageUrl is required'
      });
    }

    if (!overlayImageData || typeof overlayImageData !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'overlayImageData is required'
      });
    }

    if (!compositingInfo || typeof compositingInfo !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'compositingInfo is required'
      });
    }

    // Gemini API 키 확인
    const apiKey = process.env.GEMINI_API_KEY || 
                   process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      console.error('[nanobanana-compose] Gemini API 키가 없음');
      return res.status(500).json({
        success: false,
        error: 'Gemini API key not configured'
      });
    }

    console.log('[nanobanana-compose] 요청 수신:', {
      sceneNumber,
      conceptId,
      hasBaseImage: !!baseImageUrl,
      hasOverlayData: !!overlayImageData,
      compositingContext: compositingInfo.compositingContext
    });

    // 합성 실행
    const result = await safeCompose(
      baseImageUrl,
      overlayImageData,
      compositingInfo,
      apiKey
    );

    const processingTime = Date.now() - startTime;

    console.log('[nanobanana-compose] ✅ 합성 완료:', {
      sceneNumber,
      conceptId,
      processingTime: processingTime + 'ms',
      success: result.success
    });

    return res.status(200).json({
      success: true,
      ...result,
      processingTime: processingTime,
      debug: {
        sceneNumber,
        conceptId,
        originalBaseUrl: baseImageUrl,
        compositingContext: compositingInfo.compositingContext
      }
    });

  } catch (error) {
    console.error('[nanobanana-compose] 전체 오류:', error);

    const processingTime = Date.now() - startTime;

    return res.status(500).json({
      success: false,
      error: error.message,
      processingTime: processingTime,
      fallback: {
        // 실패 시 원본 이미지 반환
        composedImageUrl: req.body?.baseImageUrl || null,
        reason: 'composition_failed'
      }
    });
  }
}

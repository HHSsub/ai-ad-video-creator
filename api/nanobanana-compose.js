// api/nanobanana-compose.js - 실제 Gemini 2.5 Flash Image (Nano Banana) API 호출

import 'dotenv/config';
import fetch from 'node-fetch';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const NANO_BANANA_MODEL = 'gemini-2.5-flash-image-preview';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

/**
 * 이미지 URL을 base64로 변환
 */
async function imageUrlToBase64(imageUrl) {
  try {
    console.log(`[imageUrlToBase64] 다운로드 시작: ${imageUrl.substring(0, 80)}...`);
    
    const response = await fetch(imageUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'AI-Ad-Creator/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`이미지 다운로드 실패: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    console.log(`[imageUrlToBase64] 변환 완료: ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB`);
    return base64;
    
  } catch (error) {
    console.error('[imageUrlToBase64] 오류:', error.message);
    throw error;
  }
}

/**
 * base64 데이터에서 실제 base64 문자열만 추출
 */
function extractBase64Data(base64Input) {
  if (base64Input.startsWith('data:')) {
    // data:image/jpeg;base64,/9j/4AAQ... 형태에서 실제 데이터만 추출
    return base64Input.split(',')[1];
  }
  return base64Input;
}

/**
 * 합성 프롬프트 생성 (실제 Nano Banana 최적화)
 */
function generateCompositingPrompt(compositingInfo) {
  const { compositingContext, needsProductImage, needsBrandLogo } = compositingInfo;
  
  let prompt = `Please compose these two images seamlessly. `;
  
  // 첫 번째 이미지는 배경, 두 번째 이미지는 합성할 대상
  prompt += `Use the first image as the background scene and naturally integrate elements from the second image. `;
  
  if (needsProductImage && needsBrandLogo) {
    prompt += `The second image contains both a product and brand logo. Place the product prominently in the scene and integrate the logo subtly. `;
  } else if (needsProductImage) {
    prompt += `The second image contains a product. Place it naturally in the background scene as the main focus. `;
  } else if (needsBrandLogo) {
    prompt += `The second image contains a brand logo. Integrate it elegantly into the background scene. `;
  }

  // 컨텍스트별 세부 지침
  switch (compositingContext) {
    case 'PRODUCT_COMPOSITING_SCENE':
    case 'EXPLICIT':
      prompt += `This is a designated product showcase. Make the product the focal point while maintaining the scene's atmosphere. `;
      break;
    case 'AUTO_PURCHASE_CONVERSION':
      prompt += `This is for purchase conversion. Position the product prominently as an attractive solution. `;
      break;
    case 'AUTO_BRAND_AWARENESS':
      prompt += `This is for brand awareness. Create a memorable, aesthetically pleasing composition. `;
      break;
  }

  prompt += `
Requirements:
- Maintain realistic lighting and shadows that match the background
- Preserve the original background mood and atmosphere
- Ensure perspective and scale are natural and believable
- Keep consistent color temperature across the composition
- Make the integration look professional and seamless
- Do not add any text, watermarks, or logos beyond what's in the source images

Create a natural, professional composition where everything looks like it belongs together.`;

  return prompt;
}

/**
 * 실제 Gemini 2.5 Flash Image API 호출
 */
async function callNanoBananaAPI(baseImageBase64, overlayImageBase64, compositingPrompt, apiKey) {
  const url = `${GEMINI_API_BASE}/models/${NANO_BANANA_MODEL}:generateContent?key=${apiKey}`;
  
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: compositingPrompt
          },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: baseImageBase64
            }
          },
          {
            inline_data: {
              mime_type: "image/jpeg", 
              data: overlayImageBase64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 0.8,
      maxOutputTokens: 4096,
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH", 
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      }
    ]
  };

  console.log('[callNanoBananaAPI] Gemini 2.5 Flash Image API 요청 시작');
  console.log(`[callNanoBananaAPI] URL: ${url}`);
  console.log(`[callNanoBananaAPI] 프롬프트: ${compositingPrompt.substring(0, 150)}...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[callNanoBananaAPI] API 오류:', response.status, errorText);
    throw new Error(`Gemini API 오류: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log('[callNanoBananaAPI] API 응답 수신 성공');
  
  return result;
}

/**
 * Gemini 2.5 Flash Image 응답에서 편집된 이미지 데이터 추출
 */
function extractEditedImageFromResponse(geminiResponse) {
  try {
    console.log('[extractEditedImageFromResponse] 응답 분석 시작');
    
    const candidates = geminiResponse.candidates;
    if (!candidates || !candidates.length) {
      throw new Error('Gemini 응답에 candidates 없음');
    }

    const candidate = candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      throw new Error('Gemini 응답에 content.parts 없음');
    }

    console.log(`[extractEditedImageFromResponse] ${candidate.content.parts.length}개 part 확인 중`);

    // 이미지 데이터가 포함된 part 찾기 (Nano Banana 응답 구조)
    for (const part of candidate.content.parts) {
      if (part.inline_data && part.inline_data.data) {
        const mimeType = part.inline_data.mime_type || 'image/jpeg';
        const base64Data = part.inline_data.data;
        
        console.log(`[extractEditedImageFromResponse] 이미지 발견: ${mimeType}, ${(base64Data.length / 1024).toFixed(1)}KB`);
        
        // Data URL 형태로 반환 (브라우저에서 바로 사용 가능)
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        return dataUrl;
      }
    }

    // 텍스트 응답도 확인 (디버깅용)
    for (const part of candidate.content.parts) {
      if (part.text) {
        console.log(`[extractEditedImageFromResponse] 텍스트 응답: ${part.text.substring(0, 200)}...`);
      }
    }

    throw new Error('Gemini 응답에서 이미지 데이터를 찾을 수 없음');
    
  } catch (error) {
    console.error('[extractEditedImageFromResponse] 오류:', error);
    throw error;
  }
}

/**
 * 재시도 로직을 포함한 안전한 합성 함수
 */
async function safeCompose(baseImageUrl, overlayImageData, compositingInfo, apiKey) {
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[safeCompose] 합성 시도 ${attempt}/${MAX_RETRIES}`);
      
      // 1. 베이스 이미지 다운로드 및 변환
      const baseImageBase64 = await imageUrlToBase64(baseImageUrl);
      
      // 2. 오버레이 이미지 처리
      let overlayImageBase64;
      if (overlayImageData.startsWith('http')) {
        // URL 형태 - 다운로드
        overlayImageBase64 = await imageUrlToBase64(overlayImageData);
      } else {
        // 이미 base64 형태 - 데이터만 추출
        overlayImageBase64 = extractBase64Data(overlayImageData);
      }
      
      // 3. 합성 프롬프트 생성
      const compositingPrompt = generateCompositingPrompt(compositingInfo);
      
      // 4. Gemini API 호출
      const geminiResponse = await callNanoBananaAPI(
        baseImageBase64, 
        overlayImageBase64, 
        compositingPrompt, 
        apiKey
      );
      
      // 5. 결과 이미지 추출
      const composedImageUrl = extractEditedImageFromResponse(geminiResponse);
      
      console.log('[safeCompose] ✅ 합성 성공');
      
      return {
        success: true,
        composedImageUrl: composedImageUrl,
        metadata: {
          originalBaseUrl: baseImageUrl,
          compositingContext: compositingInfo.compositingContext,
          prompt: compositingPrompt,
          model: NANO_BANANA_MODEL,
          timestamp: new Date().toISOString(),
          attempt: attempt
        }
      };
      
    } catch (error) {
      lastError = error;
      console.error(`[safeCompose] 시도 ${attempt} 실패:`, error.message);
      
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt;
        console.log(`[safeCompose] ${delay}ms 후 재시도...`);
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
      compositingContext: compositingInfo.compositingContext,
      model: NANO_BANANA_MODEL
    });

    // 실제 Nano Banana 합성 실행
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
      success: result.success,
      hasComposedUrl: !!result.composedImageUrl
    });

    return res.status(200).json({
      success: true,
      ...result,
      processingTime: processingTime,
      debug: {
        sceneNumber,
        conceptId,
        originalBaseUrl: baseImageUrl,
        compositingContext: compositingInfo.compositingContext,
        model: NANO_BANANA_MODEL
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
        reason: 'composition_failed',
        details: error.message
      }
    });
  }
}

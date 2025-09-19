// api/nanobanana-compose.js - Freepik 프록시된 Gemini 2.5 Flash Image 연동 + API 키 풀링

import 'dotenv/config';
import fetch from 'node-fetch';

// 🔥 NEW: 여러 Gemini API 키 풀 (환경변수로 설정, 없는 키는 자동 필터링)
const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5
].filter(Boolean); // 빈 값 자동 제거

// Freepik API 키
const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY || 
                        process.env.VITE_FREEPIK_API_KEY;

const FREEPIK_NANO_BANANA_ENDPOINT = 'https://api.freepik.com/v1/ai/text-to-image/google/gemini-2-5-flash-image-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const NANO_BANANA_MODEL = 'gemini-2.5-flash-image-preview';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const RATE_LIMIT_DELAY = 3000; // 3초 딜레이로 단축

// 🔥 NEW: 다중 사용자 대응 키 분배 시스템
class ApiKeyManager {
  constructor(keys) {
    this.keys = keys.filter(Boolean);
    this.usage = new Map(); // keyIndex -> { lastUsed: timestamp, concurrent: count }
    this.globalIndex = 0;
    
    console.log(`[ApiKeyManager] 초기화: ${this.keys.length}개 키 사용 가능`);
  }
  
  // 가장 적게 사용된 키 반환 (다중 사용자 대응)
  getBestAvailableKey() {
    if (this.keys.length === 0) return null;
    if (this.keys.length === 1) return { key: this.keys[0], index: 0 };
    
    const now = Date.now();
    let bestIndex = 0;
    let minScore = Infinity;
    
    // 각 키의 사용 점수 계산 (최근 사용 시간 + 동시 사용 수)
    for (let i = 0; i < this.keys.length; i++) {
      const usage = this.usage.get(i) || { lastUsed: 0, concurrent: 0 };
      const timeSinceLastUse = now - usage.lastUsed;
      const score = usage.concurrent * 10000 + Math.max(0, 5000 - timeSinceLastUse);
      
      if (score < minScore) {
        minScore = score;
        bestIndex = i;
      }
    }
    
    return { key: this.keys[bestIndex], index: bestIndex };
  }
  
  // 키 사용 시작 (동시 사용 카운트 증가)
  markKeyInUse(keyIndex) {
    if (!this.usage.has(keyIndex)) {
      this.usage.set(keyIndex, { lastUsed: Date.now(), concurrent: 0 });
    }
    this.usage.get(keyIndex).concurrent++;
    this.usage.get(keyIndex).lastUsed = Date.now();
  }
  
  // 키 사용 완료 (동시 사용 카운트 감소)
  markKeyDone(keyIndex) {
    if (this.usage.has(keyIndex)) {
      this.usage.get(keyIndex).concurrent = Math.max(0, this.usage.get(keyIndex).concurrent - 1);
    }
  }
  
  // 디버깅용 사용 현황 출력
  getUsageStats() {
    const stats = {};
    for (let i = 0; i < this.keys.length; i++) {
      const usage = this.usage.get(i) || { lastUsed: 0, concurrent: 0 };
      stats[`key_${i}`] = {
        concurrent: usage.concurrent,
        lastUsed: usage.lastUsed ? new Date(usage.lastUsed).toISOString() : 'never'
      };
    }
    return stats;
  }
}

// 글로벌 키 매니저 인스턴스
const keyManager = new ApiKeyManager(GEMINI_API_KEYS);

/**
 * 최적의 Gemini API 키 반환 (다중 사용자 대응)
 */
function getOptimalGeminiApiKey() {
  const result = keyManager.getBestAvailableKey();
  if (!result) {
    console.warn('[getOptimalGeminiApiKey] 사용 가능한 Gemini API 키 없음');
    return null;
  }
  
  console.log(`[getOptimalGeminiApiKey] 키 선택: index=${result.index}, 사용현황:`, keyManager.getUsageStats());
  return result;
}

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
    return base64Input.split(',')[1];
  }
  return base64Input;
}

/**
 * 합성 프롬프트 생성
 */
function generateCompositingPrompt(compositingInfo) {
  const { compositingContext, needsProductImage, needsBrandLogo } = compositingInfo;
  
  let prompt = `Please compose these two images seamlessly. `;
  
  prompt += `Use the first image as the background scene and naturally integrate elements from the second image. `;
  
  if (needsProductImage && needsBrandLogo) {
    prompt += `The second image contains both a product and brand logo. Place the product prominently in the scene and integrate the logo subtly. `;
  } else if (needsProductImage) {
    prompt += `The second image contains a product. Place it naturally in the background scene as the main focus. `;
  } else if (needsBrandLogo) {
    prompt += `The second image contains a brand logo. Integrate it elegantly into the background scene. `;
  }

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
 * Freepik 프록시를 통한 Nano Banana API 호출 (1순위)
 */
async function callFreepikNanoBanana(baseImageBase64, overlayImageBase64, compositingPrompt) {
  if (!FREEPIK_API_KEY) {
    throw new Error('Freepik API key not configured');
  }

  console.log('[callFreepikNanoBanana] Freepik 프록시를 통한 Nano Banana 호출 시작');

  const requestBody = {
    prompt: compositingPrompt,
    reference_images: [
      {
        image: baseImageBase64,
        weight: 0.7 // 베이스 이미지 가중치
      },
      {
        image: overlayImageBase64,
        weight: 0.3 // 오버레이 이미지 가중치
      }
    ],
    aspect_ratio: "widescreen_16_9",
    quality: "high",
    style: "photo"
  };

  const response = await fetch(FREEPIK_NANO_BANANA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-freepik-api-key': FREEPIK_API_KEY,
      'User-Agent': 'AI-Ad-Creator/2025'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[callFreepikNanoBanana] API 오류:', response.status, errorText);
    throw new Error(`Freepik Nano Banana API 오류: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log('[callFreepikNanoBanana] API 응답 수신 성공');
  
  return result;
}

/**
 * 직접 Gemini API 호출 (2순위, 스마트 키 분배 적용)
 */
async function callDirectGeminiNanoBanana(baseImageBase64, overlayImageBase64, compositingPrompt) {
  const keyResult = getOptimalGeminiApiKey();
  if (!keyResult) {
    throw new Error('사용 가능한 Gemini API 키가 없습니다');
  }

  const { key: apiKey, index: keyIndex } = keyResult;
  
  // 키 사용 시작 마킹
  keyManager.markKeyInUse(keyIndex);
  
  try {
    console.log(`[callDirectGeminiNanoBanana] 키 ${keyIndex} 사용 (동시사용: ${keyManager.usage.get(keyIndex)?.concurrent || 0})`);

    // 🔥 NEW: 스마트 딜레이 (키가 여러개면 짧게, 적으면 길게)
    const dynamicDelay = keyManager.keys.length >= 3 ? 1000 : RATE_LIMIT_DELAY;
    console.log(`[callDirectGeminiNanoBanana] Rate Limit 방지 딜레이: ${dynamicDelay}ms (총 키: ${keyManager.keys.length}개)`);
    await new Promise(resolve => setTimeout(resolve, dynamicDelay));

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
        responseMimeType: "image/png"
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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[callDirectGeminiNanoBanana] 키 ${keyIndex} API 오류:`, response.status, errorText);
      
      // Rate Limit 에러인 경우 다른 키로 재시도 표시
      if (response.status === 429) {
        throw new Error(`Gemini API Rate Limit (키 ${keyIndex}): ${errorText}`);
      }
      
      throw new Error(`Gemini API 오류: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log(`[callDirectGeminiNanoBanana] 키 ${keyIndex} API 응답 수신 성공`);
    
    return { result, keyIndex };
    
  } finally {
    // 키 사용 완료 마킹 (성공/실패 무관하게 실행)
    keyManager.markKeyDone(keyIndex);
  }
}

/**
 * Freepik 응답에서 이미지 URL 추출
 */
function extractImageFromFreepikResponse(freepikResponse) {
  try {
    console.log('[extractImageFromFreepikResponse] Freepik 응답 분석 시작');
    
    // Freepik API 응답 구조에 따라 조정 필요
    if (freepikResponse.data && freepikResponse.data.url) {
      const imageUrl = freepikResponse.data.url;
      console.log(`[extractImageFromFreepikResponse] 이미지 URL 추출: ${imageUrl.substring(0, 80)}...`);
      return imageUrl;
    }
    
    if (freepikResponse.url) {
      console.log(`[extractImageFromFreepikResponse] 직접 URL 발견: ${freepikResponse.url.substring(0, 80)}...`);
      return freepikResponse.url;
    }

    throw new Error('Freepik 응답에서 이미지 URL을 찾을 수 없음');
    
  } catch (error) {
    console.error('[extractImageFromFreepikResponse] 오류:', error);
    throw error;
  }
}

/**
 * Gemini 응답에서 편집된 이미지 데이터 추출
 */
function extractEditedImageFromGeminiResponse(geminiResponse) {
  try {
    console.log('[extractEditedImageFromGeminiResponse] Gemini 응답 분석 시작');
    
    const candidates = geminiResponse.candidates;
    if (!candidates || !candidates.length) {
      throw new Error('Gemini 응답에 candidates 없음');
    }

    const candidate = candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      throw new Error('Gemini 응답에 content.parts 없음');
    }

    for (const part of candidate.content.parts) {
      if (part.inline_data && part.inline_data.data) {
        const mimeType = part.inline_data.mime_type || 'image/jpeg';
        const base64Data = part.inline_data.data;
        
        console.log(`[extractEditedImageFromGeminiResponse] 이미지 발견: ${mimeType}, ${(base64Data.length / 1024).toFixed(1)}KB`);
        
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        return dataUrl;
      }
    }

    throw new Error('Gemini 응답에서 이미지 데이터를 찾을 수 없음');
    
  } catch (error) {
    console.error('[extractEditedImageFromGeminiResponse] 오류:', error);
    throw error;
  }
}

/**
 * 재시도 로직을 포함한 안전한 합성 함수
 */
async function safeCompose(baseImageUrl, overlayImageData, compositingInfo) {
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[safeCompose] 합성 시도 ${attempt}/${MAX_RETRIES}`);
      
      // 1. 베이스 이미지 다운로드 및 변환
      const baseImageBase64 = await imageUrlToBase64(baseImageUrl);
      
      // 2. 오버레이 이미지 처리
      let overlayImageBase64;
      if (overlayImageData.startsWith('http')) {
        overlayImageBase64 = await imageUrlToBase64(overlayImageData);
      } else {
        overlayImageBase64 = extractBase64Data(overlayImageData);
      }
      
      // 3. 합성 프롬프트 생성
      const compositingPrompt = generateCompositingPrompt(compositingInfo);
      
      let composedImageUrl = null;
      let method = 'unknown';
      
      // 4. Freepik 프록시 우선 시도
      if (FREEPIK_API_KEY && attempt === 1) {
        try {
          console.log('[safeCompose] Freepik 프록시 우선 시도');
          const freepikResponse = await callFreepikNanoBanana(
            baseImageBase64, 
            overlayImageBase64, 
            compositingPrompt
          );
          
          composedImageUrl = extractImageFromFreepikResponse(freepikResponse);
          method = 'freepik-proxy';
          
        } catch (freepikError) {
          console.warn('[safeCompose] Freepik 프록시 실패, Gemini 직접 호출로 전환:', freepikError.message);
        }
      }
      
      // 5. Freepik 실패 시 또는 2번째 시도부터 Gemini 직접 호출
      if (!composedImageUrl && keyManager.keys.length > 0) {
        try {
          console.log('[safeCompose] Gemini 직접 호출 시도');
          const geminiResult = await callDirectGeminiNanoBanana(
            baseImageBase64, 
            overlayImageBase64, 
            compositingPrompt
          );
          
          composedImageUrl = extractEditedImageFromGeminiResponse(geminiResult.result);
          method = `gemini-direct-key${geminiResult.keyIndex}`;
          
        } catch (geminiError) {
          console.error('[safeCompose] Gemini 직접 호출 실패:', geminiError.message);
          
          // Rate Limit 에러면 다른 키로 재시도
          if (geminiError.message.includes('Rate Limit') && attempt < MAX_RETRIES) {
            console.log('[safeCompose] Rate Limit 감지, 다른 API 키로 재시도');
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
            continue;
          }
          
          throw geminiError;
        }
      }
      
      if (composedImageUrl) {
        console.log(`[safeCompose] ✅ 합성 성공 (${method})`);
        
        return {
          success: true,
          composedImageUrl: composedImageUrl,
          metadata: {
            originalBaseUrl: baseImageUrl,
            compositingContext: compositingInfo.compositingContext,
            prompt: compositingPrompt,
            method: method,
            model: method === 'freepik-proxy' ? 'freepik-nano-banana' : NANO_BANANA_MODEL,
            timestamp: new Date().toISOString(),
            attempt: attempt,
            apiKeyUsed: method === 'gemini-direct' ? currentKeyIndex : 'freepik'
          }
        };
      } else {
        throw new Error('모든 API 방법이 실패했습니다');
      }
      
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
      baseImageUrl,
      overlayImageData,
      compositingInfo,
      sceneNumber,
      conceptId
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

    // API 키 상태 확인 - 🔥 수정: Gemini 키가 1개라도 있으면 작동
    if (!FREEPIK_API_KEY && keyManager.keys.length === 0) {
      console.error('[nanobanana-compose] API 키가 모두 없음');
      return res.status(500).json({
        success: false,
        error: 'No API keys configured (Freepik or Gemini)'
      });
    }

    console.log('[nanobanana-compose] 요청 수신:', {
      sceneNumber,
      conceptId,
      hasBaseImage: !!baseImageUrl,
      hasOverlayData: !!overlayImageData,
      compositingContext: compositingInfo.compositingContext,
      availableFreepikKey: !!FREEPIK_API_KEY,
      availableGeminiKeys: keyManager.keys.length,
      currentKeyUsage: keyManager.getUsageStats()
    });

    // 실제 합성 실행
    const result = await safeCompose(
      baseImageUrl,
      overlayImageData,
      compositingInfo
    );

    const processingTime = Date.now() - startTime;

    console.log('[nanobanana-compose] ✅ 합성 완료:', {
      sceneNumber,
      conceptId,
      processingTime: processingTime + 'ms',
      success: result.success,
      method: result.metadata.method,
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
        availableApis: {
          freepik: !!FREEPIK_API_KEY,
          gemini: keyManager.keys.length
        },
        finalKeyStats: keyManager.getUsageStats()
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
        composedImageUrl: req.body?.baseImageUrl || null,
        reason: 'composition_failed',
        details: error.message
      }
    });
  }
}

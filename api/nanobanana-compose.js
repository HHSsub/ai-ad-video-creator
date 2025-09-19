// api/nanobanana-compose.js - Freepik 프록시된 Gemini 2.5 Flash Image 연동 + 강화된 Rate Limit 처리

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

const MAX_COMPOSITION_RETRIES = 2; // 합성 실패 시 최대 2번 재시도
const INITIAL_RETRY_DELAY = 5000; // 첫 번째 재시도: 5초
const SUBSEQUENT_RETRY_DELAY = 8000; // 두 번째 재시도: 8초
const RATE_LIMIT_BASE_DELAY = 10000; // 기본 Rate Limit 방지 딜레이: 10초

// 🔥 NEW: 향상된 키 분배 시스템 (개별 요청별 최적 키 선택)
class EnhancedApiKeyManager {
  constructor(keys) {
    this.keys = keys.filter(Boolean);
    this.usage = new Map(); // keyIndex -> { lastUsed: timestamp, errorCount: number, successCount: number }
    this.globalRequestCount = 0;
    
    console.log(`[EnhancedApiKeyManager] 초기화: ${this.keys.length}개 키 사용 가능`);
  }
  
  // 현재 상황에 가장 적합한 키 선택 (에러율 고려)
  selectBestAvailableKey() {
    if (this.keys.length === 0) return null;
    if (this.keys.length === 1) return { key: this.keys[0], index: 0 };
    
    const now = Date.now();
    let bestIndex = 0;
    let bestScore = Infinity;
    
    for (let i = 0; i < this.keys.length; i++) {
      const usage = this.usage.get(i) || { lastUsed: 0, errorCount: 0, successCount: 0 };
      
      // 점수 계산: 에러율 + 최근 사용 패널티
      const errorRate = usage.errorCount / Math.max(1, usage.errorCount + usage.successCount);
      const timeSinceLastUse = now - usage.lastUsed;
      const recentUsagePenalty = Math.max(0, RATE_LIMIT_BASE_DELAY - timeSinceLastUse) / 1000;
      
      const score = (errorRate * 1000) + recentUsagePenalty;
      
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    
    return { key: this.keys[bestIndex], index: bestIndex };
  }
  
  // 키 사용 시작 기록
  markKeyUsed(keyIndex) {
    const now = Date.now();
    if (!this.usage.has(keyIndex)) {
      this.usage.set(keyIndex, { lastUsed: now, errorCount: 0, successCount: 0 });
    } else {
      this.usage.get(keyIndex).lastUsed = now;
    }
    this.globalRequestCount++;
  }
  
  // 키 사용 성공 기록
  markKeySuccess(keyIndex) {
    if (this.usage.has(keyIndex)) {
      this.usage.get(keyIndex).successCount++;
    }
  }
  
  // 키 사용 실패 기록
  markKeyError(keyIndex) {
    if (this.usage.has(keyIndex)) {
      this.usage.get(keyIndex).errorCount++;
    }
  }
  
  // 통계 조회
  getUsageStats() {
    const stats = {};
    for (let i = 0; i < this.keys.length; i++) {
      const usage = this.usage.get(i) || { lastUsed: 0, errorCount: 0, successCount: 0 };
      const total = usage.errorCount + usage.successCount;
      stats[`key_${i}`] = {
        errorRate: total > 0 ? (usage.errorCount / total * 100).toFixed(1) + '%' : '0%',
        successCount: usage.successCount,
        errorCount: usage.errorCount,
        lastUsed: usage.lastUsed ? new Date(usage.lastUsed).toISOString() : 'never'
      };
    }
    return { keys: stats, globalRequests: this.globalRequestCount };
  }
}

// 글로벌 키 매니저 인스턴스
const keyManager = new EnhancedApiKeyManager(GEMINI_API_KEYS);

/**
 * 이미지 URL을 base64로 변환 (타임아웃 및 재시도 포함)
 */
async function imageUrlToBase64(imageUrl, maxRetries = 2) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[imageUrlToBase64] 다운로드 시도 ${attempt}/${maxRetries}: ${imageUrl.substring(0, 80)}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃
      
      const response = await fetch(imageUrl, {
        timeout: 30000,
        signal: controller.signal,
        headers: {
          'User-Agent': 'AI-Ad-Creator/2025'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`이미지 다운로드 실패: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      
      console.log(`[imageUrlToBase64] 변환 완료: ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB`);
      return base64;
      
    } catch (error) {
      lastError = error;
      console.error(`[imageUrlToBase64] 시도 ${attempt} 실패:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.log(`[imageUrlToBase64] ${delay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('이미지 다운로드 최대 재시도 초과');
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
 * 🔥 강화된 Freepik 프록시 호출 (지수 백오프 + 키 교체)
 */
async function callFreepikNanoBananaWithRetry(baseImageBase64, overlayImageBase64, compositingPrompt, maxRetries = MAX_COMPOSITION_RETRIES) {
  if (!FREEPIK_API_KEY) {
    throw new Error('Freepik API key not configured');
  }

  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[callFreepikNanoBanana] Freepik 프록시 시도 ${attempt}/${maxRetries}`);

      // Rate Limit 방지 딜레이 (시도할수록 더 길게)
      if (attempt > 1) {
        const delay = attempt === 2 ? INITIAL_RETRY_DELAY : SUBSEQUENT_RETRY_DELAY;
        console.log(`[callFreepikNanoBanana] Rate Limit 방지 딜레이: ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60초 타임아웃

      const response = await fetch(FREEPIK_NANO_BANANA_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-freepik-api-key': FREEPIK_API_KEY,
          'User-Agent': 'AI-Ad-Creator/2025'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[callFreepikNanoBanana] API 오류 ${attempt}회차:`, response.status, errorText.substring(0, 200));
        
        // 429 (Rate Limit) 또는 5xx 에러면 재시도
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
          lastError = new Error(`Freepik API 오류: ${response.status} ${errorText}`);
          continue;
        }
        
        throw new Error(`Freepik Nano Banana API 오류: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log(`[callFreepikNanoBanana] API 응답 수신 성공 (시도 ${attempt}회차)`);
      
      return result;
      
    } catch (error) {
      lastError = error;
      console.error(`[callFreepikNanoBanana] 시도 ${attempt} 실패:`, error.message);
      
      // 마지막 시도가 아니면서 재시도 가능한 오류인 경우 계속
      if (attempt < maxRetries && (
        error.message.includes('429') || 
        error.message.includes('timeout') ||
        error.message.includes('500') ||
        error.message.includes('502') ||
        error.message.includes('503') ||
        error.message.includes('504')
      )) {
        continue;
      }
      
      // 재시도 불가능하거나 마지막 시도인 경우 에러 발생
      break;
    }
  }
  
  throw lastError || new Error('Freepik Nano Banana 최대 재시도 초과');
}

/**
 * 🔥 강화된 직접 Gemini API 호출 (개선된 키 분배 + 재시도)
 */
async function callDirectGeminiNanoBananaWithRetry(baseImageBase64, overlayImageBase64, compositingPrompt, maxRetries = MAX_COMPOSITION_RETRIES) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const keyResult = keyManager.selectBestAvailableKey();
    if (!keyResult) {
      throw new Error('사용 가능한 Gemini API 키가 없습니다');
    }

    const { key: apiKey, index: keyIndex } = keyResult;
    keyManager.markKeyUsed(keyIndex);
    
    try {
      console.log(`[callDirectGeminiNanoBanana] 키 ${keyIndex} 시도 ${attempt}/${maxRetries} (통계: ${JSON.stringify(keyManager.getUsageStats().keys[`key_${keyIndex}`])})`);

      // 스마트 딜레이 (키 개수와 시도 횟수에 따라 조정)
      const baseDelay = keyManager.keys.length >= 3 ? 3000 : RATE_LIMIT_BASE_DELAY;
      const attemptDelay = attempt > 1 ? (attempt === 2 ? INITIAL_RETRY_DELAY : SUBSEQUENT_RETRY_DELAY) : baseDelay;
      
      if (attempt > 1 || keyManager.globalRequestCount > 1) {
        console.log(`[callDirectGeminiNanoBanana] Rate Limit 방지 딜레이: ${attemptDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, attemptDelay));
      }

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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90초 타임아웃

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[callDirectGeminiNanoBanana] 키 ${keyIndex} API 오류 ${attempt}회차:`, response.status, errorText.substring(0, 200));
        
        keyManager.markKeyError(keyIndex);
        
        // Rate Limit 또는 서버 오류면 재시도
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
          lastError = new Error(`Gemini API 오류 (키 ${keyIndex}): ${response.status} ${errorText}`);
          continue;
        }
        
        throw new Error(`Gemini API 오류: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log(`[callDirectGeminiNanoBanana] 키 ${keyIndex} API 응답 수신 성공 (시도 ${attempt}회차)`);
      
      keyManager.markKeySuccess(keyIndex);
      return { result, keyIndex };
      
    } catch (error) {
      lastError = error;
      keyManager.markKeyError(keyIndex);
      console.error(`[callDirectGeminiNanoBanana] 키 ${keyIndex} 시도 ${attempt} 실패:`, error.message);
      
      // Rate Limit 에러이고 재시도 가능하면 계속
      if (attempt < maxRetries && (
        error.message.includes('Rate Limit') || 
        error.message.includes('429') ||
        error.message.includes('overload') ||
        error.message.includes('timeout') ||
        error.message.includes('500') ||
        error.message.includes('502') ||
        error.message.includes('503') ||
        error.message.includes('504')
      )) {
        continue;
      }
      
      // 재시도 불가능하거나 마지막 시도면 중단
      break;
    }
  }
  
  throw lastError || new Error('Gemini 직접 호출 최대 재시도 초과');
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
 * 🔥 최종 강화된 합성 함수 (재시도 + 원본 fallback + 통계)
 */
async function safeComposeWithFallback(baseImageUrl, overlayImageData, compositingInfo) {
  const startTime = Date.now();
  let compositionAttempts = [];
  
  try {
    console.log(`[safeComposeWithFallback] 합성 시작 (최대 ${MAX_COMPOSITION_RETRIES}번 재시도)`);
    
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
    let finalKeyIndex = null;
    
    // 4. Freepik 프록시 우선 시도 (재시도 포함)
    if (FREEPIK_API_KEY) {
      try {
        console.log('[safeComposeWithFallback] Freepik 프록시 시도 (재시도 포함)');
        const freepikResponse = await callFreepikNanoBananaWithRetry(
          baseImageBase64, 
          overlayImageBase64, 
          compositingPrompt
        );
        
        composedImageUrl = extractImageFromFreepikResponse(freepikResponse);
        method = 'freepik-proxy-retry';
        
        compositionAttempts.push({ method: 'freepik', success: true, attempts: 1 });
        
      } catch (freepikError) {
        console.warn('[safeComposeWithFallback] Freepik 프록시 최종 실패, Gemini 직접 호출로 전환:', freepikError.message);
        compositionAttempts.push({ method: 'freepik', success: false, error: freepikError.message });
      }
    }
    
    // 5. Freepik 실패 시 Gemini 직접 호출 (재시도 포함)
    if (!composedImageUrl && keyManager.keys.length > 0) {
      try {
        console.log('[safeComposeWithFallback] Gemini 직접 호출 시도 (재시도 포함)');
        const geminiResult = await callDirectGeminiNanoBananaWithRetry(
          baseImageBase64, 
          overlayImageBase64, 
          compositingPrompt
        );
        
        composedImageUrl = extractEditedImageFromGeminiResponse(geminiResult.result);
        method = `gemini-direct-retry-key${geminiResult.keyIndex}`;
        finalKeyIndex = geminiResult.keyIndex;
        
        compositionAttempts.push({ method: 'gemini', success: true, keyIndex: geminiResult.keyIndex });
        
      } catch (geminiError) {
        console.error('[safeComposeWithFallback] Gemini 직접 호출 최종 실패:', geminiError.message);
        compositionAttempts.push({ method: 'gemini', success: false, error: geminiError.message });
      }
    }
    
    const processingTime = Date.now() - startTime;
    
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
          model: method.includes('freepik') ? 'freepik-nano-banana' : NANO_BANANA_MODEL,
          timestamp: new Date().toISOString(),
          processingTime: processingTime,
          keyIndex: finalKeyIndex,
          compositionAttempts: compositionAttempts,
          keyStats: keyManager.getUsageStats()
        }
      };
    } else {
      // 🔥 모든 합성 방법 실패 → 원본 이미지로 fallback
      console.warn(`[safeComposeWithFallback] ⚠️ 모든 합성 방법 실패, 원본 이미지 사용 (${processingTime}ms)`);
      
      return {
        success: true, // 원본 사용이므로 성공으로 간주
        composedImageUrl: baseImageUrl, // 원본 이미지 URL 사용
        metadata: {
          originalBaseUrl: baseImageUrl,
          compositingContext: compositingInfo.compositingContext,
          prompt: compositingPrompt,
          method: 'fallback-original',
          model: 'none',
          timestamp: new Date().toISOString(),
          processingTime: processingTime,
          compositionAttempts: compositionAttempts,
          keyStats: keyManager.getUsageStats(),
          fallbackReason: 'All composition methods failed after retries'
        }
      };
    }
    
  } catch (error) {
    console.error('[safeComposeWithFallback] 전체 프로세스 오류:', error);
    
    // 🔥 예외 상황에도 원본 이미지로 fallback
    return {
      success: true, // 원본 사용이므로 성공으로 간주
      composedImageUrl: baseImageUrl,
      metadata: {
        originalBaseUrl: baseImageUrl,
        compositingContext: compositingInfo.compositingContext,
        method: 'fallback-error',
        model: 'none',
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        compositionAttempts: compositionAttempts,
        keyStats: keyManager.getUsageStats(),
        fallbackReason: `Process error: ${error.message}`
      }
    };
  }
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

    // API 키 상태 확인 - 🔥 수정: Freepik 또는 Gemini 키 중 하나라도 있으면 작동
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

    // 🔥 강화된 합성 실행 (재시도 + fallback 포함)
    const result = await safeComposeWithFallback(
      baseImageUrl,
      overlayImageData,
      compositingInfo
    );

    const processingTime = Date.now() - startTime;

    console.log('[nanobanana-compose] ✅ 처리 완료:', {
      sceneNumber,
      conceptId,
      processingTime: processingTime + 'ms',
      success: result.success,
      method: result.metadata.method,
      hasComposedUrl: !!result.composedImageUrl,
      fallbackUsed: result.metadata.method?.includes('fallback') || false
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
        finalKeyStats: keyManager.getUsageStats(),
        retryInfo: {
          maxRetries: MAX_COMPOSITION_RETRIES,
          delaySettings: {
            baseDelay: RATE_LIMIT_BASE_DELAY,
            initialRetry: INITIAL_RETRY_DELAY,
            subsequentRetry: SUBSEQUENT_RETRY_DELAY
          }
        }
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
        reason: 'handler_error',
        details: error.message
      },
      debug: {
        keyStats: keyManager.getUsageStats(),
        timestamp: new Date().toISOString()
      }
    });
  }
}

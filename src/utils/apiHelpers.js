// src/utils/apiHelpers.js - 🔥 모델명 로깅 + 이미지 합성 모델 정확히 설정

import { apiKeyManager } from './apiKeyManager.js';
import { freepikRateLimiter } from './rateLimiter.js'; // 🔥 Rate Limiter 추가
import { GoogleGenerativeAI } from '@google/generative-ai';

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;
const MAX_DELAY = 30000; // 🔥 30초로 증가
const REQUEST_TIMEOUT = 300000; // 🔥 5분 타임아웃

/**
 * 지수 백오프를 사용한 딜레이 함수 (지터 포함)
 */
function exponentialBackoffDelay(attempt, baseDelay = BASE_DELAY) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), MAX_DELAY);
  const jitter = Math.random() * 0.1 * delay; // 10% 지터
  return Math.floor(delay + jitter);
}

/**
 * 재시도 가능한 에러인지 판단
 */
function isRetryableError(error, statusCode) {
  const retryableStatus = [429, 500, 502, 503, 504];
  const retryableMessages = [
    'rate limit', 'quota', 'overload', 'timeout',
    'network', 'fetch', 'econnreset', 'ecancelled',
    'too many requests', 'exceeded your current quota',
    'socket hang up', 'connect timeout'
  ];

  if (retryableStatus.includes(statusCode)) return true;

  const errorMessage = (error?.message || '').toLowerCase();
  return retryableMessages.some(msg => errorMessage.includes(msg));
}

/**
 * 🔥 환경변수에서 텍스트용 Gemini 모델 가져오기 (Pro 우선)
 */
function getTextGeminiModel() {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
  console.log(`[getTextGeminiModel] 텍스트용 모델 선택: ${model}`);
  return model;
}

function getFallbackTextModel() {
  const model = process.env.FALLBACK_GEMINI_MODEL || 'gemini-2.5-flash';
  console.log(`[getFallbackTextModel] 폴백 텍스트 모델: ${model}`);
  return model;
}

/**
 * 🔥 이미지 합성 전용 모델 (나노바나나용) - 정확한 모델명
 */
function getImageCompositionModel() {
  // 🔥 정확한 Gemini 2.5 Flash Image Preview 모델명
  const model = 'gemini-2.5-flash-image-preview';
  console.log(`[getImageCompositionModel] 이미지 합성 모델: ${model}`);
  return model;
}

/**
 * 🔥 타임아웃 기능이 있는 Promise
 */
function withTimeout(promise, timeoutMs = REQUEST_TIMEOUT) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}

/**
 * 🔥 안전한 Gemini API 호출 (타임아웃 및 응답 크기 최적화 + 모델명 로깅)
 */
export async function safeCallGemini(prompt, options = {}) {
  const {
    maxRetries = MAX_RETRIES,
    label = 'gemini-call',
    isImageComposition = false,
    timeout = REQUEST_TIMEOUT,
    model = null // 🔥 외부에서 모델명 직접 전달 가능
  } = options;

  let lastError;
  let totalAttempts = 0;
  const startTime = Date.now();

  // 🔥 모든 키가 블록되었는지 확인
  if (apiKeyManager.areAllKeysBlocked('gemini')) {
    throw new Error('모든 Gemini API 키가 일시적으로 사용 불가능합니다. 잠시 후 다시 시도해주세요.');
  }

  // 🔥 단계별 모델 선택 (외부 지정 모델 우선)
  let selectedModel, fallbackModels;

  if (model) {
    // 외부에서 모델명을 직접 지정한 경우 (이미지 합성 등)
    selectedModel = model;
    fallbackModels = [];
    console.log(`[${label}] 🎯 지정된 모델 사용: ${selectedModel}`);
  } else if (isImageComposition) {
    selectedModel = getImageCompositionModel();
    fallbackModels = ['gemini-2.5-flash-image-preview'];
    console.log(`[${label}] 🎨 이미지 합성 모드: ${selectedModel}`);
  } else {
    selectedModel = getTextGeminiModel();
    fallbackModels = [getFallbackTextModel(), 'gemini-2.5-flash'];
    console.log(`[${label}] 📝 텍스트 생성 모드: ${selectedModel}`);
  }

  const allModels = [selectedModel, ...fallbackModels.filter(m => m !== selectedModel)];
  console.log(`[${label}] 🚀 Gemini API 호출 시작`);
  console.log(`[${label}] 📝 프롬프트 타입: ${Array.isArray(prompt) ? '배열' : '문자열'}`);
  console.log(`[${label}] 📝 프롬프트 길이: ${Array.isArray(prompt) ? JSON.stringify(prompt).length : prompt.length} chars`);
  console.log(`[${label}] ⏰ 시작 시간:`, new Date().toISOString());

  // 🔥 키 풀 상태 로깅
  console.log(`[${label}] 🔑 API 키 풀 상태:`);
  if (typeof apiKeyManager.logStatus === 'function') {
    apiKeyManager.logStatus();
  }

  for (const currentModel of allModels) {
    console.log(`[${label}] 🎯 모델 시도: ${currentModel}`);

    for (let modelAttempt = 0; modelAttempt < maxRetries; modelAttempt++) {
      totalAttempts++;
      let selectedKeyIndex = null;
      let requestStartTime = Date.now(); // 중복 선언 방지, 각 시도마다 let으로 할당

      try {
        // 🔥 최적의 API 키 선택
        const { key: apiKey, index: keyIndex } = apiKeyManager.selectBestGeminiKey();
        selectedKeyIndex = keyIndex;

        console.log(`[${label}] 🔑 시도 ${totalAttempts} (모델: ${currentModel}, 키: ${keyIndex})`);

        // 🔥 동시 요청 부하 분산을 위한 스마트 딜레이
        const keyBasedDelay = (keyIndex * 200) + Math.random() * 800 + 300;
        await new Promise(resolve => setTimeout(resolve, keyBasedDelay));

        // Gemini API 클라이언트 생성 및 호출 (타임아웃 적용)
        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({ model: currentModel });

        console.log(`[${label}] 📡 API 호출 시작 (모델: ${currentModel}, 키: ${keyIndex})`);

        // 🔥 이미지 입력 처리 (Nanobanana 등에서 전달됨)
        let requestContent = prompt;
        if (options.images && Array.isArray(options.images) && options.images.length > 0) {
          const imageParts = [];

          for (const img of options.images) {
            if (img.data) {
              // Base64 데이터가 있는 경우
              imageParts.push({
                inlineData: {
                  data: img.data,
                  mimeType: img.mimeType || 'image/jpeg'
                }
              });
            } else if (img.url) {
              // URL이 있는 경우 -> 다운로드 후 Base64 변환
              try {
                console.log(`[${label}] 📥 이미지 다운로드: ${img.url.substring(0, 50)}...`);
                const imgRes = await fetch(img.url);
                const arrayBuffer = await imgRes.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

                imageParts.push({
                  inlineData: {
                    data: base64,
                    mimeType: contentType
                  }
                });
              } catch (err) {
                console.warn(`[${label}] ⚠️ 이미지 다운로드 실패 (무시됨): ${img.url}`, err);
              }
            }
          }

          if (imageParts.length > 0) {
            // 프롬프트가 문자열이면 배열로 변환하여 이미지와 결합
            if (typeof prompt === 'string') {
              requestContent = [prompt, ...imageParts];
            } else if (Array.isArray(prompt)) {
              requestContent = [...prompt, ...imageParts];
            }
            console.log(`[${label}] 🖼️ 멀티모달 요청 준비 완료 (이미지 ${imageParts.length}장)`);
          }
        }

        // 🔥 타임아웃과 함께 API 호출
        const apiCall = Array.isArray(requestContent)
          ? geminiModel.generateContent({ contents: [{ role: 'user', parts: requestContent.map(p => typeof p === 'string' ? { text: p } : p) }] })
          // Note: generateContent accepts array of parts directly if it's just parts, but 'contents' structure is safer for chat-like. 
          // SDK overload: generateContent(string | Array<string | Part>)
          // If requestContent is array of mixed string/Parts, pass it directly.
          : geminiModel.generateContent(requestContent);

        // Correct SDK usage correction:
        // generateContent([ "text", { inlineData: ... } ]) works.
        const finalApiCall = geminiModel.generateContent(requestContent);

        const result = await withTimeout(finalApiCall, timeout);

        if (!result?.response) {
          throw new Error('Gemini API에서 응답을 받지 못했습니다.');
        }

        // 응답 처리 (이미지 포함 가능)
        const responseText = result.response.text();
        const processingTime = Date.now() - requestStartTime;

        // 성공 로깅 (모델명 포함)
        console.log(`[${label}] ✅ 성공 (모델: ${currentModel}, 키: ${keyIndex}, 시간: ${processingTime}ms, 응답: ${responseText?.length || 0}자)`);
        console.log(`[${label}] ⏰ API 응답 시간: ${(processingTime / 1000).toFixed(2)}초`);
        console.log(`[${label}] 📊 응답 크기: ${(responseText?.length || 0)} chars`);

        // 키 사용 성공 기록
        if (selectedKeyIndex !== null) {
          apiKeyManager.markKeySuccess('gemini', selectedKeyIndex);
        }

        // 응답에 메타데이터 포함
        const responseWithMeta = {
          text: responseText,
          model: currentModel,
          keyIndex: selectedKeyIndex,
          processingTime,
          totalAttempts,
          success: true
        };

        // 이미지 생성 응답인 경우 candidates 정보도 포함
        if (result.response.candidates && result.response.candidates.length > 0) {
          responseWithMeta.candidates = result.response.candidates;

          // 이미지 데이터 추출 시도
          const candidate = result.response.candidates[0];
          if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.inlineData && part.inlineData.data) {
                console.log(`[${label}] 🖼️ 이미지 응답 감지 (${Math.round(part.inlineData.data.length / 1024)}KB)`);
                responseWithMeta.imageData = part.inlineData.data;
                responseWithMeta.mimeType = part.inlineData.mimeType;
                break;
              }
            }
          }
        }

        return responseWithMeta;

      } catch (error) {
        const processingTime = Date.now() - requestStartTime;
        lastError = error;

        // 키 에러 기록
        if (selectedKeyIndex !== null) {
          apiKeyManager.markKeyError('gemini', selectedKeyIndex, error.message);
        }

        console.error(`[${label}] 시도 ${totalAttempts} 실패 (모델: ${currentModel}, 키: ${selectedKeyIndex}, ${processingTime}ms):`, error.message);
        console.error(`[${label}] ❌ 에러 상세:`, {
          message: error.message,
          status: error.status,
          code: error.code,
          type: error.constructor.name
        });


        if (isRetryableError(error) && modelAttempt < maxRetries - 1) {
          let delay = exponentialBackoffDelay(modelAttempt);

          // 🔥 에러 구분: Quota Exceeded vs Rate Limit
          const isQuotaError = error.message.includes('quota') ||
            error.message.includes('check your plan') ||
            error.message.includes('billing');

          const isRateLimit = error.message.includes('429') ||
            error.message.includes('Rate Limit') ||
            error.message.includes('Too Many Requests');

          // 1. Quota Exceeded (일일 할당량 초과): 대기 없이 즉시 다음 키로 전환
          if (isQuotaError) {
            console.log(`[${label}] 🛑 Quota Exceeded 감지: 대기 없이 즉시 다음 키 시도 (남은 시도: ${maxRetries - modelAttempt - 1}회)`);
            continue; // delay 없이 즉시 다음 루프(다음 키 선택)로 진행
          }

          // 2. Rate Limit (순간적인 RPM 초과): 잠시 대기 후 재시도 (사용자 요청: 재시도)
          if (isRateLimit) {
            // Retry-After 파싱
            const retryAfterMatch = error.message.match(/Please retry in ([0-9.]+)s/);
            if (retryAfterMatch && retryAfterMatch[1]) {
              const waitSeconds = parseFloat(retryAfterMatch[1]);
              delay = Math.ceil(waitSeconds * 1000) + 2000; // 2초 여유
              console.log(`[${label}] ⚠️ Rate Limit(RPM) 감지: ${waitSeconds}초 대기 요청됨 -> ${delay}ms 후 재시도`);
            } else {
              console.log(`[${label}] ⚠️ Rate Limit(RPM) 감지: ${delay}ms 후 재시도`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          // 일반적인 재시도 (네트워크 에러 등)
          console.log(`[${label}] ⏳ ${delay}ms (${(delay / 1000).toFixed(1)}초) 후 재시도... (모델: ${currentModel}, 남은 시도: ${maxRetries - modelAttempt - 1}회)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        break;
      }
    }
  }

  const totalTime = Date.now() - startTime;
  console.error(`[${label}] ❌ 모든 모델 시도 실패 (총 시간: ${totalTime}ms, 시도: ${totalAttempts}회)`);
  console.error(`[${label}] 💥 최종 에러:`, {
    message: lastError?.message,
    totalTime: `${(totalTime / 1000).toFixed(2)}초`,
    attempts: totalAttempts,
    models: allModels.join(', ')
  });
  throw lastError || new Error(`${label} 모든 재시도 실패`);
}

/**
 * 🔥 안전한 Freepik API 호출 (Rate Limiter 통합 - 사전 예방)
 */
export async function safeCallFreepik(url, options = {}, conceptId = 0) {
  const {
    maxRetries = MAX_RETRIES,
    label = 'freepik-call',
    timeout = REQUEST_TIMEOUT
  } = options;

  let lastError;
  const usedKeys = new Set(); // 🔥 이미 시도한 키 추적
  const totalKeys = apiKeyManager.getUsageStats().freepik.totalKeys;

  // 🔥 모든 키를 시도할 때까지 반복 (최대 totalKeys * maxRetries)
  const maxTotalAttempts = Math.min(totalKeys * maxRetries, 10); // 최대 10회

  for (let attempt = 0; attempt < maxTotalAttempts; attempt++) {
    let keyIndex = null;
    let requestStartTime = Date.now();

    try {
      // 🔥🔥🔥 Rate Limiter 대기 (429 에러 사전 방지)
      await freepikRateLimiter.waitForSlot();
      console.log(`[${label}] ✅ Rate Limit 슬롯 확보 완료`);

      // 🔥 사용 가능한 키 선택 (이미 사용한 키 제외)
      keyIndex = null;

      // 사용하지 않은 키 찾기
      for (let i = 0; i < totalKeys; i++) {
        if (!usedKeys.has(i)) {
          keyIndex = i;
          break;
        }
      }

      // 모든 키를 사용했으면 종료
      if (keyIndex === null) {
        console.log(`[${label}] ❌ 모든 Freepik 키 사용 완료 (${usedKeys.size}/${totalKeys})`);
        break;
      }

      usedKeys.add(keyIndex);
      const { key: apiKey } = apiKeyManager.selectFreepikKeyForConcept(conceptId);
      console.log(`[${label}] 시도 ${attempt + 1}/${maxTotalAttempts} (컨셉: ${conceptId}, 키: ${keyIndex}, 사용된 키: ${usedKeys.size}/${totalKeys})`);

      const response = await withTimeout(
        fetch(url, {
          ...options,
          headers: {
            'X-Freepik-API-Key': apiKey,
            'Content-Type': 'application/json',
            ...options.headers
          }
        }),
        timeout
      );

      const processingTime = Date.now() - requestStartTime;

      if (!response.ok) {
        const responseBody = await response.text();
        const error = new Error(`HTTP ${response.status}: ${response.statusText} - ${responseBody}`);
        error.status = response.status;
        console.error(`[${label}] ❌ HTTP Error Body:`, responseBody);

        apiKeyManager.markKeyError('freepik', keyIndex, error.message);

        // 🔥 429 에러면 이 키를 사용 완료로 표시하고 즉시 다른 키 시도
        if (response.status === 429) {
          usedKeys.add(keyIndex);
          console.log(`[${label}] 🚫 키 ${keyIndex} Rate Limit → 다른 키로 즉시 전환 (${usedKeys.size}/${totalKeys} 사용됨)`);

          // 즉시 다음 시도 (딜레이 없음)
          if (attempt < maxTotalAttempts - 1 && usedKeys.size < totalKeys) {
            continue;
          }
        }

        // 기타 재시도 가능한 에러
        if (isRetryableError(error, response.status) && attempt < maxTotalAttempts - 1) {
          const delay = exponentialBackoffDelay(attempt, BASE_DELAY * (conceptId + 1));
          console.log(`[${label}] ${delay}ms 후 재시도... (키: ${keyIndex})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }

      const data = await response.json();
      apiKeyManager.markKeySuccess('freepik', keyIndex);

      if (!options.silent) {
        console.log(`[${label}] ✅ 성공 (컨셉: ${conceptId}, 키: ${keyIndex}, 시간: ${processingTime}ms)`);
      }

      return data;

    } catch (error) {
      lastError = error;
      if (keyIndex !== null) {
        apiKeyManager.markKeyError('freepik', keyIndex, error.message);
      }
      console.error(`[${label}] 시도 ${attempt + 1} 실패 (컨셉: ${conceptId}):`, error.message);

      // 🔥 429 에러가 아닌 경우에만 일반 재시도 로직
      if (error.status !== 429 && attempt < maxTotalAttempts - 1 && isRetryableError(error, error.status)) {
        const delay = exponentialBackoffDelay(attempt, BASE_DELAY * (conceptId + 1));
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // 429 에러면 이미 usedKeys에 추가되었으므로 다음 키로 즉시 진행
      if (error.status === 429 && usedKeys.size < totalKeys) {
        continue;
      }

      break;
    }
  }

  throw lastError || new Error(`${label} 최대 재시도 초과 (컨셉: ${conceptId}, 사용된 키: ${usedKeys.size}/${totalKeys})`);
}

/**
 * API 키 상태 확인 함수
 */
export function getApiKeyStatus() {
  if (typeof apiKeyManager.getUsageStats === 'function') {
    return apiKeyManager.getUsageStats();
  }
  return {
    gemini: { totalKeys: 0, availableKeys: 0 },
    freepik: { totalKeys: 0, availableKeys: 0 },
    global: { totalRequests: 0 }
  };
}

/**
 * 특정 서비스의 사용 가능한 키 개수 확인
 */
export function getAvailableKeyCount(service) {
  const stats = getApiKeyStatus();
  return service === 'gemini' ?
    stats?.gemini?.availableKeys || 0 :
    stats?.freepik?.availableKeys || 0;
}

/**
 * 디버깅용: API 키 풀 상태 로깅
 */
export function logApiKeyStatus() {
  if (typeof apiKeyManager.logStatus === 'function') {
    apiKeyManager.logStatus();
  } else {
    const stats = getApiKeyStatus();
    console.log('=== 🔑 API Key Pool Status ===');
    console.log(`Gemini Keys: ${stats?.gemini?.availableKeys || 0}/${stats?.gemini?.totalKeys || 0} 사용가능`);
    console.log(`Freepik Keys: ${stats?.freepik?.availableKeys || 0}/${stats?.freepik?.totalKeys || 0} 사용가능`);
    console.log(`Total Requests: ${stats?.global?.totalRequests || 0}`);
    console.log('==============================');
  }
}

export default {
  safeCallGemini,
  safeCallFreepik,
  getApiKeyStatus,
  getAvailableKeyCount,
  logApiKeyStatus
};

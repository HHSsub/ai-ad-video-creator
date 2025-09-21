// src/utils/apiHelpers.js
// 🔥 제대로 작동하는 API 키 풀 활용 헬퍼

import { apiKeyManager } from './apiKeyManager.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;
const MAX_DELAY = 10000;

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
    'too many requests', 'exceeded your current quota'
  ];
  
  if (retryableStatus.includes(statusCode)) return true;
  
  const errorMessage = (error?.message || '').toLowerCase();
  return retryableMessages.some(msg => errorMessage.includes(msg));
}

/**
 * 🔥 안전한 Gemini API 호출 (개선된 키 풀 활용)
 */
export async function safeCallGemini(prompt, options = {}) {
  const {
    model = 'gemini-2.5-flash-image-preview', // 🔥 나노바나나 기본 모델
    maxRetries = MAX_RETRIES,
    label = 'gemini-call',
    fallbackModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
  } = options;

  let lastError;
  let totalAttempts = 0;
  const allModels = [model, ...fallbackModels.filter(m => m !== model)];

  // 🔥 모든 키가 블록되었는지 확인
  if (apiKeyManager.areAllKeysBlocked('gemini')) {
    throw new Error('모든 Gemini API 키가 일시적으로 사용 불가능합니다. 30분 후 다시 시도해주세요.');
  }

  // 🔥 키 풀 상태 로깅
  if (typeof apiKeyManager.logStatus === 'function') {
    apiKeyManager.logStatus();
  } else if (typeof apiKeyManager.logApiKeyStatus === 'function') {
    apiKeyManager.logApiKeyStatus();
  }

  for (const currentModel of allModels) {
    console.log(`[safeCallGemini] 🎯 모델 시도: ${currentModel}`);
    
    for (let modelAttempt = 0; modelAttempt < maxRetries; modelAttempt++) {
      totalAttempts++;
      let selectedKeyIndex = null;
      
      try {
        // 🔥 최적의 API 키 선택
        const { key: apiKey, index: keyIndex } = apiKeyManager.selectBestGeminiKey();
        selectedKeyIndex = keyIndex;
        
        console.log(`[${label}] 🔑 시도 ${totalAttempts} (모델: ${currentModel}, 키: ${keyIndex})`);
        
        const startTime = Date.now();
        
        // 🔥 Gemini API 호출
        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({ model: currentModel });
        
        let result;
        // 🔥 입력 타입에 따른 처리 (텍스트/이미지)
        result = await geminiModel.generateContent(prompt);
        
        const response = result.response;
        let text = '';

        // Gemini API 응답 처리 (텍스트/이미지 대응)
        if (response.candidates && response.candidates[0]) {
          const candidate = response.candidates[0];
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                text += part.text;
              } else if (part.inlineData) {
                // 🔥 이미지 데이터 처리 (나노바나나)
                const mimeType = part.inlineData.mimeType || 'image/jpeg';
                const data = part.inlineData.data;
                text += `data:${mimeType};base64,${data}`;
              }
            }
          }
        } else if (typeof response.text === 'function') {
          text = response.text();
        }

        if (!text || text.trim().length === 0) {
          throw new Error('Empty response from Gemini API');
        }
        
        const processingTime = Date.now() - startTime;
        
        // 🔥 성공 기록
        apiKeyManager.markKeySuccess('gemini', selectedKeyIndex);
        
        console.log(`[${label}] ✅ 성공 (모델: ${currentModel}, 키: ${selectedKeyIndex}, 시간: ${processingTime}ms, 응답길이: ${text.length})`);
        
        return {
          text,
          model: currentModel,
          keyIndex: selectedKeyIndex,
          processingTime,
          totalAttempts
        };
        
      } catch (error) {
        lastError = error;
        const errorMessage = error?.message || '';
        const statusCode = error?.status;
        // API 키가 선택되었다면 에러 기록
        if (selectedKeyIndex !== null) {
          apiKeyManager.markKeyError('gemini', selectedKeyIndex, errorMessage);
        }
        console.error(`[${label}] 시도 ${totalAttempts} 실패 (모델: ${currentModel}):`, errorMessage);
        // 재시도 불가능한 에러면 즉시 중단
        if (!isRetryableError(error, statusCode)) {
          console.error(`[${label}] 재시도 불가능한 에러: ${errorMessage}`);
          break;
        }
        // 마지막 시도가 아니면 딜레이 후 재시도
        if (modelAttempt < maxRetries - 1) {
          const delay = exponentialBackoffDelay(modelAttempt);
          console.log(`[${label}] ${delay}ms 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    // 현재 모델 실패시, 다음 모델로 전환
    if (allModels.indexOf(currentModel) < allModels.length - 1) {
      console.warn(`[${label}] 모델 ${currentModel} 실패, 다음 모델로 전환`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  // 모든 모델과 재시도 실패
  const errorMessage = `Gemini API 호출 실패 (${totalAttempts}회 시도, 모든 모델 실패): ${lastError?.message || 'Unknown error'}`;
  console.error(`[${label}] ❌ ${errorMessage}`);
  throw new Error(errorMessage);
}

/**
 * 🔥 안전한 Freepik API 호출 (키 풀 활용 + 재시도)
 */
export async function safeCallFreepik(url, options = {}, conceptId = 0, label = 'freepik-call') {
  const maxRetries = options.maxRetries || MAX_RETRIES;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let keyIndex = null;
    try {
      // 컨셉별 API 키 선택
      const { key: apiKey, index } = apiKeyManager.selectFreepikKeyForConcept(conceptId);
      keyIndex = index;
      console.log(`[${label}] 시도 ${attempt + 1}/${maxRetries} (컨셉: ${conceptId}, 키: ${keyIndex})`);
      const requestOptions = {
        ...options,
        headers: {
          ...options.headers,
          'x-freepik-api-key': apiKey,
          'User-Agent': 'AI-Ad-Creator/2025'
        }
      };
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const startTime = Date.now();
      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const processingTime = Date.now() - startTime;
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const error = new Error(`HTTP ${response.status}: ${errorText}`);
        error.status = response.status;
        apiKeyManager.markKeyError('freepik', keyIndex, error.message);
        if (isRetryableError(error, response.status) && attempt < maxRetries - 1) {
          const delay = exponentialBackoffDelay(attempt);
          console.log(`[${label}] ${delay}ms 후 재시도... (키: ${keyIndex})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
      const data = await response.json();
      apiKeyManager.markKeySuccess('freepik', keyIndex);
      console.log(`[${label}] ✅ 성공 (키: ${keyIndex}, 시간: ${processingTime}ms)`);
      return data;
    } catch (error) {
      lastError = error;
      if (keyIndex !== null) {
        apiKeyManager.markKeyError('freepik', keyIndex, error.message);
      }
      console.error(`[${label}] 시도 ${attempt + 1} 실패:`, error.message);
      if (attempt < maxRetries - 1 && isRetryableError(error, error.status)) {
        const delay = exponentialBackoffDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      break;
    }
  }
  throw lastError || new Error(`${label} 최대 재시도 초과`);
}

/**
 * API 키 상태 확인 함수
 */
export function getApiKeyStatus() {
  if (typeof apiKeyManager.getUsageStats === 'function') {
    return apiKeyManager.getUsageStats();
  } else if (typeof apiKeyManager.getApiKeyStatus === 'function') {
    return apiKeyManager.getApiKeyStatus();
  }
  return null;
}

/**
 * 특정 서비스의 사용 가능한 키 개수 확인
 */
export function getAvailableKeyCount(service) {
  const stats = getApiKeyStatus();
  return service === 'gemini' ? 
    stats?.gemini?.availableKeys : 
    stats?.freepik?.availableKeys;
}

/**
 * 디버깅용: API 키 풀 상태 로깅
 */
export function logApiKeyStatus() {
  if (typeof apiKeyManager.logStatus === 'function') {
    apiKeyManager.logStatus();
  } else if (typeof apiKeyManager.logApiKeyStatus === 'function') {
    apiKeyManager.logApiKeyStatus();
  } else {
    const stats = getApiKeyStatus();
    console.log('=== API Key Pool Status ===');
    console.log('Gemini Keys:', stats?.gemini);
    console.log('Freepik Keys:', stats?.freepik);
    console.log('Global Stats:', stats?.global);
    console.log('===========================');
  }
}

export default {
  safeCallGemini,
  safeCallFreepik,
  getApiKeyStatus,
  getAvailableKeyCount,
  logApiKeyStatus
};

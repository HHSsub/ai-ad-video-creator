// src/utils/apiHelpers.js
// API 키 풀을 활용한 안전한 API 호출 헬퍼 함수들

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
    'network', 'fetch', 'econnreset', 'ecancelled'
  ];
  
  if (retryableStatus.includes(statusCode)) return true;
  
  const errorMessage = (error?.message || '').toLowerCase();
  return retryableMessages.some(msg => errorMessage.includes(msg));
}

/**
 * 안전한 Gemini API 호출 (키 풀 활용 + 재시도)
 */
export async function safeCallGemini(prompt, options = {}) {
  const {
    model = 'gemini-2.5-flash',
    maxRetries = MAX_RETRIES,
    label = 'gemini-call',
    fallbackModels = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash']
  } = options;

  let lastError;
  let totalAttempts = 0;
  const allModels = [model, ...fallbackModels.filter(m => m !== model)];

  // 모든 키가 블록되었는지 확인
  if (apiKeyManager.areAllKeysBlocked('gemini')) {
    throw new Error('모든 Gemini API 키가 일시적으로 사용 불가능합니다. 잠시 후 다시 시도해주세요.');
  }

  for (const currentModel of allModels) {
    console.log(`[safeCallGemini] 모델 시도: ${currentModel}`);
    
    for (let modelAttempt = 0; modelAttempt < maxRetries; modelAttempt++) {
      totalAttempts++;
      
      try {
        // 최적의 API 키 선택
        const { key: apiKey, index: keyIndex } = apiKeyManager.selectBestGeminiKey();
        
        console.log(`[${label}] 시도 ${totalAttempts} (모델: ${currentModel}, 키: ${keyIndex})`);
        
        const startTime = Date.now();
        
        // Gemini API 호출
        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({ model: currentModel });
        
        const result = await geminiModel.generateContent(prompt);
        const text = result.response.text();
        
        const processingTime = Date.now() - startTime;
        
        // 성공 기록
        apiKeyManager.markKeySuccess('gemini', keyIndex);
        
        console.log(`[${label}] ✅ 성공 (모델: ${currentModel}, 키: ${keyIndex}, 시간: ${processingTime}ms, 길이: ${text.length})`);
        
        return {
          text,
          model: currentModel,
          keyIndex,
          processingTime,
          totalAttempts
        };
        
      } catch (error) {
        lastError = error;
        const errorMessage = error?.message || '';
        const statusCode = error?.status;
        
        // API 키가 선택되었다면 에러 기록
        try {
          const { index: keyIndex } = apiKeyManager.selectBestGeminiKey();
          apiKeyManager.markKeyError('gemini', keyIndex, errorMessage);
        } catch (e) {
          // 키 선택 자체가 실패한 경우 무시
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
    
    // 현재 모델로는 실패했지만, 다른 모델이 있다면 즉시 시도
    if (allModels.indexOf(currentModel) < allModels.length - 1) {
      console.warn(`[${label}] 모델 ${currentModel} 실패, 다음 모델로 전환`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 모델 전환 딜레이
    }
  }

  // 모든 모델과 재시도 실패
  const errorMessage = `Gemini API 호출 실패 (${totalAttempts}회 시도, 모든 모델 실패): ${lastError?.message || 'Unknown error'}`;
  console.error(`[${label}] ❌ ${errorMessage}`);
  throw new Error(errorMessage);
}

/**
 * 안전한 Freepik API 호출 (키 풀 활용 + 재시도)
 */
export async function safeCallFreepik(url, options = {}, conceptId = 0, label = 'freepik-call') {
  const maxRetries = options.maxRetries || MAX_RETRIES;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 컨셉별 API 키 선택
      const { key: apiKey, index: keyIndex } = apiKeyManager.selectFreepikKeyForConcept(conceptId);
      
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
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60초 타임아웃
      
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
        
        // 에러 기록
        apiKeyManager.markKeyError('freepik', keyIndex, error.message);
        
        // 재시도 가능한 에러인지 확인
        if (isRetryableError(error, response.status) && attempt < maxRetries - 1) {
          const delay = exponentialBackoffDelay(attempt);
          console.log(`[${label}] ${delay}ms 후 재시도... (키: ${keyIndex})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
      
      const data = await response.json();
      
      // 성공 기록
      apiKeyManager.markKeySuccess('freepik', keyIndex);
      
      console.log(`[${label}] ✅ 성공 (키: ${keyIndex}, 시간: ${processingTime}ms)`);
      
      return data;
      
    } catch (error) {
      lastError = error;
      console.error(`[${label}] 시도 ${attempt + 1} 실패:`, error.message);
      
      // 마지막 시도가 아니고 재시도 가능한 에러면 계속
      if (attempt < maxRetries - 1 && isRetryableError(error, error.status)) {
        const delay = exponentialBackoffDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // 재시도 불가능하거나 마지막 시도면 중단
      break;
    }
  }
  
  throw lastError || new Error(`${label} 최대 재시도 초과`);
}

/**
 * API 키 상태 확인 함수
 */
export function getApiKeyStatus() {
  return apiKeyManager.getUsageStats();
}

/**
 * 특정 서비스의 사용 가능한 키 개수 확인
 */
export function getAvailableKeyCount(service) {
  const stats = apiKeyManager.getUsageStats();
  return service === 'gemini' ? 
    stats.gemini.availableKeys : 
    stats.freepik.availableKeys;
}

/**
 * 디버깅용: API 키 풀 상태 로깅
 */
export function logApiKeyStatus() {
  const stats = apiKeyManager.getUsageStats();
  console.log('=== API Key Pool Status ===');
  console.log('Gemini Keys:', stats.gemini);
  console.log('Freepik Keys:', stats.freepik);
  console.log('Global Stats:', stats.global);
  console.log('===========================');
}

export default {
  safeCallGemini,
  safeCallFreepik,
  getApiKeyStatus,
  getAvailableKeyCount,
  logApiKeyStatus
};

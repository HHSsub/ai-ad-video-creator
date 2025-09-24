// src/utils/apiHelpers.js - 단계별 명확한 모델 선택 + 동시 사용자 대응 최적화

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
 * 🔥 환경변수에서 텍스트용 Gemini 모델 가져오기 (Pro 우선)
 */
function getTextGeminiModel() {
  return process.env.GEMINI_MODEL || 
         process.env.VITE_GEMINI_MODEL || 
         process.env.REACT_APP_GEMINI_MODEL || 
         'gemini-2.5-pro'; // 🔥 텍스트 작업용 기본값
}

function getFallbackTextModel() {
  return process.env.FALLBACK_GEMINI_MODEL || 
         process.env.VITE_FALLBACK_GEMINI_MODEL || 
         process.env.REACT_APP_FALLBACK_GEMINI_MODEL || 
         'gemini-2.5-flash';
}

/**
 * 🔥 이미지 합성 전용 모델 (나노바나나용)
 */
function getImageCompositionModel() {
  return 'gemini-2.0-flash-exp'; // 🔥 이미지 합성 전용 모델 고정
}

/**
 * 🔥 안전한 Gemini API 호출 (단계별 명확한 모델 선택)
 * 
 * @param {string|Array} prompt - 프롬프트 (문자열 또는 멀티모달 배열)
 * @param {Object} options - 옵션
 * @param {string} options.label - 로그용 라벨
 * @param {number} options.maxRetries - 최대 재시도 횟수
 * @param {boolean} options.isImageComposition - 이미지 합성 작업 여부 (나노바나나용)
 */
export async function safeCallGemini(prompt, options = {}) {
  const {
    maxRetries = MAX_RETRIES,
    label = 'gemini-call',
    isImageComposition = false // 🔥 이미지 합성 작업 플래그
  } = options;

  let lastError;
  let totalAttempts = 0;
  const startTime = Date.now();

  // 🔥 모든 키가 블록되었는지 확인
  if (apiKeyManager.areAllKeysBlocked('gemini')) {
    throw new Error('모든 Gemini API 키가 일시적으로 사용 불가능합니다. 잠시 후 다시 시도해주세요.');
  }

  // 🔥 단계별 모델 선택
  let selectedModel, fallbackModels;
  
  if (isImageComposition) {
    // 나노바나나 이미지 합성: 전용 모델 사용
    selectedModel = getImageCompositionModel();
    fallbackModels = ['gemini-2.0-flash-exp']; // 동일 모델로 재시도
    console.log(`[${label}] 🎨 이미지 합성 모드: ${selectedModel}`);
  } else {
    // 스토리보드 생성 등 텍스트 작업: 환경변수 모델 사용
    selectedModel = getTextGeminiModel();
    fallbackModels = [getFallbackTextModel(), 'gemini-2.5-flash'];
    console.log(`[${label}] 📝 텍스트 생성 모드: ${selectedModel}`);
  }
  
  const allModels = [selectedModel, ...fallbackModels.filter(m => m !== selectedModel)];

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
      
      try {
        // 🔥 최적의 API 키 선택 (동시 사용자 대응)
        const { key: apiKey, index: keyIndex } = apiKeyManager.selectBestGeminiKey();
        selectedKeyIndex = keyIndex;
        
        console.log(`[${label}] 🔑 시도 ${totalAttempts} (모델: ${currentModel}, 키: ${keyIndex})`);
        
        // 🔥 동시 요청 부하 분산을 위한 스마트 딜레이
        // 키 인덱스별로 다른 지연시간 + 랜덤 지터로 충돌 방지
        const keyBasedDelay = (keyIndex * 200) + Math.random() * 800 + 300; // 300-1100ms + 키별 오프셋
        await new Promise(resolve => setTimeout(resolve, keyBasedDelay));
        
        const requestStartTime = Date.now();
        
        // 🔥 Gemini API 클라이언트 생성 및 호출
        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({ model: currentModel });
        
        let result;
        if (Array.isArray(prompt)) {
          // 🔥 멀티모달 요청 (이미지 합성용)
          console.log(`[${label}] 🖼️ 멀티모달 요청 실행 (이미지 ${prompt.filter(p => p.inlineData).length}개)`);
          result = await geminiModel.generateContent(prompt);
        } else {
          // 🔥 텍스트 요청 (스토리보드 생성용)
          console.log(`[${label}] 📝 텍스트 요청 실행 (길이: ${prompt.length}자)`);
          result = await geminiModel.generateContent(prompt);
        }
        
        const response = result.response;
        let text = '';

        // 🔥 Gemini API 응답 처리 (멀티모달 대응)
        if (response.candidates && response.candidates[0]) {
          const candidate = response.candidates[0];
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                text += part.text;
              } else if (part.inlineData) {
                // 🔥 이미지 데이터 처리 (나노바나나 합성 결과)
                const mimeType = part.inlineData.mimeType || 'image/jpeg';
                const data = part.inlineData.data;
                text += `data:${mimeType};base64,${data}`;
                console.log(`[${label}] 🖼️ 이미지 데이터 수신: ${mimeType}, 크기: ${data.length} bytes`);
              }
            }
          }
        } else if (typeof response.text === 'function') {
          text = response.text();
        }

        if (!text || text.trim().length === 0) {
          throw new Error('Empty response from Gemini API');
        }
        
        const processingTime = Date.now() - requestStartTime;
        
        // 🔥 성공 기록
        apiKeyManager.markKeySuccess('gemini', selectedKeyIndex);
        
        console.log(`[${label}] ✅ 성공 (모델: ${currentModel}, 키: ${selectedKeyIndex}, 시간: ${processingTime}ms, 응답: ${text.length}자)`);
        
        return {
          text,
          model: currentModel,
          keyIndex: selectedKeyIndex,
          processingTime,
          totalAttempts,
          isImageComposition: isImageComposition
        };
        
      } catch (error) {
        lastError = error;
        const errorMessage = error?.message || '';
        const statusCode = error?.status;
        
        // API 키가 선택되었다면 에러 기록
        if (selectedKeyIndex !== null) {
          apiKeyManager.markKeyError('gemini', selectedKeyIndex, errorMessage);
        }
        
        console.error(`[${label}] 시도 ${totalAttempts} 실패 (모델: ${currentModel}, 키: ${selectedKeyIndex}):`, errorMessage);
        
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
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // 모든 모델과 재시도 실패
  const totalTime = Date.now() - startTime;
  const errorMessage = `Gemini API 호출 실패 (${totalAttempts}회 시도, ${totalTime}ms, 모든 모델 실패): ${lastError?.message || 'Unknown error'}`;
  console.error(`[${label}] ❌ ${errorMessage}`);
  throw new Error(errorMessage);
}

/**
 * 🔥 안전한 Freepik API 호출 (동시 사용자 대응 개선)
 */
export async function safeCallFreepik(url, options = {}, conceptId = 0, label = 'freepik-call') {
  const maxRetries = options.maxRetries || MAX_RETRIES;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let keyIndex = null;
    try {
      // 🔥 컨셉별 API 키 선택 (라운드 로빈 방식으로 부하 분산)
      const { key: apiKey, index } = apiKeyManager.selectFreepikKeyForConcept(conceptId);
      keyIndex = index;
      
      console.log(`[${label}] 시도 ${attempt + 1}/${maxRetries} (컨셉: ${conceptId}, 키: ${keyIndex})`);
      
      // 🔥 동시 요청 부하 분산 (컨셉ID + 키 인덱스 기반)
      const conceptBasedDelay = ((conceptId * 300) + (keyIndex * 500)) % 2000 + 800; // 800-2800ms
      const jitter = Math.random() * 500; // 추가 지터
      await new Promise(resolve => setTimeout(resolve, conceptBasedDelay + jitter));
      
      const requestOptions = {
        ...options,
        headers: {
          ...options.headers,
          'x-freepik-api-key': apiKey,
          'User-Agent': 'AI-Ad-Creator/2025',
          'Accept': 'application/json'
        }
      };
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120초 타임아웃
      
      const startTime = Date.now();
      
      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const processingTime = Date.now() - startTime;
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const error = new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
        error.status = response.status;
        
        apiKeyManager.markKeyError('freepik', keyIndex, error.message);
        
        if (isRetryableError(error, response.status) && attempt < maxRetries - 1) {
          const delay = exponentialBackoffDelay(attempt, BASE_DELAY * (conceptId + 1));
          console.log(`[${label}] ${delay}ms 후 재시도... (키: ${keyIndex})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
      
      const data = await response.json();
      apiKeyManager.markKeySuccess('freepik', keyIndex);
      
      console.log(`[${label}] ✅ 성공 (컨셉: ${conceptId}, 키: ${keyIndex}, 시간: ${processingTime}ms)`);
      
      return data;
      
    } catch (error) {
      lastError = error;
      if (keyIndex !== null) {
        apiKeyManager.markKeyError('freepik', keyIndex, error.message);
      }
      console.error(`[${label}] 시도 ${attempt + 1} 실패 (컨셉: ${conceptId}):`, error.message);
      
      if (attempt < maxRetries - 1 && isRetryableError(error, error.status)) {
        const delay = exponentialBackoffDelay(attempt, BASE_DELAY * (conceptId + 1));
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      break;
    }
  }
  
  throw lastError || new Error(`${label} 최대 재시도 초과 (컨셉: ${conceptId})`);
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
    stats?.gemini?.availableKeys || 0: 
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

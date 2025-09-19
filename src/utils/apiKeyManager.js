// src/utils/apiKeyManager.js
// API 키 풀 관리 및 부하 분산 시스템

class ApiKeyManager {
  constructor() {
    // Gemini API 키 풀 초기화
    this.geminiKeys = this.initializeGeminiKeys();
    this.freepikKeys = this.initializeFreepikKeys();
    
    // 키별 사용 통계 (메모리 기반)
    this.geminiUsage = new Map(); // keyIndex -> { lastUsed, errorCount, successCount, isBlocked }
    this.freepikUsage = new Map();
    
    // 전역 요청 카운터
    this.globalRequestCount = 0;
    
    console.log(`[ApiKeyManager] 초기화 완료: Gemini ${this.geminiKeys.length}개, Freepik ${this.freepikKeys.length}개`);
  }

  /**
   * 환경변수에서 Gemini API 키들을 수집
   */
  initializeGeminiKeys() {
    const keys = [];
    
    // 기본 키들 수집 (서버와 클라이언트 환경변수 모두 체크)
    const possibleKeys = [
      process.env.GEMINI_API_KEY,
      process.env.VITE_GEMINI_API_KEY,
      process.env.REACT_APP_GEMINI_API_KEY
    ];
    
    // 넘버링된 키들 수집 (최대 20개까지)
    for (let i = 2; i <= 20; i++) {
      possibleKeys.push(
        process.env[`GEMINI_API_KEY_${i}`],
        process.env[`VITE_GEMINI_API_KEY_${i}`],
        process.env[`REACT_APP_GEMINI_API_KEY_${i}`]
      );
    }
    
    // 유효한 키만 필터링
    possibleKeys.forEach((key, index) => {
      if (key && typeof key === 'string' && key.trim().length > 10) {
        keys.push(key.trim());
        console.log(`[ApiKeyManager] Gemini 키 ${keys.length} 등록: ${key.substring(0, 12)}...`);
      }
    });
    
    if (keys.length === 0) {
      console.warn('[ApiKeyManager] ⚠️ Gemini API 키가 하나도 없습니다!');
    }
    
    return [...new Set(keys)]; // 중복 제거
  }

  /**
   * 환경변수에서 Freepik API 키들을 수집
   */
  initializeFreepikKeys() {
    const keys = [];
    
    const possibleKeys = [
      process.env.FREEPIK_API_KEY,
      process.env.VITE_FREEPIK_API_KEY,
      process.env.REACT_APP_FREEPIK_API_KEY
    ];
    
    // 넘버링된 키들 수집
    for (let i = 2; i <= 20; i++) {
      possibleKeys.push(
        process.env[`FREEPIK_API_KEY_${i}`],
        process.env[`VITE_FREEPIK_API_KEY_${i}`],
        process.env[`REACT_APP_FREEPIK_API_KEY_${i}`]
      );
    }
    
    possibleKeys.forEach((key) => {
      if (key && typeof key === 'string' && key.trim().length > 10) {
        keys.push(key.trim());
        console.log(`[ApiKeyManager] Freepik 키 ${keys.length} 등록: ${key.substring(0, 12)}...`);
      }
    });
    
    if (keys.length === 0) {
      console.warn('[ApiKeyManager] ⚠️ Freepik API 키가 하나도 없습니다!');
    }
    
    return [...new Set(keys)];
  }

  /**
   * 가장 적합한 Gemini API 키 선택 (부하 분산)
   */
  selectBestGeminiKey() {
    if (this.geminiKeys.length === 0) {
      throw new Error('사용 가능한 Gemini API 키가 없습니다');
    }
    
    if (this.geminiKeys.length === 1) {
      return { key: this.geminiKeys[0], index: 0 };
    }
    
    const now = Date.now();
    let bestIndex = 0;
    let bestScore = Infinity;
    
    for (let i = 0; i < this.geminiKeys.length; i++) {
      const usage = this.geminiUsage.get(i) || { 
        lastUsed: 0, 
        errorCount: 0, 
        successCount: 0, 
        isBlocked: false 
      };
      
      // 블록된 키는 30분 후에 재시도 가능
      if (usage.isBlocked && (now - usage.lastUsed) < 30 * 60 * 1000) {
        continue;
      }
      
      // 점수 계산: 에러율 + 최근 사용 패널티 + 블록 히스토리
      const total = usage.errorCount + usage.successCount;
      const errorRate = total > 0 ? usage.errorCount / total : 0;
      const timeSinceLastUse = now - usage.lastUsed;
      const recentUsagePenalty = Math.max(0, (60000 - timeSinceLastUse)) / 1000; // 1분 쿨다운
      const blockPenalty = usage.isBlocked ? 1000 : 0;
      
      const score = (errorRate * 500) + recentUsagePenalty + blockPenalty;
      
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    
    // 선택된 키 사용 기록
    this.markKeyUsed('gemini', bestIndex);
    
    return { key: this.geminiKeys[bestIndex], index: bestIndex };
  }

  /**
   * 컨셉별 Freepik 키 선택 (향후 확장용)
   */
  selectFreepikKeyForConcept(conceptId = 0) {
    if (this.freepikKeys.length === 0) {
      throw new Error('사용 가능한 Freepik API 키가 없습니다');
    }
    
    // 현재는 라운드 로빈 방식으로 분배
    const keyIndex = conceptId % this.freepikKeys.length;
    
    this.markKeyUsed('freepik', keyIndex);
    
    return { 
      key: this.freepikKeys[keyIndex], 
      index: keyIndex,
      conceptId 
    };
  }

  /**
   * 키 사용 시작 기록
   */
  markKeyUsed(service, keyIndex) {
    const now = Date.now();
    const usageMap = service === 'gemini' ? this.geminiUsage : this.freepikUsage;
    
    if (!usageMap.has(keyIndex)) {
      usageMap.set(keyIndex, { 
        lastUsed: now, 
        errorCount: 0, 
        successCount: 0, 
        isBlocked: false 
      });
    } else {
      usageMap.get(keyIndex).lastUsed = now;
      usageMap.get(keyIndex).isBlocked = false; // 재사용 시 블록 해제
    }
    
    this.globalRequestCount++;
  }

  /**
   * 키 사용 성공 기록
   */
  markKeySuccess(service, keyIndex) {
    const usageMap = service === 'gemini' ? this.geminiUsage : this.freepikUsage;
    
    if (usageMap.has(keyIndex)) {
      usageMap.get(keyIndex).successCount++;
      usageMap.get(keyIndex).isBlocked = false;
    }
  }

  /**
   * 키 사용 실패 기록 (Rate Limit 감지)
   */
  markKeyError(service, keyIndex, errorMessage = '') {
    const usageMap = service === 'gemini' ? this.geminiUsage : this.freepikUsage;
    
    if (usageMap.has(keyIndex)) {
      const usage = usageMap.get(keyIndex);
      usage.errorCount++;
      
      // Rate Limit 에러 감지
      const isRateLimit = errorMessage.toLowerCase().includes('429') || 
                         errorMessage.toLowerCase().includes('rate limit') ||
                         errorMessage.toLowerCase().includes('quota') ||
                         errorMessage.toLowerCase().includes('overload');
      
      if (isRateLimit) {
        usage.isBlocked = true;
        console.warn(`[ApiKeyManager] ${service} 키 ${keyIndex} 일시적 블록 (Rate Limit)`);
      }
      
      // 연속 실패가 많으면 일시적 블록
      if (usage.errorCount > usage.successCount * 2 && usage.errorCount >= 3) {
        usage.isBlocked = true;
        console.warn(`[ApiKeyManager] ${service} 키 ${keyIndex} 일시적 블록 (연속 실패)`);
      }
    }
  }

  /**
   * 사용 통계 조회
   */
  getUsageStats() {
    const geminiStats = {};
    const freepikStats = {};
    
    for (let i = 0; i < this.geminiKeys.length; i++) {
      const usage = this.geminiUsage.get(i) || { lastUsed: 0, errorCount: 0, successCount: 0, isBlocked: false };
      const total = usage.errorCount + usage.successCount;
      
      geminiStats[`key_${i}`] = {
        errorRate: total > 0 ? `${(usage.errorCount / total * 100).toFixed(1)}%` : '0%',
        successCount: usage.successCount,
        errorCount: usage.errorCount,
        isBlocked: usage.isBlocked,
        lastUsed: usage.lastUsed ? new Date(usage.lastUsed).toISOString() : 'never'
      };
    }
    
    for (let i = 0; i < this.freepikKeys.length; i++) {
      const usage = this.freepikUsage.get(i) || { lastUsed: 0, errorCount: 0, successCount: 0, isBlocked: false };
      const total = usage.errorCount + usage.successCount;
      
      freepikStats[`key_${i}`] = {
        errorRate: total > 0 ? `${(usage.errorCount / total * 100).toFixed(1)}%` : '0%',
        successCount: usage.successCount,
        errorCount: usage.errorCount,
        isBlocked: usage.isBlocked,
        lastUsed: usage.lastUsed ? new Date(usage.lastUsed).toISOString() : 'never'
      };
    }
    
    return {
      gemini: {
        totalKeys: this.geminiKeys.length,
        availableKeys: this.geminiKeys.length - Array.from(this.geminiUsage.values()).filter(u => u.isBlocked).length,
        keys: geminiStats
      },
      freepik: {
        totalKeys: this.freepikKeys.length,
        availableKeys: this.freepikKeys.length - Array.from(this.freepikUsage.values()).filter(u => u.isBlocked).length,
        keys: freepikStats
      },
      global: {
        totalRequests: this.globalRequestCount,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 모든 키가 블록되었는지 확인
   */
  areAllKeysBlocked(service) {
    const keys = service === 'gemini' ? this.geminiKeys : this.freepikKeys;
    const usageMap = service === 'gemini' ? this.geminiUsage : this.freepikUsage;
    
    if (keys.length === 0) return true;
    
    const now = Date.now();
    const blockTimeout = 30 * 60 * 1000; // 30분
    
    for (let i = 0; i < keys.length; i++) {
      const usage = usageMap.get(i);
      
      // 사용된 적이 없거나, 블록되지 않았거나, 블록 시간이 지났으면 사용 가능
      if (!usage || 
          !usage.isBlocked || 
          (now - usage.lastUsed) > blockTimeout) {
        return false;
      }
    }
    
    return true;
  }
}

// 글로벌 인스턴스 (서버/클라이언트에서 공통 사용)
export const apiKeyManager = new ApiKeyManager();

export default apiKeyManager;

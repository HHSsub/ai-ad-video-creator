// src/utils/apiKeyManager.js
// 🔥 제대로 작동하는 API 키 풀 관리 시스템

class ApiKeyManager {
  constructor() {
    this.geminiKeys = [];
    this.freepikKeys = [];
    
    // 키별 사용 통계 (메모리 기반)
    this.geminiUsage = new Map();
    this.freepikUsage = new Map();
    
    // 전역 요청 카운터
    this.globalRequestCount = 0;
    
    // 🔥 키 초기화 (즉시 실행)
    this.initializeKeys();
    
    console.log(`[ApiKeyManager] 초기화 완료: Gemini ${this.geminiKeys.length}개, Freepik ${this.freepikKeys.length}개`);
  }

  /**
   * 🔥 키 초기화 - 모든 가능한 환경변수 체크
   */
  initializeKeys() {
    console.log('[ApiKeyManager] 🔍 환경변수 전체 스캔 시작...');
    
    // 🔥 Gemini 키 수집
    this.geminiKeys = this.collectGeminiKeys();
    this.freepikKeys = this.collectFreepikKeys();
    
    // 초기 사용 통계 설정
    this.geminiKeys.forEach((key, index) => {
      this.geminiUsage.set(index, {
        lastUsed: 0,
        errorCount: 0,
        successCount: 0,
        isBlocked: false,
        keyPreview: key.substring(0, 12) + '...'
      });
    });
    
    this.freepikKeys.forEach((key, index) => {
      this.freepikUsage.set(index, {
        lastUsed: 0,
        errorCount: 0,
        successCount: 0,
        isBlocked: false,
        keyPreview: key.substring(0, 12) + '...'
      });
    });
    
    // 🔥 최종 상태 로깅
    console.log('[ApiKeyManager] 🎯 최종 키 현황:');
    console.log(`  - Gemini: ${this.geminiKeys.length}개`);
    this.geminiKeys.forEach((key, i) => {
      console.log(`    [${i}] ${key.substring(0, 12)}...${key.substring(key.length-8)}`);
    });
    console.log(`  - Freepik: ${this.freepikKeys.length}개`);
    this.freepikKeys.forEach((key, i) => {
      console.log(`    [${i}] ${key.substring(0, 12)}...${key.substring(key.length-8)}`);
    });
  }

  /**
   * 🔥 Gemini 키 수집 - 더 정확하게
   */
  collectGeminiKeys() {
    const keys = new Set(); // 중복 방지
    
    // 🔥 모든 가능한 패턴 체크
    const patterns = [
      // 기본 패턴들
      'GEMINI_API_KEY',
      'VITE_GEMINI_API_KEY', 
      'REACT_APP_GEMINI_API_KEY',
      'GOOGLE_API_KEY',
      'VITE_GOOGLE_API_KEY',
      'REACT_APP_GOOGLE_API_KEY',
      
      // 넘버링된 패턴들 (1-10까지)
      ...Array.from({length: 10}, (_, i) => `GEMINI_API_KEY_${i + 1}`),
      ...Array.from({length: 10}, (_, i) => `VITE_GEMINI_API_KEY_${i + 1}`),
      ...Array.from({length: 10}, (_, i) => `REACT_APP_GEMINI_API_KEY_${i + 1}`),
      ...Array.from({length: 10}, (_, i) => `GOOGLE_API_KEY_${i + 1}`),
      ...Array.from({length: 10}, (_, i) => `VITE_GOOGLE_API_KEY_${i + 1}`)
    ];
    
    console.log(`[collectGeminiKeys] 🔍 ${patterns.length}개 패턴 검색 중...`);
    
    patterns.forEach(pattern => {
      const value = process.env[pattern];
      if (value && typeof value === 'string' && value.trim().length > 20) {
        const cleanKey = value.trim();
        if (cleanKey.startsWith('AIza') || cleanKey.length > 30) { // Gemini 키 형식 검증
          keys.add(cleanKey);
          console.log(`[collectGeminiKeys] ✅ 발견: ${pattern} = ${cleanKey.substring(0, 12)}...`);
        } else {
          console.warn(`[collectGeminiKeys] ⚠️ 형식 이상: ${pattern} = ${cleanKey.substring(0, 12)}...`);
        }
      }
    });
    
    const result = Array.from(keys);
    console.log(`[collectGeminiKeys] 🎯 총 ${result.length}개 유효한 Gemini 키 수집`);
    
    if (result.length === 0) {
      console.error('[collectGeminiKeys] ❌ Gemini API 키가 하나도 없습니다!');
      console.log('[collectGeminiKeys] 💡 .env 파일에 다음 중 하나를 설정하세요:');
      console.log('  GEMINI_API_KEY=your_key_here');
      console.log('  GEMINI_API_KEY_2=your_second_key_here');
    }
    
    return result;
  }

  /**
   * 🔥 Freepik 키 수집 - 더 정확하게
   */
  collectFreepikKeys() {
    const keys = new Set();
    
    const patterns = [
      'FREEPIK_API_KEY',
      'VITE_FREEPIK_API_KEY',
      'REACT_APP_FREEPIK_API_KEY',
      
      // 넘버링된 패턴들
      ...Array.from({length: 10}, (_, i) => `FREEPIK_API_KEY_${i + 1}`),
      ...Array.from({length: 10}, (_, i) => `VITE_FREEPIK_API_KEY_${i + 1}`),
      ...Array.from({length: 10}, (_, i) => `REACT_APP_FREEPIK_API_KEY_${i + 1}`)
    ];
    
    console.log(`[collectFreepikKeys] 🔍 ${patterns.length}개 패턴 검색 중...`);
    
    patterns.forEach(pattern => {
      const value = process.env[pattern];
      if (value && typeof value === 'string' && value.trim().length > 10) {
        const cleanKey = value.trim();
        keys.add(cleanKey);
        console.log(`[collectFreepikKeys] ✅ 발견: ${pattern} = ${cleanKey.substring(0, 12)}...`);
      }
    });
    
    const result = Array.from(keys);
    console.log(`[collectFreepikKeys] 🎯 총 ${result.length}개 유효한 Freepik 키 수집`);
    
    return result;
  }

  /**
   * 🔥 가장 적합한 Gemini API 키 선택 (로드 밸런싱)
   */
  selectBestGeminiKey() {
    if (this.geminiKeys.length === 0) {
      throw new Error('사용 가능한 Gemini API 키가 없습니다. .env 파일을 확인하세요.');
    }
    
    if (this.geminiKeys.length === 1) {
      console.log('[selectBestGeminiKey] 키 1개만 있음, 해당 키 사용');
      return { key: this.geminiKeys[0], index: 0 };
    }
    
    const now = Date.now();
    let bestIndex = 0;
    let bestScore = Infinity;
    
    console.log('[selectBestGeminiKey] 🎯 최적 키 선택 중...');
    
    for (let i = 0; i < this.geminiKeys.length; i++) {
      const usage = this.geminiUsage.get(i) || { 
        lastUsed: 0, 
        errorCount: 0, 
        successCount: 0, 
        isBlocked: false 
      };
      
      // 🔥 블록된 키는 30분 후에 재시도 가능
      const blockTimeout = 30 * 60 * 1000; // 30분
      if (usage.isBlocked && (now - usage.lastUsed) < blockTimeout) {
        const remainingTime = Math.ceil((blockTimeout - (now - usage.lastUsed)) / 1000);
        console.log(`[selectBestGeminiKey] 키 ${i} 블록됨 (${remainingTime}초 남음)`);
        continue;
      }
      
      // 🔥 점수 계산: 에러율 + 최근 사용 패널티
      const total = usage.errorCount + usage.successCount;
      const errorRate = total > 0 ? usage.errorCount / total : 0;
      const timeSinceLastUse = now - usage.lastUsed;
      const recentUsagePenalty = Math.max(0, (30000 - timeSinceLastUse)) / 1000; // 30초 쿨다운
      
      const score = (errorRate * 100) + recentUsagePenalty;
      
      console.log(`[selectBestGeminiKey] 키 ${i}: 에러율=${(errorRate*100).toFixed(1)}%, 마지막사용=${Math.floor(timeSinceLastUse/1000)}초전, 점수=${score.toFixed(1)}`);
      
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    
    // 🔥 선택된 키 사용 기록
    this.markKeyUsed('gemini', bestIndex);
    
    console.log(`[selectBestGeminiKey] ✅ 키 ${bestIndex} 선택 (점수: ${bestScore.toFixed(1)})`);
    
    return { key: this.geminiKeys[bestIndex], index: bestIndex };
  }

  /**
   * 🔥 컨셉별 Freepik 키 선택 (라운드 로빈)
   */
  selectFreepikKeyForConcept(conceptId = 0) {
    if (this.freepikKeys.length === 0) {
      throw new Error('사용 가능한 Freepik API 키가 없습니다. .env 파일을 확인하세요.');
    }
    
    if (this.freepikKeys.length === 1) {
      this.markKeyUsed('freepik', 0);
      return { key: this.freepikKeys[0], index: 0, conceptId };
    }
    
    // 🔥 사용 가능한 키 중에서 라운드 로빈
    const now = Date.now();
    const availableKeys = [];
    
    for (let i = 0; i < this.freepikKeys.length; i++) {
      const usage = this.freepikUsage.get(i) || { isBlocked: false, lastUsed: 0 };
      const blockTimeout = 30 * 60 * 1000; // 30분
      
      if (!usage.isBlocked || (now - usage.lastUsed) > blockTimeout) {
        availableKeys.push(i);
      }
    }
    
    if (availableKeys.length === 0) {
      console.warn('[selectFreepikKeyForConcept] 모든 키가 블록됨, 첫 번째 키 강제 사용');
      const keyIndex = 0;
      this.markKeyUsed('freepik', keyIndex);
      return { key: this.freepikKeys[keyIndex], index: keyIndex, conceptId };
    }
    
    // 컨셉 ID 기반 라운드 로빈
    const keyIndex = availableKeys[conceptId % availableKeys.length];
    
    this.markKeyUsed('freepik', keyIndex);
    
    console.log(`[selectFreepikKeyForConcept] 컨셉 ${conceptId} → 키 ${keyIndex} 선택 (사용가능: ${availableKeys.length}개)`);
    
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
      const usage = usageMap.get(keyIndex);
      usage.lastUsed = now;
      // 🔥 재사용 시 블록 해제 (30분이 지났으면)
      if (usage.isBlocked && (now - usage.lastUsed) > 30 * 60 * 1000) {
        usage.isBlocked = false;
        console.log(`[markKeyUsed] ${service} 키 ${keyIndex} 블록 해제 (30분 경과)`);
      }
    }
    
    this.globalRequestCount++;
  }

  /**
   * 키 사용 성공 기록
   */
  markKeySuccess(service, keyIndex) {
    const usageMap = service === 'gemini' ? this.geminiUsage : this.freepikUsage;
    
    if (usageMap.has(keyIndex)) {
      const usage = usageMap.get(keyIndex);
      usage.successCount++;
      usage.isBlocked = false; // 성공 시 블록 해제
      console.log(`[markKeySuccess] ${service} 키 ${keyIndex} 성공 (총 ${usage.successCount}회)`);
    }
  }

  /**
   * 🔥 키 사용 실패 기록 (Rate Limit 감지 개선)
   */
  markKeyError(service, keyIndex, errorMessage = '') {
    const usageMap = service === 'gemini' ? this.geminiUsage : this.freepikUsage;
    
    if (usageMap.has(keyIndex)) {
      const usage = usageMap.get(keyIndex);
      usage.errorCount++;
      
      // 🔥 Rate Limit 에러 감지 (더 정확하게)
      const errorLower = errorMessage.toLowerCase();
      const isRateLimit = errorLower.includes('429') || 
                         errorLower.includes('too many requests') ||
                         errorLower.includes('rate limit') ||
                         errorLower.includes('quota') ||
                         errorLower.includes('exceeded your current quota') ||
                         errorLower.includes('overload');
      
      if (isRateLimit) {
        usage.isBlocked = true;
        console.warn(`[markKeyError] 🚫 ${service} 키 ${keyIndex} 일시적 블록 (Rate Limit): ${errorMessage.substring(0, 100)}`);
      }
      
      // 🔥 연속 실패가 많으면 일시적 블록
      if (usage.errorCount > usage.successCount + 2 && usage.errorCount >= 3) {
        usage.isBlocked = true;
        console.warn(`[markKeyError] 🚫 ${service} 키 ${keyIndex} 일시적 블록 (연속 실패 ${usage.errorCount}회)`);
      }
      
      console.log(`[markKeyError] ${service} 키 ${keyIndex} 실패 (총 ${usage.errorCount}회) ${usage.isBlocked ? '- 블록됨' : ''}`);
    }
  }

  /**
   * 🔥 사용 통계 조회 (개선된 형태)
   */
  getUsageStats() {
    const geminiStats = {};
    const freepikStats = {};
    
    for (let i = 0; i < this.geminiKeys.length; i++) {
      const usage = this.geminiUsage.get(i) || { lastUsed: 0, errorCount: 0, successCount: 0, isBlocked: false };
      const total = usage.errorCount + usage.successCount;
      
      geminiStats[`key_${i}`] = {
        preview: this.geminiKeys[i].substring(0, 12) + '...',
        errorRate: total > 0 ? `${(usage.errorCount / total * 100).toFixed(1)}%` : '0%',
        successCount: usage.successCount,
        errorCount: usage.errorCount,
        isBlocked: usage.isBlocked,
        lastUsed: usage.lastUsed ? new Date(usage.lastUsed).toISOString() : 'never',
        timeSinceLastUse: usage.lastUsed ? Math.floor((Date.now() - usage.lastUsed) / 1000) + 's' : 'never'
      };
    }
    
    for (let i = 0; i < this.freepikKeys.length; i++) {
      const usage = this.freepikUsage.get(i) || { lastUsed: 0, errorCount: 0, successCount: 0, isBlocked: false };
      const total = usage.errorCount + usage.successCount;
      
      freepikStats[`key_${i}`] = {
        preview: this.freepikKeys[i].substring(0, 12) + '...',
        errorRate: total > 0 ? `${(usage.errorCount / total * 100).toFixed(1)}%` : '0%',
        successCount: usage.successCount,
        errorCount: usage.errorCount,
        isBlocked: usage.isBlocked,
        lastUsed: usage.lastUsed ? new Date(usage.lastUsed).toISOString() : 'never',
        timeSinceLastUse: usage.lastUsed ? Math.floor((Date.now() - usage.lastUsed) / 1000) + 's' : 'never'
      };
    }
    
    const now = Date.now();
    const geminiAvailable = this.geminiKeys.length - Array.from(this.geminiUsage.values()).filter(u => 
      u.isBlocked && (now - u.lastUsed) < 30 * 60 * 1000
    ).length;
    
    const freepikAvailable = this.freepikKeys.length - Array.from(this.freepikUsage.values()).filter(u => 
      u.isBlocked && (now - u.lastUsed) < 30 * 60 * 1000
    ).length;
    
    return {
      gemini: {
        totalKeys: this.geminiKeys.length,
        availableKeys: geminiAvailable,
        keys: geminiStats
      },
      freepik: {
        totalKeys: this.freepikKeys.length,
        availableKeys: freepikAvailable,
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

  /**
   * 🔥 디버깅용 상태 출력
   */
  logStatus() {
    console.log('=== 🔍 API Key Pool Status ===');
    console.log(`Gemini Keys: ${this.geminiKeys.length}개`);
    this.geminiKeys.forEach((key, i) => {
      const usage = this.geminiUsage.get(i);
      console.log(`  [${i}] ${key.substring(0, 12)}... - ${usage?.isBlocked ? '🚫 블록' : '✅ 사용가능'} (성공:${usage?.successCount || 0}, 실패:${usage?.errorCount || 0})`);
    });
    
    console.log(`Freepik Keys: ${this.freepikKeys.length}개`);
    this.freepikKeys.forEach((key, i) => {
      const usage = this.freepikUsage.get(i);
      console.log(`  [${i}] ${key.substring(0, 12)}... - ${usage?.isBlocked ? '🚫 블록' : '✅ 사용가능'} (성공:${usage?.successCount || 0}, 실패:${usage?.errorCount || 0})`);
    });
    console.log('===============================');
  }
}

// 🔥 글로벌 인스턴스 (즉시 초기화)
export const apiKeyManager = new ApiKeyManager();

export default apiKeyManager;

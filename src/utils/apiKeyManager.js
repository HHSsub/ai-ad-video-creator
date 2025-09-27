// src/utils/apiKeyManager.js
// 🔥 제대로 작동하는 API 키 풀 관리 시스템 (블록 타임아웃 1분 + 블록 연장 현상 없음)
// 모든 기능/통계/로그/상태 출력 완전 보존 + 불필요한 블록 시간 연장 절대 없음

class ApiKeyManager {
  constructor() {
    this.geminiKeys = [];
    this.freepikKeys = [];
    this.geminiUsage = new Map();
    this.freepikUsage = new Map();
    this.globalRequestCount = 0;
    this.BLOCK_TIMEOUT = 1 * 60 * 1000; // 1분 블록
    this.initializeKeys();
    console.log(`[ApiKeyManager] 초기화 완료: Gemini ${this.geminiKeys.length}개, Freepik ${this.freepikKeys.length}개`);
  }

  initializeKeys() {
    console.log('[ApiKeyManager] 🔍 환경변수 전체 스캔 시작...');
    this.geminiKeys = this.collectGeminiKeys();
    this.freepikKeys = this.collectFreepikKeys();

    this.geminiKeys.forEach((key, index) => {
      this.geminiUsage.set(index, {
        lastUsed: 0,
        errorCount: 0,
        successCount: 0,
        isBlocked: false,
        blockStarted: 0, // 🔥 최초 블록 시점 기록
        keyPreview: key.substring(0, 12) + '...'
      });
    });

    this.freepikKeys.forEach((key, index) => {
      this.freepikUsage.set(index, {
        lastUsed: 0,
        errorCount: 0,
        successCount: 0,
        isBlocked: false,
        blockStarted: 0, // 🔥 최초 블록 시점 기록
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

  collectGeminiKeys() {
    const keys = new Set();
    const patterns = [
      'GEMINI_API_KEY',
      'GOOGLE_API_KEY',
      'VITE_GOOGLE_API_KEY',
      'REACT_APP_GOOGLE_API_KEY',
      ...Array.from({length: 10}, (_, i) => `GEMINI_API_KEY_${i + 1}`),
      ...Array.from({length: 10}, (_, i) => `GOOGLE_API_KEY_${i + 1}`),
      ...Array.from({length: 10}, (_, i) => `VITE_GOOGLE_API_KEY_${i + 1}`)
    ];
    console.log(`[collectGeminiKeys] 🔍 ${patterns.length}개 패턴 검색 중...`);
    patterns.forEach(pattern => {
      const value = process.env[pattern];
      if (value && typeof value === 'string' && value.trim().length > 20) {
        const cleanKey = value.trim();
        if (cleanKey.startsWith('AIza') || cleanKey.length > 30) {
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

  collectFreepikKeys() {
    const keys = new Set();
    const patterns = [
      'FREEPIK_API_KEY',
      'VITE_FREEPIK_API_KEY',
      'REACT_APP_FREEPIK_API_KEY',
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
        isBlocked: false,
        blockStarted: 0
      };
      // 🔥 블록된 키는 최초 블록 시점 기준 1분 후 해제. lastUsed로 갱신하지 않음
      if (usage.isBlocked && (now - usage.blockStarted) < this.BLOCK_TIMEOUT) {
        const remainingTime = Math.ceil((this.BLOCK_TIMEOUT - (now - usage.blockStarted)) / 1000);
        console.log(`[selectBestGeminiKey] 키 ${i} 블록됨 (${remainingTime}초 남음)`);
        continue;
      }
      const total = usage.errorCount + usage.successCount;
      const errorRate = total > 0 ? usage.errorCount / total : 0;
      const timeSinceLastUse = now - usage.lastUsed;
      const recentUsagePenalty = Math.max(0, (30000 - timeSinceLastUse)) / 1000;
      const score = (errorRate * 100) + recentUsagePenalty;
      console.log(`[selectBestGeminiKey] 키 ${i}: 에러율=${(errorRate*100).toFixed(1)}%, 마지막사용=${Math.floor(timeSinceLastUse/1000)}초전, 점수=${score.toFixed(1)}`);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    this.markKeyUsed('gemini', bestIndex);
    console.log(`[selectBestGeminiKey] ✅ 키 ${bestIndex} 선택 (점수: ${bestScore.toFixed(1)})`);
    return { key: this.geminiKeys[bestIndex], index: bestIndex };
  }

  selectFreepikKeyForConcept(conceptId = 0) {
    if (this.freepikKeys.length === 0) {
      throw new Error('사용 가능한 Freepik API 키가 없습니다. .env 파일을 확인하세요.');
    }
    if (this.freepikKeys.length === 1) {
      this.markKeyUsed('freepik', 0);
      return { key: this.freepikKeys[0], index: 0, conceptId };
    }
    const now = Date.now();
    const availableKeys = [];
    for (let i = 0; i < this.freepikKeys.length; i++) {
      const usage = this.freepikUsage.get(i) || { isBlocked: false, lastUsed: 0, blockStarted: 0 };
      // 블록된 키도 최초 블록 시점 기준 1분 후 해제
      if (!usage.isBlocked || (now - usage.blockStarted) > this.BLOCK_TIMEOUT) {
        availableKeys.push(i);
      }
    }
    if (availableKeys.length === 0) {
      console.warn('[selectFreepikKeyForConcept] 모든 키가 블록됨, 첫 번째 키 강제 사용');
      const keyIndex = 0;
      this.markKeyUsed('freepik', keyIndex);
      return { key: this.freepikKeys[keyIndex], index: keyIndex, conceptId };
    }
    const keyIndex = availableKeys[conceptId % availableKeys.length];
    this.markKeyUsed('freepik', keyIndex);
    console.log(`[selectFreepikKeyForConcept] 컨셉 ${conceptId} → 키 ${keyIndex} 선택 (사용가능: ${availableKeys.length}개)`);
    return { 
      key: this.freepikKeys[keyIndex], 
      index: keyIndex,
      conceptId 
    };
  }

  markKeyUsed(service, keyIndex) {
    const now = Date.now();
    const usageMap = service === 'gemini' ? this.geminiUsage : this.freepikUsage;
    if (!usageMap.has(keyIndex)) {
      usageMap.set(keyIndex, { 
        lastUsed: now, 
        errorCount: 0, 
        successCount: 0, 
        isBlocked: false,
        blockStarted: 0
      });
    } else {
      const usage = usageMap.get(keyIndex);
      if (!usage.isBlocked) {
        usage.lastUsed = now;
      }
      // 만약 블록 상태면, blockStarted가 이미 기록된 최초 시점 그대로 유지. lastUsed를 갱신해도 blockStarted는 업데이트 X
      // 블록 해제는 최초 blockStarted 기준 1분 지나면만 자동 해제
      if (usage.isBlocked && (now - usage.blockStarted) > this.BLOCK_TIMEOUT) {
        usage.isBlocked = false;
        usage.blockStarted = 0;
        console.log(`[markKeyUsed] ${service} 키 ${keyIndex} 블록 해제 (1분 경과)`);
      }
    }
    this.globalRequestCount++;
  }

  markKeySuccess(service, keyIndex) {
    const usageMap = service === 'gemini' ? this.geminiUsage : this.freepikUsage;
    if (usageMap.has(keyIndex)) {
      const usage = usageMap.get(keyIndex);
      usage.successCount++;
      usage.isBlocked = false;
      usage.blockStarted = 0;
      console.log(`[markKeySuccess] ${service} 키 ${keyIndex} 성공 (총 ${usage.successCount}회)`);
    }
  }

  markKeyError(service, keyIndex, errorMessage = '') {
    const usageMap = service === 'gemini' ? this.geminiUsage : this.freepikUsage;
    if (usageMap.has(keyIndex)) {
      const usage = usageMap.get(keyIndex);
      usage.errorCount++;
      const errorLower = errorMessage.toLowerCase();
      const isRateLimit = errorLower.includes('429') || 
                         errorLower.includes('too many requests') ||
                         errorLower.includes('rate limit') ||
                         errorLower.includes('quota') ||
                         errorLower.includes('exceeded your current quota') ||
                         errorLower.includes('overload');
      if (isRateLimit || (usage.errorCount > usage.successCount + 2 && usage.errorCount >= 3)) {
        if (!usage.isBlocked) {
          usage.isBlocked = true;
          usage.blockStarted = Date.now(); // 최초 블록 시점 기록. 이후 절대 갱신 안함.
          console.warn(`[markKeyError] 🚫 ${service} 키 ${keyIndex} 일시적 블록 (Rate Limit/연속실패): ${errorMessage.substring(0, 100)}`);
        } else {
          // 이미 블록된 경우엔 blockStarted 갱신하지 않음
          console.warn(`[markKeyError] 🚫 ${service} 키 ${keyIndex} 이미 블록 중 (blockStarted=${new Date(usage.blockStarted).toISOString()})`);
        }
      }
      console.log(`[markKeyError] ${service} 키 ${keyIndex} 실패 (총 ${usage.errorCount}회) ${usage.isBlocked ? '- 블록됨' : ''}`);
    }
  }

  getUsageStats() {
    const geminiStats = {};
    const freepikStats = {};
    for (let i = 0; i < this.geminiKeys.length; i++) {
      const usage = this.geminiUsage.get(i) || { lastUsed: 0, errorCount: 0, successCount: 0, isBlocked: false, blockStarted: 0 };
      const total = usage.errorCount + usage.successCount;
      geminiStats[`key_${i}`] = {
        preview: this.geminiKeys[i].substring(0, 12) + '...',
        errorRate: total > 0 ? `${(usage.errorCount / total * 100).toFixed(1)}%` : '0%',
        successCount: usage.successCount,
        errorCount: usage.errorCount,
        isBlocked: usage.isBlocked,
        lastUsed: usage.lastUsed ? new Date(usage.lastUsed).toISOString() : 'never',
        blockStarted: usage.blockStarted ? new Date(usage.blockStarted).toISOString() : 'never',
        timeSinceLastUse: usage.lastUsed ? Math.floor((Date.now() - usage.lastUsed) / 1000) + 's' : 'never',
        blockRemaining: (usage.isBlocked && usage.blockStarted)
          ? Math.max(0, Math.floor((this.BLOCK_TIMEOUT - (Date.now() - usage.blockStarted)) / 1000)) + 's'
          : '0s'
      };
    }
    for (let i = 0; i < this.freepikKeys.length; i++) {
      const usage = this.freepikUsage.get(i) || { lastUsed: 0, errorCount: 0, successCount: 0, isBlocked: false, blockStarted: 0 };
      const total = usage.errorCount + usage.successCount;
      freepikStats[`key_${i}`] = {
        preview: this.freepikKeys[i].substring(0, 12) + '...',
        errorRate: total > 0 ? `${(usage.errorCount / total * 100).toFixed(1)}%` : '0%',
        successCount: usage.successCount,
        errorCount: usage.errorCount,
        isBlocked: usage.isBlocked,
        lastUsed: usage.lastUsed ? new Date(usage.lastUsed).toISOString() : 'never',
        blockStarted: usage.blockStarted ? new Date(usage.blockStarted).toISOString() : 'never',
        timeSinceLastUse: usage.lastUsed ? Math.floor((Date.now() - usage.lastUsed) / 1000) + 's' : 'never',
        blockRemaining: (usage.isBlocked && usage.blockStarted)
          ? Math.max(0, Math.floor((this.BLOCK_TIMEOUT - (Date.now() - usage.blockStarted)) / 1000)) + 's'
          : '0s'
      };
    }
    const now = Date.now();
    const geminiAvailable = this.geminiKeys.length - Array.from(this.geminiUsage.values()).filter(u => 
      u.isBlocked && (now - u.blockStarted) < this.BLOCK_TIMEOUT
    ).length;
    const freepikAvailable = this.freepikKeys.length - Array.from(this.freepikUsage.values()).filter(u => 
      u.isBlocked && (now - u.blockStarted) < this.BLOCK_TIMEOUT
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

  areAllKeysBlocked(service) {
    const keys = service === 'gemini' ? this.geminiKeys : this.freepikKeys;
    const usageMap = service === 'gemini' ? this.geminiUsage : this.freepikUsage;
    if (keys.length === 0) return true;
    const now = Date.now();
    for (let i = 0; i < keys.length; i++) {
      const usage = usageMap.get(i);
      if (!usage || 
          !usage.isBlocked || 
          (now - usage.blockStarted) > this.BLOCK_TIMEOUT) {
        return false;
      }
    }
    return true;
  }

  logStatus() {
    console.log('=== 🔍 API Key Pool Status ===');
    console.log(`Gemini Keys: ${this.geminiKeys.length}개`);
    this.geminiKeys.forEach((key, i) => {
      const usage = this.geminiUsage.get(i);
      console.log(`  [${i}] ${key.substring(0, 12)}... - ${usage?.isBlocked ? `🚫 블록(${usage?.blockRemaining || ''})` : '✅ 사용가능'} (성공:${usage?.successCount || 0}, 실패:${usage?.errorCount || 0})`);
    });
    console.log(`Freepik Keys: ${this.freepikKeys.length}개`);
    this.freepikKeys.forEach((key, i) => {
      const usage = this.freepikUsage.get(i);
      console.log(`  [${i}] ${key.substring(0, 12)}... - ${usage?.isBlocked ? `🚫 블록(${usage?.blockRemaining || ''})` : '✅ 사용가능'} (성공:${usage?.successCount || 0}, 실패:${usage?.errorCount || 0})`);
    });
    console.log('===============================');
  }
}

// 🔥 글로벌 인스턴스 (즉시 초기화)
export const apiKeyManager = new ApiKeyManager();

export default apiKeyManager;

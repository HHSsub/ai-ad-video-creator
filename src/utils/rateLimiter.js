// src/utils/rateLimiter.js
// 🔥 Freepik API Rate Limiter (사전 예방적 속도 조절)
// 공식 문서: 초당 50개 (5초), 평균 초당 10개 (2분)

class RateLimiter {
    constructor(maxPerSecond = 10, burstMax = 50, burstWindow = 5000) {
        this.maxPerSecond = maxPerSecond; // 평균 초당 10개
        this.burstMax = burstMax; // 5초 동안 최대 50개
        this.burstWindow = burstWindow; // 5초

        this.requestTimes = []; // 요청 타임스탬프 배열
        this.queue = []; // 대기 중인 요청
        this.processing = false;
    }

    /**
     * Rate Limit 체크 및 대기
     * @returns {Promise<void>}
     */
    async waitForSlot() {
        const now = Date.now();

        // 5초 이내 요청만 유지
        this.requestTimes = this.requestTimes.filter(t => now - t < this.burstWindow);

        // Burst 제한 체크 (5초 동안 50개)
        if (this.requestTimes.length >= this.burstMax) {
            const oldestRequest = this.requestTimes[0];
            const waitTime = this.burstWindow - (now - oldestRequest);
            console.log(`[RateLimiter] 🚦 Burst 제한 도달 (${this.requestTimes.length}/${this.burstMax}), ${Math.ceil(waitTime)}ms 대기`);
            await this.sleep(waitTime + 100); // 100ms 여유
            return this.waitForSlot(); // 재귀 호출
        }

        // 평균 속도 제한 체크 (초당 10개)
        const oneSecondAgo = now - 1000;
        const recentRequests = this.requestTimes.filter(t => t > oneSecondAgo).length;

        if (recentRequests >= this.maxPerSecond) {
            const waitTime = 1000 - (now - this.requestTimes[this.requestTimes.length - this.maxPerSecond]);
            console.log(`[RateLimiter] 🚦 평균 속도 제한 (${recentRequests}/${this.maxPerSecond}/s), ${Math.ceil(waitTime)}ms 대기`);
            await this.sleep(waitTime + 50); // 50ms 여유
            return this.waitForSlot(); // 재귀 호출
        }

        // 슬롯 확보
        this.requestTimes.push(now);
        console.log(`[RateLimiter] ✅ 슬롯 확보 (현재: ${this.requestTimes.length}/5s, ${recentRequests}/s)`);
    }

    /**
     * 대기
     * @param {number} ms 
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
    }

    /**
     * 통계 조회
     * @returns {Object}
     */
    getStats() {
        const now = Date.now();
        const recentRequests = this.requestTimes.filter(t => now - t < this.burstWindow);
        const lastSecond = this.requestTimes.filter(t => now - t < 1000);

        return {
            totalRequests: this.requestTimes.length,
            last5Seconds: recentRequests.length,
            lastSecond: lastSecond.length,
            queueLength: this.queue.length
        };
    }

    /**
     * 리셋
     */
    reset() {
        this.requestTimes = [];
        this.queue = [];
        console.log('[RateLimiter] 🔄 리셋 완료');
    }
}

// 🔥 글로벌 인스턴스 (Freepik 전용)
export const freepikRateLimiter = new RateLimiter(10, 50, 5000);

// 🔥 Gemini Strict Rate Limiter (Free Tier: 10 RPM)
// 60초 / 10회 = 6초에 1회 허용 (매우 보수적 설정)
// maxPerSecond: 0.2 (5초에 1회), burstMax: 1 (동시 요청 불가), burstWindow: 6000 (6초)
export const geminiRateLimiter = new RateLimiter(1, 1, 6000);

export default { freepikRateLimiter, geminiRateLimiter };

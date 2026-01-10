import fs from 'fs';
import path from 'path';

/**
 * 세션 관리 스토어 (파일 백업 지원 - Server Side Only)
 * 진행률 추적 및 상태 관리
 */

class SessionStore {
    constructor() {
        this.sessions = new Map();
        this.SESSION_TIMEOUT = 3600000; // 1시간
        this.persistenceFile = path.join(process.cwd(), 'config', 'sessions.json');

        // 서버 시작 시 파일에서 세션 복구
        this.loadSessions();

        // 주기적으로 만료된 세션 정리 (파일 저장 포함)
        setInterval(() => this.cleanupExpiredSessions(), 300000); // 5분마다
    }

    loadSessions() {
        try {
            if (fs.existsSync(this.persistenceFile)) {
                const data = fs.readFileSync(this.persistenceFile, 'utf8');
                const sessions = JSON.parse(data);
                // Map으로 변환
                Object.entries(sessions).forEach(([id, session]) => {
                    // 유효기간 체크 (재시작 후에도 너무 오래된건 버림)
                    if (Date.now() - session.lastUpdated < this.SESSION_TIMEOUT) {
                        this.sessions.set(id, session);
                    }
                });
                console.log(`[SessionStore] Loaded ${this.sessions.size} sessions from disk`);
            }
        } catch (err) {
            console.error('[SessionStore] Failed to load sessions:', err.message);
        }
    }

    saveSessions() {
        try {
            // config 폴더가 없으면 생성
            const configDir = path.dirname(this.persistenceFile);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            const sessionsObj = Object.fromEntries(this.sessions);
            fs.writeFileSync(this.persistenceFile, JSON.stringify(sessionsObj, null, 2));
        } catch (err) {
            console.error('[SessionStore] Failed to save sessions:', err.message);
        }
    }

    /**
     * 새 세션 생성
     */
    createSession(sessionId, initialData = {}) {
        const session = {
            id: sessionId,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            progress: {
                phase: 'INIT', // INIT, RENDER, COMPOSE, COMPLETE
                percentage: 0,
                currentStep: '',
                totalSteps: 0,
                completedSteps: 0,
                details: {}
            },
            status: 'processing', // processing, completed, error
            error: null,
            result: null,
            ...initialData
        };

        this.sessions.set(sessionId, session);
        this.saveSessions(); // 🔥 즉시 저장
        console.log(`[SessionStore] Created session: ${sessionId}`);
        return session;
    }

    /**
     * 세션 진행률 업데이트
     */
    updateProgress(sessionId, progressData) {
        const session = this.sessions.get(sessionId);

        if (!session) {
            console.warn(`[SessionStore] Session not found: ${sessionId}`);
            return null;
        }

        // 진행률 데이터 병합
        session.progress = {
            ...session.progress,
            ...progressData,
            percentage: Math.min(100, Math.max(0, progressData.percentage || session.progress.percentage))
        };

        session.lastUpdated = Date.now();

        console.log(`[SessionStore] Updated progress for ${sessionId}:`, {
            phase: session.progress.phase,
            percentage: session.progress.percentage,
            currentStep: session.progress.currentStep
        });

        this.sessions.set(sessionId, session);
        this.saveSessions(); // 🔥 업데이트 시 저장
        return session;
    }

    /**
     * 세션 상태 업데이트
     */
    updateStatus(sessionId, status, result = null, error = null) {
        const session = this.sessions.get(sessionId);

        if (!session) {
            console.warn(`[SessionStore] Session not found: ${sessionId}`);
            return null;
        }

        session.status = status;
        session.lastUpdated = Date.now();

        if (result) session.result = result;
        if (error) session.error = error;

        // 완료 시 진행률 100%
        if (status === 'completed') {
            session.progress.percentage = 100;
            session.progress.phase = 'COMPLETE';
        }

        console.log(`[SessionStore] Updated status for ${sessionId}: ${status}`);

        this.sessions.set(sessionId, session);
        this.saveSessions(); // 🔥 상태 변경 시 저장
        return session;
    }

    /**
     * 세션 조회
     */
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);

        if (!session) {
            return null;
        }

        // 타임아웃 체크
        if (Date.now() - session.lastUpdated > this.SESSION_TIMEOUT) {
            console.warn(`[SessionStore] Session expired: ${sessionId}`);
            this.sessions.delete(sessionId);
            this.saveSessions(); // 🔥 만료 삭제 반영
            return null;
        }

        return session;
    }

    /**
     * 세션 삭제
     */
    deleteSession(sessionId) {
        const deleted = this.sessions.delete(sessionId);
        if (deleted) {
            console.log(`[SessionStore] Deleted session: ${sessionId}`);
            this.saveSessions(); // 🔥 삭제 반영
        }
        return deleted;
    }

    /**
     * 만료된 세션 정리
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        let cleaned = 0;

        for (const [sessionId, session] of this.sessions.entries()) {
            if (now - session.lastUpdated > this.SESSION_TIMEOUT) {
                this.sessions.delete(sessionId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[SessionStore] Cleaned up ${cleaned} expired sessions`);
            this.saveSessions(); // 🔥 정리 반영
        }
    }

    /**
     * 모든 세션 조회 (디버깅용)
     */
    getAllSessions() {
        return Array.from(this.sessions.values());
    }

    /**
     * 세션 수 조회
     */
    getSessionCount() {
        return this.sessions.size;
    }
}

// 싱글톤 인스턴스 생성
const sessionStore = new SessionStore();

export default sessionStore;

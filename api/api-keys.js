import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * API 키 관리 API
 * - Gemini API 키 관리 (다중 키)
 * - Freepik API 키 관리 (다중 키)
 * - Gemini 모델 설정
 * - .env 파일 수정 후 런타임 즉시 반영
 */

/**
 * 🔥 환경변수 즉시 리로드 및 apiKeyManager 재초기화
 */
async function reloadEnvironmentAndKeys() {
    try {
        console.log('[api-keys] 🔄 환경변수 런타임 리로드 시작...');

        // 1. .env 파일 다시 로드
        const envPath = path.join(process.cwd(), '.env');
        const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));

        // 2. process.env에 모든 환경변수 강제 덮어쓰기
        Object.keys(envConfig).forEach(key => {
            process.env[key] = envConfig[key];
        });

        console.log('[api-keys] ✅ 환경변수 리로드 완료');

        // 3. apiKeyManager 재초기화
        try {
            const apiKeyManagerModule = await import('../src/utils/apiKeyManager.js');
            const apiKeyManager = apiKeyManagerModule.default || apiKeyManagerModule.apiKeyManager;

            // apiKeyManager의 initializeKeys 메서드 호출
            if (apiKeyManager && typeof apiKeyManager.initializeKeys === 'function') {
                apiKeyManager.initializeKeys();
                console.log('[api-keys] ✅ apiKeyManager 재초기화 완료');
            } else {
                console.warn('[api-keys] ⚠️ apiKeyManager.initializeKeys 메서드를 찾을 수 없습니다');
            }
        } catch (importError) {
            console.error('[api-keys] ❌ apiKeyManager import 실패:', importError);
        }

        console.log('[api-keys] 🎉 모든 키가 즉시 시스템에 반영되었습니다!');
        return {
            success: true,
            message: '환경변수와 API 키가 즉시 시스템에 반영되었습니다. 재시작 불필요!'
        };
    } catch (error) {
        console.error('[api-keys] ❌ 환경변수 리로드 오류:', error);
        return {
            success: false,
            message: `환경변수 리로드 실패: ${error.message}`
        };
    }
}

/**
 * .env 파일 파싱
 */
function parseEnvFile(envPath) {
    if (!fs.existsSync(envPath)) {
        return {};
    }

    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    const env = {};

    lines.forEach(line => {
        const trimmed = line.trim();

        // 주석이나 빈 줄 건너뛰기
        if (!trimmed || trimmed.startsWith('#')) {
            return;
        }

        // KEY=VALUE 형식 파싱
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();

            // 따옴표 제거
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            env[key] = value;
        }
    });

    return env;
}

/**
 * .env 파일 생성
 */
function generateEnvContent(envData) {
    const lines = [];

    // 헤더 주석
    lines.push('# .env');
    lines.push('# 환경변수 설정 파일');
    lines.push('API_DOMAIN=https://upnexx.ai');
    lines.push('');

    // Freepik API 설정
    lines.push('# =================================');
    lines.push('# Freepik API 설정 (필수)');
    lines.push('# =================================');

    const freepikKeys = Object.entries(envData)
        .filter(([key]) => key.startsWith('FREEPIK_API_KEY'))
        .sort(([a], [b]) => {
            // FREEPIK_API_KEY를 먼저, 그 다음 번호순
            if (a === 'FREEPIK_API_KEY') return -1;
            if (b === 'FREEPIK_API_KEY') return 1;
            return a.localeCompare(b, undefined, { numeric: true });
        });

    freepikKeys.forEach(([key, value]) => {
        lines.push(`${key}=${value}`);
    });

    if (freepikKeys.length === 0) {
        lines.push('# FREEPIK_API_KEY=your_key_here');
    }

    lines.push('');

    // Gemini API 설정
    lines.push('# =================================');
    lines.push('# Gemini AI API 설정 (필수)');
    lines.push('# =================================');

    // 모델 설정
    const geminiModel = envData.GEMINI_MODEL || 'gemini-2.5-flash';
    const fallbackModel = envData.FALLBACK_GEMINI_MODEL || 'gemini-2.5-flash-lite';
    lines.push(`GEMINI_MODEL=${geminiModel}`);
    lines.push(`FALLBACK_GEMINI_MODEL=${fallbackModel}`);
    lines.push('');

    // Gemini API 키들
    const geminiKeys = Object.entries(envData)
        .filter(([key]) => key.startsWith('GEMINI_API_KEY'))
        .sort(([a], [b]) => {
            // GEMINI_API_KEY를 먼저, 그 다음 번호순
            if (a === 'GEMINI_API_KEY') return -1;
            if (b === 'GEMINI_API_KEY') return 1;
            return a.localeCompare(b, undefined, { numeric: true });
        });

    geminiKeys.forEach(([key, value]) => {
        lines.push(`${key}=${value}`);
    });

    if (geminiKeys.length === 0) {
        lines.push('# GEMINI_API_KEY=your_key_here');
    }

    lines.push('');

    // 기타 환경변수들 (Gemini, Freepik 제외)
    const otherVars = Object.entries(envData)
        .filter(([key]) =>
            !key.startsWith('GEMINI_API_KEY') &&
            !key.startsWith('GEMINI_MODEL') &&
            !key.startsWith('FALLBACK_GEMINI_MODEL') &&
            !key.startsWith('FREEPIK_API_KEY') &&
            !key.startsWith('REACT_APP_FREEPIK_API_KEY') &&
            !key.startsWith('VITE_FREEPIK_API_KEY') &&
            key !== 'API_DOMAIN'
        )
        .sort(([a], [b]) => a.localeCompare(b));

    if (otherVars.length > 0) {
        lines.push('# =================================');
        lines.push('# 기타 설정');
        lines.push('# =================================');
        otherVars.forEach(([key, value]) => {
            lines.push(`${key}=${value}`);
        });
    }

    return lines.join('\n');
}

export default async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-username');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const envPath = path.join(process.cwd(), '.env');

    try {
        if (req.method === 'GET') {
            // 현재 API 키 및 모델 설정 조회
            console.log('[api-keys] GET 요청 - 현재 API 키 조회');

            const envData = parseEnvFile(envPath);

            // Gemini 키 수집
            const geminiKeys = [];
            if (envData.GEMINI_API_KEY) {
                geminiKeys.push(envData.GEMINI_API_KEY);
            }
            for (let i = 1; i <= 10; i++) {
                const key = envData[`GEMINI_API_KEY_${i}`];
                if (key) {
                    geminiKeys.push(key);
                }
            }

            // Freepik 키 수집
            const freepikKeys = [];
            if (envData.FREEPIK_API_KEY) {
                freepikKeys.push(envData.FREEPIK_API_KEY);
            }
            for (let i = 1; i <= 10; i++) {
                const key = envData[`FREEPIK_API_KEY_${i}`];
                if (key) {
                    freepikKeys.push(key);
                }
            }

            // 모델 설정
            const geminiModel = envData.GEMINI_MODEL || 'gemini-2.5-flash';
            const fallbackModel = envData.FALLBACK_GEMINI_MODEL || 'gemini-2.5-flash-lite';

            console.log(`[api-keys] 조회 완료: Gemini ${geminiKeys.length}개, Freepik ${freepikKeys.length}개`);

            res.status(200).json({
                success: true,
                data: {
                    geminiKeys: geminiKeys,
                    freepikKeys: freepikKeys,
                    geminiModel: geminiModel,
                    fallbackModel: fallbackModel
                }
            });
        }
        else if (req.method === 'POST') {
            // API 키 저장 및 .env 업데이트
            console.log('[api-keys] POST 요청 - API 키 저장');

            const { geminiKeys, freepikKeys, geminiModel, fallbackModel } = req.body;

            if (!Array.isArray(geminiKeys) || !Array.isArray(freepikKeys)) {
                return res.status(400).json({
                    success: false,
                    error: 'geminiKeys와 freepikKeys는 배열이어야 합니다.'
                });
            }

            // 키 유효성 검증
            const invalidGeminiKeys = geminiKeys.filter(key => !key || typeof key !== 'string' || key.trim().length < 10);
            const invalidFreepikKeys = freepikKeys.filter(key => !key || typeof key !== 'string' || key.trim().length < 10);

            if (invalidGeminiKeys.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: '유효하지 않은 Gemini API 키가 있습니다.'
                });
            }

            if (invalidFreepikKeys.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: '유효하지 않은 Freepik API 키가 있습니다.'
                });
            }

            // 기존 .env 파일 백업
            if (fs.existsSync(envPath)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupPath = path.join(process.cwd(), `.env.backup.${timestamp}`);
                fs.copyFileSync(envPath, backupPath);
                console.log(`[api-keys] .env 백업 생성: ${backupPath}`);
            }

            // 기존 환경변수 로드
            const existingEnv = parseEnvFile(envPath);

            // 새 환경변수 객체 생성
            const newEnv = {
                ...existingEnv
            };

            // 기존 Gemini/Freepik 관련 키 모두 제거
            Object.keys(newEnv).forEach(key => {
                if (key.startsWith('GEMINI_API_KEY') ||
                    key.startsWith('FREEPIK_API_KEY') ||
                    key.startsWith('REACT_APP_FREEPIK_API_KEY') ||
                    key.startsWith('VITE_FREEPIK_API_KEY')) {
                    delete newEnv[key];
                }
            });

            // 새 Gemini 키 추가
            if (geminiKeys.length > 0) {
                newEnv.GEMINI_API_KEY = geminiKeys[0];
                for (let i = 1; i < geminiKeys.length; i++) {
                    newEnv[`GEMINI_API_KEY_${i + 1}`] = geminiKeys[i];
                }
            }

            // 새 Freepik 키 추가
            if (freepikKeys.length > 0) {
                newEnv.FREEPIK_API_KEY = freepikKeys[0];
                for (let i = 1; i < freepikKeys.length; i++) {
                    newEnv[`FREEPIK_API_KEY_${i + 1}`] = freepikKeys[i];
                }
            }

            // 모델 설정 업데이트
            newEnv.GEMINI_MODEL = geminiModel || 'gemini-2.5-flash';
            newEnv.FALLBACK_GEMINI_MODEL = fallbackModel || 'gemini-2.5-flash-lite';

            // .env 파일 생성
            const envContent = generateEnvContent(newEnv);
            fs.writeFileSync(envPath, envContent, 'utf-8');

            console.log('[api-keys] ✅ .env 파일 업데이트 완료');
            console.log(`  - Gemini 키: ${geminiKeys.length}개`);
            console.log(`  - Freepik 키: ${freepikKeys.length}개`);
            console.log(`  - Gemini Model: ${geminiModel}`);
            console.log(`  - Fallback Model: ${fallbackModel}`);

            // 🔥 환경변수 즉시 리로드 및 키 매니저 재초기화
            try {
                await reloadEnvironmentAndKeys();
                console.log('[api-keys] ✅ 환경변수 및 키 매니저 재초기화 완료');
            } catch (reloadError) {
                console.error('[api-keys] ⚠️ 리로드 실패:', reloadError);
            }

            // 🔥 응답 반환
            return res.status(200).json({
                success: true,
                message: 'API 키가 저장되고 즉시 시스템에 반영되었습니다!',
                keysUpdated: {
                    gemini: geminiKeys.length,
                    freepik: freepikKeys.length
                }
            });
        }
        else {
            res.status(405).json({
                success: false,
                error: 'Method not allowed'
            });
        }
    } catch (error) {
        console.error('[api-keys] ❌ API 오류:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

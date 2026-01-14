// api/prompts-versions.js - 프롬프트 버전 및 Gemini 응답 조회 API
import fs from 'fs';
import path from 'path';

const PROMPTS_DIR = path.join(process.cwd(), 'public', 'prompts');

/**
 * GET /api/prompts/versions/:engineId/:promptType
 * 프롬프트 버전 목록 조회
 */
export async function getVersions(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { engineId, promptType } = req.params; // 🔥 path parameter 사용

        if (!engineId || !promptType) {
            return res.status(400).json({
                success: false,
                error: 'engineId와 promptType이 필요합니다.'
            });
        }

        // 버전 디렉토리 경로
        const engineDir = path.join(PROMPTS_DIR, engineId);
        let versionsDir;

        if (promptType === 'manual') {
            versionsDir = path.join(engineDir, 'manual', 'versions');
        } else if (promptType === 'auto_product') {
            versionsDir = path.join(engineDir, 'auto', 'versions');
        } else if (promptType === 'auto_service') {
            versionsDir = path.join(engineDir, 'auto', 'versions');
        } else {
            return res.status(400).json({
                success: false,
                error: '유효하지 않은 promptType입니다.'
            });
        }

        // 디렉토리 존재 확인
        if (!fs.existsSync(versionsDir)) {
            return res.status(200).json({
                success: true,
                versions: []
            });
        }

        // 파일 목록 읽기
        const files = fs.readdirSync(versionsDir)
            .filter(f => {
                // 엄격한 형식 체크: {promptType}_{숫자타입스탬프}.txt
                const regex = new RegExp(`^${promptType}_(\\d+)\\.txt$`);
                return regex.test(f);
            })
            .map(filename => {
                const filePath = path.join(versionsDir, filename);
                const stats = fs.statSync(filePath);

                // 파일명에서 타임스탬프 추출
                const match = filename.match(/_(\d+)\.txt$/);
                const timestamp = parseInt(match[1]);

                return {
                    id: filename.replace('.txt', ''),
                    filename: filename,
                    versionFile: filename, // 🔥 FE restoreVersion에서 요구함
                    timestamp: timestamp,
                    date: new Date(timestamp).toISOString(),
                    size: stats.size
                };
            })
            .sort((a, b) => b.timestamp - a.timestamp); // 최신순

        return res.status(200).json({
            success: true,
            versions: files,
            total: files.length
        });

    } catch (error) {
        console.error('[prompts-versions] 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message || '서버 오류가 발생했습니다.'
        });
    }
}

/**
 * GET /api/prompts/responses/:engineId/:promptType
 * Gemini 응답 목록 조회
 */
export async function getResponses(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { engineId, promptType } = req.params; // 🔥 path parameter 사용

        if (!engineId || !promptType) {
            return res.status(400).json({
                success: false,
                error: 'engineId와 promptType이 필요합니다.'
            });
        }

        // 응답 디렉토리 경로
        const engineDir = path.join(PROMPTS_DIR, engineId);
        let responsesDir;

        if (promptType === 'manual') {
            responsesDir = path.join(engineDir, 'manual', 'responses');
        } else {
            responsesDir = path.join(engineDir, 'auto', 'responses');
        }

        // 디렉토리 존재 확인
        if (!fs.existsSync(responsesDir)) {
            return res.status(200).json({
                success: true,
                responses: []
            });
        }

        const { versionId } = req.query; // 🔥 v4.3: 쿼리에서 versionId 가져오기
        let targetTimestamp = null;
        if (versionId) {
            const match = versionId.match(/_(\d+)$/);
            if (match) {
                targetTimestamp = parseInt(match[1]);
            }
        }

        // JSON 파일 목록 읽기
        const files = fs.readdirSync(responsesDir)
            .filter(f => {
                // 🔥 완화된 필터링: engineId와 promptType 포함 여부만 체크
                // 파일명 예: seedream-v4_kling-v2-5-pro_auto_product_storyboard_storyboard_unified_1768365941115.json
                const isJson = f.endsWith('.json');
                const hasEngineId = f.includes(engineId);
                const hasPromptType = f.includes(promptType);
                return isJson && hasEngineId && hasPromptType;
            })
            .map(filename => {
                const filePath = path.join(responsesDir, filename);
                const stats = fs.statSync(filePath);

                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(content);

                    // 🔥 v4.3: 필터링 로직 - versionId가 있으면 해당 타임스탬프와 일치해야 함
                    const promptVersionTimestamp = data.formData?.promptVersionTimestamp || null;
                    if (targetTimestamp && promptVersionTimestamp !== targetTimestamp) {
                        return null;
                    }

                    return {
                        id: filename.replace('.json', ''),
                        fileName: filename,
                        timestamp: data.timestamp || stats.mtimeMs,
                        promptVersionTimestamp: promptVersionTimestamp, // 🔥 버전 종속성 정보
                        date: data.savedAt || new Date(stats.mtimeMs).toISOString(),
                        formData: data.formData || {},
                        promptKey: data.promptKey || '',
                        step: data.step || '',
                        size: stats.size
                    };
                } catch (err) {
                    console.error(`[prompts-versions] JSON 파싱 실패: ${filename}`, err);
                    return null;
                }
            })
            .filter(item => item !== null)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // 최신순

        return res.status(200).json({
            success: true,
            responses: files,
            total: files.length
        });

    } catch (error) {
        console.error('[prompts-versions] 응답 조회 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message || '서버 오류가 발생했습니다.'
        });
    }
}

/**
 * GET /api/prompts/version-content/:engineId/:promptType/:versionId
 * 특정 버전의 프롬프트 내용 조회
 */
export async function getVersionContent(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { engineId, promptType, versionId } = req.params; // 🔥 path parameter 사용

        if (!engineId || !promptType || !versionId) {
            return res.status(400).json({
                success: false,
                error: '필수 파라미터가 누락되었습니다.'
            });
        }

        // 버전 파일 경로
        const engineDir = path.join(PROMPTS_DIR, engineId);
        let versionsDir;

        if (promptType === 'manual') {
            versionsDir = path.join(engineDir, 'manual', 'versions');
        } else {
            versionsDir = path.join(engineDir, 'auto', 'versions');
        }

        const versionFile = path.join(versionsDir, `${versionId}.txt`);

        if (!fs.existsSync(versionFile)) {
            return res.status(404).json({
                success: false,
                error: '버전 파일을 찾을 수 없습니다.'
            });
        }

        const content = fs.readFileSync(versionFile, 'utf8');

        return res.status(200).json({
            success: true,
            detail: content, // 🔥 AdminPanel에서 detail을 기대할 수 있음 (일관성)
            content: content,
            versionId: versionId
        });

    } catch (error) {
        console.error('[prompts-versions] 버전 내용 조회 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message || '서버 오류가 발생했습니다.'
        });
    }
}

/**
 * GET /api/prompts/response-content/:engineId/:promptType/:responseId
 * 특정 응답의 내용 조회
 */
export async function getResponseContent(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { engineId, promptType, responseId } = req.params; // 🔥 path parameter 사용

        if (!engineId || !promptType || !responseId) {
            return res.status(400).json({
                success: false,
                error: '필수 파라미터가 누락되었습니다.'
            });
        }

        // 응답 파일 경로
        const engineDir = path.join(PROMPTS_DIR, engineId);
        let responsesDir;

        if (promptType === 'manual') {
            responsesDir = path.join(engineDir, 'manual', 'responses');
        } else {
            responsesDir = path.join(engineDir, 'auto', 'responses');
        }

        const responseFile = path.join(responsesDir, `${responseId}.json`);

        if (!fs.existsSync(responseFile)) {
            return res.status(404).json({
                success: false,
                error: '응답 파일을 찾을 수 없습니다.'
            });
        }

        const content = fs.readFileSync(responseFile, 'utf8');
        const data = JSON.parse(content);

        return res.status(200).json({
            success: true,
            detail: data, // 🔥 AdminPanel.jsx #L616에서 data.detail을 기대함
            data: data,
            responseId: responseId
        });

    } catch (error) {
        console.error('[prompts-versions] 응답 내용 조회 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message || '서버 오류가 발생했습니다.'
        });
    }
}

// api/storyboard-manual-inject.js
import { parseUnifiedConceptJSON, extractJSONBlocks } from './storyboard-init.js';
import sessionStore from '../server/utils/sessionStore.js';
import path from 'path';
import fs from 'fs';

/**
 * Section 3 (Audio & Editing Guide) 파싱
 * BGM, SFX, Editing Pace 정보 추출
 */
function parseAudioEditingGuide(text) {
    try {
        // Section 3 찾기
        const section3Pattern = /🎵\s*Section\s*3[.:]?\s*Audio\s*&\s*Editing\s*Guide/i;
        const section3Match = text.match(section3Pattern);

        if (!section3Match) {
            console.log('[parseAudioEditingGuide] Section 3을 찾을 수 없음');
            return null;
        }

        const section3StartIdx = section3Match.index;
        // Section 4 또는 문서 끝까지
        const section4Pattern = /✍️\s*Section\s*4/i;
        const section4Match = text.substring(section3StartIdx).match(section4Pattern);
        const section3EndIdx = section4Match
            ? section3StartIdx + section4Match.index
            : text.length;

        const section3Text = text.substring(section3StartIdx, section3EndIdx);

        // BGM 추출
        const bgmMatch = section3Text.match(/BGM:\s*(.+?)(?=\n\n|SFX:|Editing|$)/s);
        const bgm = bgmMatch ? bgmMatch[1].trim().replace(/\n/g, ' ') : '';

        // SFX 추출 (여러 줄 가능)
        const sfxMatch = section3Text.match(/SFX:\s*(.+?)(?=\n\n|Editing|$)/s);
        const sfx = sfxMatch ? sfxMatch[1].trim() : '';

        // Editing Pace 추출
        const editingMatch = section3Text.match(/Editing\s*(?:Pace)?:\s*(.+?)(?=\n\n|$)/s);
        const editing = editingMatch ? editingMatch[1].trim().replace(/\n/g, ' ') : '';

        const result = {
            bgm: bgm || '정보 없음',
            sfx: sfx || '정보 없음',
            editing: editing || '정보 없음',
            rawSection3: section3Text.substring(0, 500) // 디버깅용
        };

        console.log('[parseAudioEditingGuide] ✅ 파싱 성공:', result);
        return result;

    } catch (error) {
        console.error('[parseAudioEditingGuide] ❌ 오류:', error);
        return null;
    }
}

export const config = {
    maxDuration: 9000,
};

const API_BASE = process.env.VITE_API_BASE_URL
    ? (process.env.VITE_API_BASE_URL.startsWith('http')
        ? process.env.VITE_API_BASE_URL
        : `https://upnexx.ai${process.env.VITE_API_BASE_URL}`)
    : 'http://localhost:3000';

function mapAspectRatio(input) {
    if (!input) return 'widescreen_16_9';
    const normalized = String(input).toLowerCase().trim();
    if (normalized.includes('16:9') || normalized.includes('16_9') || normalized === '가로') return 'widescreen_16_9';
    if (normalized.includes('9:16') || normalized.includes('9_16') || normalized === '세로') return 'portrait_9_16';
    if (normalized.includes('1:1') || normalized.includes('1_1') || normalized === '정사각형') return 'square_1_1';
    return 'widescreen_16_9';
}

function getSceneCount(videoLength) {
    const lengthStr = String(videoLength).replace(/[^0-9]/g, '');
    const length = parseInt(lengthStr, 10);
    if (length <= 5) return 3;
    if (length <= 10) return 5;
    if (length <= 20) return 10;
    return 15;
}

function calculateProgress(phase, stepProgress = 0) {
    const phases = {
        GEMINI: { start: 0, weight: 20 },   // 0-20%
        IMAGE: { start: 20, weight: 80 }    // 20-100%
    };
    const phaseInfo = phases[phase];
    if (!phaseInfo) return 0;
    return Math.floor(phaseInfo.start + (phaseInfo.weight * stepProgress / 100));
}

async function updateSession(sessionId, updateData) {
    try {
        if (updateData.progress) {
            sessionStore.updateProgress(sessionId, updateData.progress);
        }
        if (updateData.status) {
            sessionStore.updateStatus(sessionId, updateData.status, updateData.result, updateData.error);
        }
        return true;
    } catch (error) {
        console.error('[updateSession] Error:', error);
        return false;
    }
}

async function generateImage(imagePrompt, sceneNumber, conceptId, username, projectId, maxRetries = 3, personUrl = null) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[generateImage] 씬 ${sceneNumber} 시도 ${attempt}/${maxRetries}`);

            const response = await fetch(`${API_BASE}/api/storyboard-render-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-username': username
                },
                body: JSON.stringify({
                    imagePrompt,
                    sceneNumber,
                    conceptId,
                    projectId,
                    personUrl
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();

            const imageUrl = result.url;

            if (result.fallback === true || !imageUrl || imageUrl.includes('via.placeholder.com')) {
                console.log(`[generateImage] ⚠️ 씬 ${sceneNumber} fallback 이미지 감지 - 재시도 필요`);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
                    continue;
                }
                throw new Error('이미지 생성 실패 (fallback)');
            }

            if (!result.success || !imageUrl) throw new Error('이미지 생성 실패');

            console.log(`[generateImage] ✅ 씬 ${sceneNumber} 성공`);
            return imageUrl;

        } catch (error) {
            console.error(`[generateImage] ❌ 씬 ${sceneNumber} 시도 ${attempt} 실패:`, error.message);
            if (attempt >= maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
        }
    }
    throw new Error('이미지 생성 최대 재시도 초과');
}

async function processManualStoryboard(mcJson, formData, username, sessionId) {
    const startTime = Date.now();

    try {
        const { videoPurpose, videoLength, aspectRatio, aspectRatioCode, mode, personSelection } = formData;

        await updateSession(sessionId, {
            progress: {
                phase: 'IMAGE',
                percentage: calculateProgress('IMAGE', 0),
                currentStep: '이미지 생성 준비 중...'
            }
        });

        const styles = [];

        for (let conceptIdx = 0; conceptIdx < mcJson.concepts.length; conceptIdx++) {
            const concept = mcJson.concepts[conceptIdx];
            const images = [];

            // 실제 파싱된 씬 개수 동적 감지 (manual 모드 대응)
            const sceneKeys = Object.keys(concept).filter(key => key.startsWith('scene_'));
            const actualSceneCount = sceneKeys.length;
            console.log(`[manual-inject] 컨셉 ${conceptIdx + 1}: ${actualSceneCount}개 씬 감지`);

            // 🔥 씬별 생성 결과 추적
            const sceneResults = new Map(); // sceneNum -> { success: boolean, data: object }

            // 🔥 1차 시도: 모든 씬 생성
            for (let sceneNum = 1; sceneNum <= actualSceneCount; sceneNum++) {
                const sceneKey = `scene_${sceneNum}`;
                const scene = concept[sceneKey];
                if (!scene) {
                    console.warn(`[manual-inject] ⚠️ ${sceneKey} 누락 - 건너뜀`);
                    sceneResults.set(sceneNum, { success: false, error: '씬 데이터 없음' });
                    continue;
                }

                try {
                    const imagePrompt = {
                        ...scene.image_prompt,
                        aspect_ratio: mapAspectRatio(scene.image_prompt?.aspect_ratio || aspectRatioCode || 'widescreen_16_9')
                    };

                    const imageUrl = await generateImage(imagePrompt, sceneNum, conceptIdx + 1, username, formData.projectId, 3, personSelection);
                    console.log(`[manual-inject] 🖼️ 씬 ${sceneNum} 이미지 생성 완료`);

                    sceneResults.set(sceneNum, {
                        success: true,
                        data: {
                            sceneNumber: sceneNum,
                            imageUrl: imageUrl,
                            videoUrl: null,
                            title: scene.title || `씬 ${sceneNum}`,
                            prompt: scene.image_prompt?.prompt || '',
                            motionPrompt: scene.motion_prompt,
                            copy: scene.copy?.copy || '',
                            status: 'image_done'
                        }
                    });

                    const progress = ((conceptIdx * actualSceneCount + sceneNum) / (mcJson.concepts.length * actualSceneCount)) * 100;
                    await updateSession(sessionId, {
                        progress: {
                            phase: 'IMAGE',
                            percentage: calculateProgress('IMAGE', progress),
                            currentStep: `이미지 ${sceneNum}/${actualSceneCount} 생성 완료 (컨셉 ${conceptIdx + 1})`
                        }
                    });
                } catch (error) {
                    console.error(`이미지 생성 실패 (씬 ${sceneNum}):`, error);
                    sceneResults.set(sceneNum, {
                        success: false,
                        error: error.message,
                        scene: scene
                    });
                }
            }

            // 🔥 실패한 씬 재시도 (최대 2회)
            const failedScenes = Array.from(sceneResults.entries())
                .filter(([_, result]) => !result.success)
                .map(([sceneNum, _]) => sceneNum);

            if (failedScenes.length > 0) {
                console.log(`[manual-inject] 🔄 실패한 씬 재시도: ${failedScenes.join(', ')}`);

                for (const sceneNum of failedScenes) {
                    const sceneKey = `scene_${sceneNum}`;
                    const scene = concept[sceneKey];
                    if (!scene) continue;

                    for (let retryAttempt = 1; retryAttempt <= 2; retryAttempt++) {
                        try {
                            console.log(`[manual-inject] 🔁 씬 ${sceneNum} 재시도 ${retryAttempt}/2`);

                            const imagePrompt = {
                                ...scene.image_prompt,
                                aspect_ratio: mapAspectRatio(scene.image_prompt?.aspect_ratio || aspectRatioCode || 'widescreen_16_9')
                            };

                            const imageUrl = await generateImage(imagePrompt, sceneNum, conceptIdx + 1, username, formData.projectId, 3, personSelection);

                            sceneResults.set(sceneNum, {
                                success: true,
                                data: {
                                    sceneNumber: sceneNum,
                                    imageUrl: imageUrl,
                                    videoUrl: null,
                                    title: scene.title || `씬 ${sceneNum}`,
                                    prompt: scene.image_prompt?.prompt || '',
                                    motionPrompt: scene.motion_prompt,
                                    copy: scene.copy?.copy || '',
                                    status: 'image_done'
                                }
                            });

                            console.log(`[manual-inject] ✅ 씬 ${sceneNum} 재시도 성공`);
                            break; // 성공 시 더 이상 재시도 안 함

                        } catch (retryError) {
                            console.error(`[manual-inject] ❌ 씬 ${sceneNum} 재시도 ${retryAttempt} 실패:`, retryError.message);
                            if (retryAttempt === 2) {
                                // 최종 실패
                                sceneResults.set(sceneNum, {
                                    success: false,
                                    error: retryError.message
                                });
                            }
                            await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기
                        }
                    }
                }
            }

            // 🔥 최종 이미지 배열 생성 (순서 보장, 누락 표시)
            for (let sceneNum = 1; sceneNum <= actualSceneCount; sceneNum++) {
                const result = sceneResults.get(sceneNum);
                if (result && result.success) {
                    images.push(result.data);
                } else {
                    // 누락된 씬 명시적 표시
                    console.warn(`[manual-inject] ⚠️ 씬 ${sceneNum} 최종 실패 - 플레이스홀더 추가`);
                    images.push({
                        sceneNumber: sceneNum,
                        imageUrl: null,
                        videoUrl: null,
                        title: `씬 ${sceneNum} (생성 실패)`,
                        status: 'image_failed',
                        error: result?.error || '알 수 없는 오류'
                    });
                }
            }

            styles.push({
                id: conceptIdx + 1,
                conceptId: conceptIdx + 1,
                conceptName: concept.concept_name,
                big_idea: concept.big_idea || '',
                style: concept.style || '',
                images: images
            });
        }

        await updateSession(sessionId, {
            progress: {
                phase: 'IMAGE',
                percentage: 100,
                currentStep: `모든 이미지 생성 완료 (${styles.length}개 컨셉)`
            }
        });

        const totalImages = styles.reduce((sum, s) => sum + s.images.length, 0);

        // Section 3 (Audio & Editing Guide) 파싱
        const audioEditingGuide = parseAudioEditingGuide(formData.originalGeminiResponse || '');

        const metadata = {
            mode: mode || 'auto',
            videoPurpose,
            videoLength,
            aspectRatio: mapAspectRatio(aspectRatio || aspectRatioCode),
            generatedAt: new Date().toISOString(),
            processingTimeMs: Date.now() - startTime,
            totalConcepts: styles.length,
            totalImages: totalImages,
            workflowMode: 'manual_injection',
            audioEditingGuide: audioEditingGuide // Section 3 정보 추가
        };

        const finalStoryboard = {
            success: true,
            styles,
            finalVideos: [],
            imageSetMode: true,
            metadata,
            processingTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };

        await updateSession(sessionId, {
            status: 'completed',
            progress: {
                phase: 'COMPLETE',
                percentage: 100,
                currentStep: `✅ 이미지 세트 생성 완료! ${totalImages}개 이미지 (${styles.length}개 컨셉)`
            },
            result: finalStoryboard
        });

        console.log('[manual-inject] ✅ 수동 입력 처리 완료');

    } catch (error) {
        console.error('[manual-inject] ❌ 오류 발생:', error);
        await updateSession(sessionId, {
            status: 'error',
            error: { message: error.message || '오류 발생', stack: error.stack },
            progress: {
                phase: 'ERROR',
                percentage: 0,
                currentStep: '오류: ' + (error.message || '알 수 없는 오류')
            }
        });
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { manualGeminiResponse, formData, sessionId } = req.body;
        const username = req.headers['x-username'] || 'anonymous';

        if (!manualGeminiResponse || !formData || !sessionId) {
            return res.status(400).json({
                success: false,
                error: '필수 파라미터 누락 (manualGeminiResponse, formData, sessionId)'
            });
        }

        // formData에 원본 Gemini 응답 저장 (Section 3 파싱용)
        formData.originalGeminiResponse = manualGeminiResponse;

        // 기존 parseUnifiedConceptJSON 재사용
        const mcJson = parseUnifiedConceptJSON(manualGeminiResponse, formData.mode);

        if (!mcJson || !mcJson.concepts || mcJson.concepts.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Gemini 응답 파싱 실패 - concepts 배열이 없거나 비어있음'
            });
        }

        console.log(`[manual-inject] ✅ 파싱 성공: ${mcJson.concepts.length}개 컨셉`);

        // 세션 생성
        let session = sessionStore.getSession(sessionId);
        if (!session) {
            sessionStore.createSession(sessionId, {
                username: username,
                formData: formData,
                manualMode: true,
                startedAt: Date.now()
            });
        }

        res.status(202).json({
            success: true,
            sessionId: sessionId,
            message: '🔧 수동 프롬프트 처리 시작'
        });

        // 백그라운드 처리
        processManualStoryboard(mcJson, formData, username, sessionId).catch(err => {
            console.error('[manual-inject] 백그라운드 처리 실패:', err);
        });

    } catch (error) {
        console.error('[manual-inject] ❌ 요청 처리 실패:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

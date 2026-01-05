// api/convert-single-scene.js - 단일 씬 영상 변환 API (Kling AI Integration)
// FFmpeg Simple Zoom 제거 -> Freepik Kling AI Engine 연동
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { uploadVideoToS3 } from '../server/utils/s3-uploader.js';
import { safeCallFreepik } from '../src/utils/apiHelpers.js';
import { getImageToVideoUrl, getImageToVideoStatusUrl, getImageToVideoEngine } from '../src/utils/engineConfigLoader.js'; // 🔥 Restore dynamic loader

const POLLING_TIMEOUT = 300000; // 5분 (비디오 생성은 오래 걸림)
const POLLING_INTERVAL = 5000; // 5초 간격

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function pollVideoStatus(taskId) {
    const startTime = Date.now();

    while (Date.now() - startTime < POLLING_TIMEOUT) {
        try {
            // 엔진 설정에서 동적 상태 URL 가져오기
            const url = getImageToVideoStatusUrl(taskId);

            const result = await safeCallFreepik(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            }, 'kling-video', `status-${taskId}`);

            if (result && result.data) {
                const { status, generated } = result.data;
                console.log(`[Kling] Task ${taskId} Status: ${status}`);

                if (status === 'COMPLETED') {
                    if (generated && generated.length > 0) {
                        return generated[0].url; // 최종 비디오 URL
                    }
                    throw new Error('STATUS=COMPLETED but no video URL returned');
                } else if (status === 'FAILED') {
                    throw new Error('Kling A.I. generation failed');
                }

                await sleep(POLLING_INTERVAL);
            } else {
                throw new Error('Invalid status response from Freepik');
            }

        } catch (err) {
            console.error(`[Kling] Polling error: ${err.message}`);
            if (Date.now() - startTime > POLLING_TIMEOUT) throw err;
            await sleep(POLLING_INTERVAL);
        }
    }
    throw new Error('Video generation timed out');
}

// 🔥 FFmpeg 실행 (Helper)
function runFFmpeg(args, label = 'ffmpeg', workingDir = null) {
    return new Promise((resolve, reject) => {
        console.log(`[${label}] 실행: ffmpeg ${args.join(' ')}`);
        const process = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        process.stderr.on('data', d => stderr += d.toString());

        process.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg failed: ${stderr.slice(-200)}`));
        });
        process.on('error', reject);
    });
}

// 🔥 비디오 길이 조정 함수
async function trimVideo(inputPath, outputPath, targetDuration) {
    await runFFmpeg([
        '-y', '-i', inputPath,
        '-t', targetDuration.toString(),
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
        '-c:a', 'aac', // Audio copy or re-encode
        '-movflags', '+faststart',
        outputPath
    ], 'trim');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // timeout 증가
    res.setTimeout(300000); // 5분

    const { imageUrl, sceneNumber, projectId, conceptId, prompt, motionPrompt, duration = 5 } = req.body; // duration comes from frontend now

    try {
        // 1. 엔진 설정 로드 (Dynamic Configuration)
        const engineConfig = getImageToVideoEngine();
        const createUrl = getImageToVideoUrl();
        const defaultParams = engineConfig.parameters || {};

        console.log('[convert-single-scene] AI Video Request:', {
            sceneNumber,
            promptLength: prompt?.length,
            hasMotion: !!motionPrompt,
            engine: engineConfig.displayName || 'Unknown Engine',
            targetDuration: duration
        });

        // 프롬프트 구성 (Scene Description + Motion)
        let finalPrompt = prompt || 'Cinematic shot, high quality';
        if (motionPrompt && motionPrompt.description) {
            finalPrompt += `, ${motionPrompt.description}`;
        }
        finalPrompt += ", high quality, 4k, fluid motion, physically accurate";

        // Clamp prompt
        if (finalPrompt.length > 2000) finalPrompt = finalPrompt.slice(0, 1900);

        // 🔥 CRITICAL: Duration Type Casting (Must be String '5')
        // User Requirement: Always request '5's from Kling. Trimming handles the rest (e.g. 2s).
        const klingDuration = '5';

        const payload = {
            ...defaultParams, // 🔥 engines.json의 기본 파라미터 적용 (cfg_scale 등)
            webhook_url: null,
            image: imageUrl,
            prompt: finalPrompt,
            negative_prompt: defaultParams.negative_prompt || "blurry, distorted, low quality, morphing, glitch",
            duration: klingDuration // 🔥 '5' or '10'
        };

        // Undefined/null 제거
        Object.keys(payload).forEach(key => {
            if (payload[key] === undefined || payload[key] === null) {
                delete payload[key];
            }
        });

        console.log('[convert-single-scene] Calling Dynamic Engine:', {
            model: engineConfig.model,
            url: createUrl,
            duration: payload.duration,
            type: typeof payload.duration
        });

        // 2. 태스크 생성 요청 (SafeCallFreepik 복구 - Dynamic Endpoint)
        const createResult = await safeCallFreepik(createUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        }, 'kling-video', 'create');

        if (!createResult?.data?.task_id) {
            throw new Error('Failed to create AI video task');
        }

        // 3. Task ID 반환 (Polling 제거 - Frontend Async 처리)
        // Infinite Loop 방지 및 Browser Timeout 방지
        const taskId = createResult.data.task_id;
        console.log(`[convert-single-scene] Task Created: ${taskId} (Async Handoff)`);

        return res.json({
            success: true,
            processing: true, // Frontend signal to start polling
            taskId: taskId,
            sceneNumber: sceneNumber,
            targetDuration: payload.duration, // Trimming target
            projectId,
            conceptId
        });

        // Polling 및 S3 Upload 로직은 'check-video-status' API로 이관됨.
    } catch (error) {
        console.error('[convert-single-scene] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// api/convert-single-scene.js - 단일 씬 영상 변환 API (Kling AI Integration)
// FFmpeg Simple Zoom 제거 -> Freepik Kling AI Engine 연동
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { uploadVideoToS3 } from '../server/utils/s3-uploader.js';
import { safeCallFreepik } from '../src/utils/apiHelpers.js';
import { getImageToVideoUrl, getImageToVideoStatusUrl } from '../src/utils/engineConfigLoader.js';

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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // timeout 증가
    res.setTimeout(300000); // 5분

    const { imageUrl, sceneNumber, projectId, conceptId, prompt, motionPrompt, duration = 5 } = req.body;

    console.log('[convert-single-scene] AI Video Request:', {
        sceneNumber,
        promptLength: prompt?.length,
        hasMotion: !!motionPrompt,
        engine: 'Kling v2.1 Pro',
        imageUrlPreview: imageUrl?.substring(0, 50),
        isS3: imageUrl?.includes('upnexx') || imageUrl?.includes('s3') // Check origin
    });

    if (!imageUrl || !sceneNumber) {
        return res.status(400).json({ error: 'imageUrl and sceneNumber required' });
    }

    try {
        // 1. 요청 페이로드 구성
        const apiKey = process.env.FREEPIK_API_KEY || process.env.REACT_APP_FREEPIK_API_KEY || process.env.VITE_FREEPIK_API_KEY;
        if (!apiKey) throw new Error('Freepik API key not found');

        // 프롬프트 구성 (Scene Description + Motion)
        let finalPrompt = prompt || 'Cinematic shot, high quality';
        if (motionPrompt && motionPrompt.description) {
            finalPrompt += `, ${motionPrompt.description}`;
        }
        finalPrompt += ", high quality, 4k, fluid motion, physically accurate";
        // Clamp prompt like generate-video.js
        if (finalPrompt.length > 2000) finalPrompt = finalPrompt.slice(0, 1900);

        const payload = {
            webhook_url: null,
            image: imageUrl,
            prompt: finalPrompt,
            negative_prompt: "blurry, distorted, low quality, morphing, glitch",
            duration: 5
        };

        // Undefined/null 제거 (generate-video.js와 동일 산식)
        Object.keys(payload).forEach(key => {
            if (payload[key] === undefined || payload[key] === null) {
                delete payload[key];
            }
        });

        console.log('[convert-single-scene] Calling Kling v2.1 Pro directly:', {
            url: 'https://api.freepik.com/v1/ai/image-to-video/kling-v2-1-pro',
            payloadKeys: Object.keys(payload)
        });

        // 2. 태스크 생성 요청 (Direct Fetch to bypass Config/Helper)
        const response = await fetch('https://api.freepik.com/v1/ai/image-to-video/kling-v2-1-pro', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-freepik-api-key': apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[convert-single-scene] Freepik API Error:', response.status, errText);
            throw new Error(`Video API failed ${response.status}: ${errText}`);
        }

        const createResult = await response.json();

        if (!createResult?.data?.task_id) {
            throw new Error('Failed to create AI video task');
        }

        const taskId = createResult.data.task_id;
        console.log(`[convert-single-scene] Task Created: ${taskId}`);

        // 3. 폴링 (Sync-like behavior)
        const engineVideoUrl = await pollVideoStatus(taskId);
        console.log(`[convert-single-scene] Generation Success: ${engineVideoUrl}`);

        // 4. S3 업로드 (영구 보관)
        const filename = `scene_${sceneNumber}_kling_${Date.now()}.mp4`;
        // Kling URL을 다운로드해서 S3에 업로드? -> uploadVideoToS3는 로컬 경로를 받음.
        // 하지만 여기선 URL to S3 Stream이 효율적.
        // 기존 uploadVideoToS3가 로컬파일만 지원한다면 다운로드 필요.

        // 임시 다운로드
        const tempDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilePath = path.join(tempDir, filename);

        // 다운로드
        const vidRes = await fetch(engineVideoUrl);
        const buffer = Buffer.from(await vidRes.arrayBuffer());
        fs.writeFileSync(tempFilePath, buffer);

        // 업로드
        const s3Url = await uploadVideoToS3(tempFilePath, projectId || 'unknown', conceptId || 'unknown', filename.replace('.mp4', ''));

        // 정리
        fs.unlinkSync(tempFilePath);

        console.log(`[convert-single-scene] S3 Uploaded: ${s3Url}`);

        return res.json({
            success: true,
            videoUrl: s3Url,
            sceneNumber: sceneNumber,
            duration: 5,
            engine: 'kling-v2-1-pro'
        });

    } catch (error) {
        console.error('[convert-single-scene] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

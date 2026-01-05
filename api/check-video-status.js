// api/check-video-status.js - 비디오 생성 상태 조회 및 후처리 (Trimming) API
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { uploadVideoToS3 } from '../server/utils/s3-uploader.js';
import { safeCallFreepik } from '../src/utils/apiHelpers.js';
import { getImageToVideoStatusUrl } from '../src/utils/engineConfigLoader.js';

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
        '-c:a', 'aac',
        '-movflags', '+faststart',
        outputPath
    ], 'trim');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { taskId, sceneNumber, targetDuration, projectId, conceptId } = req.body;

    if (!taskId) {
        return res.status(400).json({ error: 'taskId required' });
    }

    try {
        const statusUrl = getImageToVideoStatusUrl(taskId);

        const result = await safeCallFreepik(statusUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            silent: true // 🔥 Reduce Log Noise
        }, 'kling-video', `status-${taskId}`);

        if (!result || !result.data) {
            throw new Error('Invalid status response from Freepik');
        }

        const { status, generated } = result.data;
        console.log(`[check-video-status] Task ${taskId} Status: ${status}`);

        if (status === 'IN_PROGRESS' || status === 'PENDING') {
            return res.status(202).json({
                status: 'processing',
                message: 'Video is generating...'
            });
        }

        if (status === 'FAILED') {
            return res.status(500).json({ error: 'Generation failed at provider' });
        }

        if (status === 'COMPLETED') {
            if (!generated || generated.length === 0) {
                throw new Error('Completed but no video URL');
            }

            const engineVideoUrl = generated[0].url;
            console.log(`[check-video-status] Generation Success (Engine): ${engineVideoUrl}`);

            // 🔥 후처리: Download -> Trim -> Upload
            const tempDir = path.join(process.cwd(), 'tmp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            const filename = `scene_${sceneNumber}_kling_${Date.now()}.mp4`;
            const tempFilePath = path.join(tempDir, filename);

            // 다운로드
            const vidRes = await fetch(engineVideoUrl);
            const buffer = Buffer.from(await vidRes.arrayBuffer());
            fs.writeFileSync(tempFilePath, buffer);

            let finalPath = tempFilePath;
            let finalDuration = 5; // Engine default

            // 🔥 Trimming Logic
            const requestedDuration = parseFloat(targetDuration);
            if (requestedDuration > 0 && requestedDuration < 5) {
                const trimmedFilename = `trimmed_${filename}`;
                const trimmedPath = path.join(tempDir, trimmedFilename);

                console.log(`[check-video-status] Trimming video: 5s -> ${requestedDuration}s`);
                await trimVideo(tempFilePath, trimmedPath, requestedDuration);

                finalPath = trimmedPath;
                finalDuration = requestedDuration;
            }

            // S3 업로드
            const s3Url = await uploadVideoToS3(finalPath, projectId || 'unknown', conceptId || 'unknown', filename.replace('.mp4', ''));

            // 정리
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            if (finalPath !== tempFilePath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath);

            console.log(`[check-video-status] Final Processed URL: ${s3Url}`);

            return res.status(200).json({
                status: 'completed',
                videoUrl: s3Url,
                duration: finalDuration
            });
        }

        return res.status(200).json({ status: status }); // Unknown status

    } catch (error) {
        console.error('[check-video-status] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// api/convert-single-scene.js - 단일 씬 영상 변환 API
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { uploadVideoToS3 } from '../server/utils/s3-uploader.js';

const FFMPEG_TIMEOUT = 60000; // 1분

async function downloadImage(imageUrl, outputPath) {
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Image download failed: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
}

function runFFmpeg(args) {
    return new Promise((resolve, reject) => {
        console.log(`[convert-single-scene] FFmpeg: ${args.join(' ')}`);

        const process = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

        let stderr = '';

        if (process.stdin) {
            process.stdin.end();
        }

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        const timeout = setTimeout(() => {
            process.kill('SIGKILL');
            reject(new Error('FFmpeg timeout'));
        }, FFMPEG_TIMEOUT);

        process.on('close', (code) => {
            clearTimeout(timeout);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
            }
        });

        process.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { imageUrl, sceneNumber, projectId, conceptId, duration = 3 } = req.body;

    console.log('[convert-single-scene] 요청:', { imageUrl, sceneNumber, projectId, conceptId, duration });

    if (!imageUrl || !sceneNumber) {
        return res.status(400).json({ error: 'imageUrl and sceneNumber required' });
    }

    const tempDir = path.join(process.cwd(), 'tmp', `scene_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);

    try {
        // 1. 임시 디렉토리 생성
        fs.mkdirSync(tempDir, { recursive: true });
        console.log('[convert-single-scene] 임시 디렉토리:', tempDir);

        // 2. 이미지 다운로드
        const imagePath = path.join(tempDir, 'input.jpg');
        await downloadImage(imageUrl, imagePath);
        console.log('[convert-single-scene] 이미지 다운로드 완료');

        // 3. 이미지 → 영상 변환 (간단한 줌 효과)
        const outputPath = path.join(tempDir, 'output.mp4');

        await runFFmpeg([
            '-loop', '1',
            '-i', imagePath,
            '-vf', `scale=1920:1080,zoompan=z='min(zoom+0.0015,1.5)':d=${duration * 25}:s=1920x1080:fps=25`,
            '-c:v', 'libx264',
            '-t', String(duration),
            '-pix_fmt', 'yuv420p',
            '-y',
            outputPath
        ]);

        console.log('[convert-single-scene] 영상 변환 완료');

        // 4. S3 업로드
        const filename = `scene_${sceneNumber}_${Date.now()}`;
        const videoUrl = await uploadVideoToS3(
            outputPath,
            projectId || 'unknown',
            conceptId || 'unknown',
            filename
        );

        console.log('[convert-single-scene] S3 업로드 완료:', videoUrl);

        // 5. 임시 파일 정리
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.warn('[convert-single-scene] 정리 실패:', cleanupError.message);
        }

        return res.json({
            success: true,
            videoUrl: videoUrl,
            sceneNumber: sceneNumber,
            duration: duration
        });

    } catch (error) {
        console.error('[convert-single-scene] 오류:', error);

        // 임시 파일 정리
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } catch (cleanupError) {
            console.warn('[convert-single-scene] 정리 실패:', cleanupError.message);
        }

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

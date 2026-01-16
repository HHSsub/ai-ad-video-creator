// api/seedream-compose.js - V10.0 "Bulletproof" Protocol
import { safeCallFreepik } from '../src/utils/apiHelpers.js';
import { getTextToImageUrl, getTextToImageStatusUrl } from '../src/utils/engineConfigLoader.js';
import { uploadBase64ToS3 } from '../server/utils/s3-uploader.js';
import sharp from 'sharp';
import fetch from 'node-fetch';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchImageBuffer(source) {
    if (!source) throw new Error("Image source is empty");
    try {
        if (source.startsWith('http')) {
            const res = await fetch(source);
            if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
            return Buffer.from(await res.arrayBuffer());
        }
        const base64Clean = source.replace(/^data:image\/\w+;base64,/, "");
        return Buffer.from(base64Clean, 'base64');
    } catch (err) {
        throw new Error(`Buffer Fetch Error: ${err.message}`);
    }
}

// [STAGE 1] 정밀 Scissors (누끼 따기)
async function isolateSubject(buffer) {
    console.log(`[Stage 1] Isolating subject...`);
    try {
        // 이미지 유효성 선검사 및 PNG 강제 변환
        const image = sharp(buffer).ensureAlpha();
        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

        const threshold = 245; // 흰색 배경 감지 강화
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > threshold && data[i + 1] > threshold && data[i + 2] > threshold) {
                data[i + 3] = 0; // 배경 날리기
            }
        }
        return await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
            .png().trim().toBuffer();
    } catch (err) {
        console.error('[Stage 1] Failed, using raw buffer:', err);
        return await sharp(buffer).png().trim().toBuffer();
    }
}

// [API WRAPPER]
async function callSeedreamInpaint({ imageBuffer, maskBuffer, prompt, strength, label }) {
    const url = getTextToImageUrl();
    const payload = {
        prompt: prompt,
        negative_prompt: "artifacts, low quality, distortion, unwanted objects, deformed",
        image: { base64: `data:image/png;base64,${imageBuffer.toString('base64')}` },
        mask: { base64: `data:image/png;base64,${maskBuffer.toString('base64')}` },
        strength: strength,
        guidance_scale: 15,
        num_inference_steps: 40
    };

    const result = await safeCallFreepik(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }, `v10-${label}`, 'inpainting');

    if (!result?.data?.task_id) throw new Error(`Task Init Failed for ${label}`);

    // Polling Logic
    const taskId = result.data.task_id;
    const POLLING_TIMEOUT = 120000;
    const start = Date.now();

    while (Date.now() - start < POLLING_TIMEOUT) {
        await sleep(3000);
        const statusUrl = getTextToImageStatusUrl(taskId);
        const statusRes = await safeCallFreepik(statusUrl, { method: 'GET' });

        if (statusRes?.data?.status === 'COMPLETED') {
            const output = statusRes.data.generated[0];
            return output.url || output;
        } else if (statusRes?.data?.status === 'FAILED') {
            throw new Error(`Synthesis Failed: ${label}`);
        }
    }
    throw new Error(`Timeout waiting for ${label}`);
}

// [MAIN PIPELINE]
export async function safeComposeWithSeedream(baseImageUrl, overlayImageData, compositingInfo) {
    try {
        console.log('[V10.0] Clean Slate Protocol Start');

        const baseBuffer = await fetchImageBuffer(baseImageUrl);
        const overlayBufferRaw = await fetchImageBuffer(overlayImageData);
        const baseMeta = await sharp(baseBuffer).metadata();

        // 1. 누끼 (Scissors)
        const cleanOverlay = await isolateSubject(overlayBufferRaw);

        // 2. 레이아웃 계산 (Safety: Ensure Overlay fits inside Base)
        const scale = compositingInfo.targetCoordinates?.w || 0.4;
        const targetWidth = Math.round(baseMeta.width * scale);

        // 🔥 CRITICAL FIX: Constrain Height to prevent "Image to composite must have same dimensions or smaller"
        // If background is Horizontal (16:9) and product is Tall, strict width-based scaling causes height overflow.
        const maxHeight = Math.round(baseMeta.height * 0.9);

        const overlayResized = await sharp(cleanOverlay)
            .resize({
                width: targetWidth,
                height: maxHeight,
                fit: 'inside'
            })
            .png()
            .toBuffer();
        const ovMeta = await sharp(overlayResized).metadata();

        const x = Math.round((baseMeta.width * (compositingInfo.targetCoordinates?.x || 0.5)) - (ovMeta.width / 2));
        const y = Math.round((baseMeta.height * (compositingInfo.targetCoordinates?.y || 0.65)) - (ovMeta.height / 2));
        const safeX = Math.max(0, x);
        const safeY = Math.max(0, y);

        // 3. 합성 (Placement)
        const compositeBuffer = await sharp(baseBuffer)
            .composite([{ input: overlayResized, left: safeX, top: safeY, blend: 'over' }])
            .toBuffer();

        // 4. 마스크 생성 (제품 주변 조명 효과용)
        const alpha = await sharp(overlayResized).ensureAlpha().extractChannel('alpha').toBuffer();
        const maskOverlay = await sharp(alpha, { raw: { width: ovMeta.width, height: ovMeta.height, channels: 1 } })
            .blur(10)
            .threshold(50)
            .png()
            .toBuffer();

        const maskBuffer = await sharp({
            create: { width: baseMeta.width, height: baseMeta.height, channels: 3, background: 'black' }
        })
            .composite([{ input: maskOverlay, left: safeX, top: safeY, blend: 'add' }])
            .png()
            .toBuffer();

        // 5. Seedream Harmonizer (배경 고정 조명)
        const finalUrl = await callSeedreamInpaint({
            imageBuffer: compositeBuffer,
            maskBuffer: maskBuffer,
            prompt: `High-end professional photography of ${compositingInfo.synthesisType || 'product'}. Natural lighting and shadows.`,
            strength: 0.25,
            label: "Harmonizer"
        });

        // 6. S3 업로드 (start_ts 오류 해결)
        const currentTs = Date.now();
        const finalImgBuffer = await fetchImageBuffer(finalUrl);
        const finalDataUri = `data:image/jpeg;base64,${finalImgBuffer.toString('base64')}`;

        const projectId = compositingInfo.projectId || 'v10_project';
        const s3Key = `nexxii-storage/projects/${projectId}/images/final_${currentTs}.jpg`;
        const uploadResult = await uploadBase64ToS3(finalDataUri, s3Key);

        return {
            success: true,
            imageUrl: uploadResult.url,
            engine: 'seedream-v10-bulletproof'
        };

    } catch (err) {
        console.error('[V10.0] Critical Failure:', err);
        throw err;
    }
}

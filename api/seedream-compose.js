// api/seedream-compose.js - V11.0 "Direct Edit" Protocol
// ⚠️ STRICT ADHERENCE: SEEDREAM V4.5 EDIT ENDPOINT.
// ❌ NO SHARP COMPOSITION / NO MASKING.
// ✅ DIRECT API CALL with REFERENCE IMAGES.

import { safeCallFreepik } from '../src/utils/apiHelpers.js';
import { getTextToImageStatusUrl, getFreepikApiBase } from '../src/utils/engineConfigLoader.js'; // Status URL logic is generic enough
import { uploadBase64ToS3 } from '../server/utils/s3-uploader.js';
import sharp from 'sharp';
import fetch from 'node-fetch';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// [HELPER] Buffer Fetcher with Aggressive Compression (V11.6)
async function fetchImageBuffer(source) {
    if (!source) throw new Error("Image source is empty");
    try {
        let buffer;
        if (source.startsWith('http')) {
            const res = await fetch(source);
            if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
            buffer = Buffer.from(await res.arrayBuffer());
        } else {
            const base64Clean = source.replace(/^data:image\/\w+;base64,/, "");
            buffer = Buffer.from(base64Clean, 'base64');
        }

        // ✅ CRITICAL (V11.6): PNG -> JPEG + Resize (10MB 이하 강제)
        const processedBuffer = await sharp(buffer)
            .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85, mozjpeg: true })
            .toBuffer();

        const finalSizeMB = processedBuffer.length / (1024 * 1024);
        console.log(`[V11.6] Compressed: ${finalSizeMB.toFixed(1)}MB JPEG`);

        if (finalSizeMB > 9.5) {
            return await sharp(processedBuffer).jpeg({ quality: 70 }).toBuffer();
        }

        return processedBuffer;
    } catch (err) {
        throw new Error(`Buffer Fetch/Compress Error: ${err.message}`);
    }
}

// [HELPER] Aspect Ratio Mapper (Original 3-mode Lock)
function getSceneAspectRatio(width, height) {
    const ratio = width / height;
    if (ratio > 1.3) return 'widescreen_16_9';
    if (ratio < 0.8) return 'social_story_9_16';
    return 'square_1_1';
}

// [API WRAPPER] Seedream V4.5 Edit
async function callSeedreamEdit({ prompt, referenceImages, aspectRatio }) {
    const baseUrl = getFreepikApiBase();
    const url = `${baseUrl}/ai/text-to-image/seedream-v4-5-edit`;

    const processedRefs = referenceImages.map(ref => {
        if (typeof ref === 'string' && ref.startsWith('http')) return ref;
        return `data:image/jpeg;base64,${ref.toString('base64')}`;
    });

    const payload = {
        prompt: prompt,
        reference_images: processedRefs,
        aspect_ratio: aspectRatio,
        seed: Math.floor(Math.random() * 1000000),
        enable_safety_checker: false
    };

    console.log(`[V11.6] Calling Seedream v4.5 Edit...`);
    const result = await safeCallFreepik(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }, `v11-edit-v4-5`);

    const taskId = result.data?.task_id || result.task_id;
    if (!taskId) throw new Error(`V4.5 Init Failed: ${JSON.stringify(result)}`);

    return await pollSeedreamTask(baseUrl, 'seedream-v4-5-edit', taskId);
}

// [API WRAPPER] Seedream V4 Edit (FALLBACK)
async function callSeedreamV4Fallback({ prompt, referenceImages, aspectRatio }) {
    const baseUrl = getFreepikApiBase();
    const url = `${baseUrl}/ai/text-to-image/seedream-v4-edit`;

    const processedRefs = referenceImages.map(ref => {
        if (typeof ref === 'string' && ref.startsWith('http')) return ref;
        return `data:image/jpeg;base64,${ref.toString('base64')}`;
    });

    const payload = {
        prompt: prompt,
        reference_images: processedRefs,
        aspect_ratio: aspectRatio,
        guidance_scale: 2.5,
        seed: Math.floor(Math.random() * 2147483647)
    };

    console.log(`[V11.6] FALLBACK: Calling Seedream v4 edit...`);
    const result = await safeCallFreepik(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }, `v11-edit-v4-fallback`);

    const taskId = result.data?.task_id || result.task_id;
    if (!taskId) throw new Error(`V4 Fallback Init Failed: ${JSON.stringify(result)}`);

    return await pollSeedreamTask(baseUrl, 'seedream-v4-edit', taskId);
}

// [POLLING HELPER]
async function pollSeedreamTask(baseUrl, endpoint, taskId) {
    const POLLING_TIMEOUT = 120000;
    const start = Date.now();

    while (Date.now() - start < POLLING_TIMEOUT) {
        await sleep(3000);
        const statusUrl = `${baseUrl}/ai/text-to-image/${endpoint}/${taskId}`;
        console.log(`[V11.6] Polling (${endpoint}): ${taskId}`);

        const statusRes = await safeCallFreepik(statusUrl, { method: 'GET' }, 0);
        const data = statusRes.data || statusRes;
        const status = data.status;

        if (status === 'COMPLETED') {
            const output = data.generated[0];
            return output.url || output;
        } else if (status === 'FAILED') {
            console.error(`[V11.6] ${endpoint} FAILED:`, JSON.stringify(data, null, 2));
            throw new Error(`Synthesis Failed: ${data.error_message || 'Internal Model Error'}`);
        }
    }
    throw new Error(`Timeout waiting for ${endpoint}`);
}

// [MAIN PIPELINE]
export async function safeComposeWithSeedream(baseImageUrl, overlayImageData, compositingInfo) {
    try {
        console.log('[V11.6] Compression & Fallback Protocol Start');

        // 1. Fetch & Compress Buffers (V11.6 Requirement)
        const baseBuffer = await fetchImageBuffer(baseImageUrl);
        const overlayBuffer = await fetchImageBuffer(overlayImageData);

        // 2. Original Aspect Ratio Mapping
        const baseMeta = await sharp(baseBuffer).metadata();
        const aspectRatio = getSceneAspectRatio(baseMeta.width, baseMeta.height);

        // 3. Original Prompt Lock
        const type = compositingInfo.synthesisType || 'person';
        const finalPrompt = `Replace the main object in image 1 with the ${type} from image 2. Maintain background lighting and perspective exactly. Professional photography, contact shadows.`;

        // 4. API Call with Fallback Logic
        try {
            const finalUrl = await callSeedreamEdit({
                prompt: finalPrompt,
                referenceImages: [baseBuffer, overlayBuffer],
                aspectRatio: aspectRatio
            });

            return await finalizeResult(finalUrl, compositingInfo.projectId);
        } catch (v45Err) {
            console.error('[V11.6] V4.5 Failed, Attempting V4 Fallback...', v45Err.message);

            const finalUrl = await callSeedreamV4Fallback({
                prompt: finalPrompt,
                referenceImages: [baseBuffer, overlayBuffer],
                aspectRatio: aspectRatio
            });

            return await finalizeResult(finalUrl, compositingInfo.projectId);
        }

    } catch (err) {
        console.error('[V11.6] Critical Failure:', err);
        throw err;
    }
}

async function finalizeResult(finalUrl, projectId) {
    const finalImgBuffer = await fetchImageBuffer(finalUrl);
    const finalDataUri = `data:image/jpeg;base64,${finalImgBuffer.toString('base64')}`;
    const s3Key = `nexxii-storage/projects/${projectId || 'v11_project'}/images/final_${Date.now()}.jpg`;
    const uploadResult = await uploadBase64ToS3(finalDataUri, s3Key);

    return {
        success: true,
        imageUrl: uploadResult.url,
        engine: 'seedream-v4-5-edit'
    };
}
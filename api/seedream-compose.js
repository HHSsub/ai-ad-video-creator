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

// [HELPER] Buffer Fetcher (Safety First)
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

// [HELPER] Aspect Ratio Mapper
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

    // 🔥 V11.2: URL Preservation Logic
    // If ref is a URL, pass it. If buffer, use Base64 (JPEG optimized).
    const processedRefs = referenceImages.map(ref => {
        if (typeof ref === 'string' && ref.startsWith('http')) return ref;
        if (Buffer.isBuffer(ref)) return `data:image/jpeg;base64,${ref.toString('base64')}`;
        return ref;
    });

    const payload = {
        prompt: prompt,
        reference_images: processedRefs,
        aspect_ratio: aspectRatio,
        enable_safety_checker: false, // 🛑 DEBUG: OFF
        seed: Math.floor(Math.random() * 1000000),
        num_images: 1
    };

    console.log(`[V11.2] Sending Request to Seedream v4.5 Edit... (URLs used: ${processedRefs.filter(r => r.startsWith('http')).length})`);

    const result = await safeCallFreepik(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }, `v11-edit-patch`);

    // 🔥 Debug Logging for Response Structure
    console.log('[V11.2] POST Response:', JSON.stringify(result, null, 2));

    const taskId = result.data?.task_id || result.task_id;
    if (!taskId) {
        console.error('[V11.2] Task Init Failed. Response:', JSON.stringify(result, null, 2));
        throw new Error(`Task Init Failed: ${result.error?.message || 'Unknown API Error'}`);
    }

    // Polling Logic
    const POLLING_TIMEOUT = 120000;
    const start = Date.now();

    while (Date.now() - start < POLLING_TIMEOUT) {
        await sleep(3000);
        const statusUrl = `${baseUrl}/ai/text-to-image/seedream-v4-5-edit/${taskId}`;
        console.log(`[V11.2] Polling Status (${taskId}): ${statusUrl}`);

        const statusRes = await safeCallFreepik(statusUrl, { method: 'GET' });

        if (statusRes?.data?.status === 'COMPLETED') {
            const output = statusRes.data.generated[0];
            return output.url || output;
        } else if (statusRes?.data?.status === 'FAILED') {
            console.error('[V11.2] API Synthesis FAILED Detail:', JSON.stringify(statusRes.data, null, 2));
            throw new Error(`Synthesis Failed: ${statusRes.data?.error_message || 'Internal Model Error'}`);
        }
    }
    throw new Error(`Timeout waiting for V11 Edit`);
}

// [MAIN PIPELINE]
export async function safeComposeWithSeedream(baseImageUrl, overlayImageData, compositingInfo) {
    try {
        console.log('[V11.2] URL-Preservation Protocol Start');

        // 1. Load Buffers (ONLY for Metadata/Analysis, NOT for API Payload if they are URLs)
        const baseBuffer = await fetchImageBuffer(baseImageUrl);
        // overlayBuffer is not strictly needed for metadata here but kept for consistency if needed.

        // 2. Analyze Geometry
        const baseMeta = await sharp(baseBuffer).metadata();
        const aspectRatio = getSceneAspectRatio(baseMeta.width, baseMeta.height);
        console.log(`[V11.2] Detected Aspect Ratio: ${aspectRatio}`);

        // 3. Construct Prompt
        const type = compositingInfo.synthesisType || 'object';
        const finalPrompt = `Replace the main object in image 1 with the ${type} from image 2. Maintain background lighting and perspective exactly. Professional photography, contact shadows.`;

        // 4. Call API (V11.2: Prefer URLs)
        const finalUrl = await callSeedreamEdit({
            prompt: finalPrompt,
            // 🔥 Pass original URLs if they are URLs, otherwise pass buffers
            referenceImages: [
                baseImageUrl.startsWith('http') ? baseImageUrl : baseBuffer,
                (typeof overlayImageData === 'string' && overlayImageData.startsWith('http')) ? overlayImageData : await fetchImageBuffer(overlayImageData)
            ],
            aspectRatio: aspectRatio
        });

        // 5. S3 Upload & Return
        const currentTs = Date.now();
        const finalImgBuffer = await fetchImageBuffer(finalUrl);
        const finalDataUri = `data:image/jpeg;base64,${finalImgBuffer.toString('base64')}`;

        const projectId = compositingInfo.projectId || 'v11_project';
        const s3Key = `nexxii-storage/projects/${projectId}/images/final_${currentTs}.jpg`;
        const uploadResult = await uploadBase64ToS3(finalDataUri, s3Key);

        return {
            success: true,
            imageUrl: uploadResult.url,
            engine: 'seedream-v4-5-edit'
        };

    } catch (err) {
        console.error('[V11.0] Critical Failure:', err);
        throw err;
    }
}

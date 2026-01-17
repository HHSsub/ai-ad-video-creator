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
    // 🔥 HARDCODED ENDPOINT (V11.0 Requirement)
    const baseUrl = getFreepikApiBase();
    const url = `${baseUrl}/ai/text-to-image/seedream-v4-5-edit`;

    // Prepare Base64 Reference Images
    // Ref[0]: Base Image (Background)
    // Ref[1]: Overlay Image (Subject)
    const processedRefs = referenceImages.map(buf =>
        `data:image/png;base64,${buf.toString('base64')}`
    );

    const payload = {
        prompt: prompt,
        reference_images: processedRefs,
        aspect_ratio: aspectRatio,
        enable_safety_checker: true,
        // Optional parameters for V4.5 Edit if needed default behavior
        num_images: 1,
        guidance_scale: 2.5
    };

    const result = await safeCallFreepik(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }, `v11-edit`, 'seedream-edit');

    // 🔥 Debug Logging for V4.5 Edit Response
    console.log('[V11.0] POST Response:', JSON.stringify(result, null, 2));

    const taskId = result.task_id || result.data?.task_id;
    if (!taskId) throw new Error(`Task Init Failed: No task_id in response`);

    // Polling Logic
    const POLLING_TIMEOUT = 120000;
    const start = Date.now();

    while (Date.now() - start < POLLING_TIMEOUT) {
        await sleep(3000);
        // 🔥 STRICT ENDPOINT CORRECTION (V11.0)
        // Docs: GET /v1/ai/text-to-image/seedream-v4-5-edit/{task-id}
        const statusUrl = `${baseUrl}/ai/text-to-image/seedream-v4-5-edit/${taskId}`;
        console.log(`[V11.0] Polling Status: ${statusUrl}`); // Log URL to catch undefined/null

        const statusRes = await safeCallFreepik(statusUrl, { method: 'GET' });

        if (statusRes?.data?.status === 'COMPLETED') {
            const output = statusRes.data.generated[0];
            return output.url || output;
        } else if (statusRes?.data?.status === 'FAILED') {
            throw new Error(`Synthesis Failed: V11 Edit`);
        }
    }
    throw new Error(`Timeout waiting for V11 Edit`);
}

// [MAIN PIPELINE]
export async function safeComposeWithSeedream(baseImageUrl, overlayImageData, compositingInfo) {
    try {
        console.log('[V11.0] Direct Edit Protocol Start');

        // 1. Load Sources
        const baseBuffer = await fetchImageBuffer(baseImageUrl);
        const overlayBuffer = await fetchImageBuffer(overlayImageData);

        // 2. Analyze Geometry (Only for API Parameter)
        const baseMeta = await sharp(baseBuffer).metadata();
        const aspectRatio = getSceneAspectRatio(baseMeta.width, baseMeta.height);
        console.log(`[V11.0] Detected Aspect Ratio: ${aspectRatio}`);

        // 3. Construct Prompt (Prompt Engineering)
        const type = compositingInfo.synthesisType || 'object';
        const finalPrompt = `Replace the main object in image 1 with the ${type} from image 2. Preserve the background environment of image 1 exactly. Professional photography, natural lighting, contact shadows, ${aspectRatio === 'widescreen_16_9' ? 'cinematic look' : 'high detail'}.`;

        // 4. Call API (The Direct Edit)
        const finalUrl = await callSeedreamEdit({
            prompt: finalPrompt,
            referenceImages: [baseBuffer, overlayBuffer],
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

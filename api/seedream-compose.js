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

// [HELPER] Aspect Ratio Mapper (Original 3-mode)
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

    // 1. URL Preservation (V11.5: Keep source logging)
    const processedRefs = referenceImages.map((ref, idx) => {
        if (typeof ref === 'string' && ref.startsWith('http')) {
            console.log(`[V11.5] Ref[${idx}]: URL -> ${ref}`);
            return ref;
        }
        if (Buffer.isBuffer(ref)) {
            console.log(`[V11.5] Ref[${idx}]: Buffer -> Base64 (Size: ${Math.round(ref.length / 1024)}KB)`);
            return `data:image/jpeg;base64,${ref.toString('base64')}`;
        }
        return ref;
    });

    // 🛑 V11.5 SPEC-PERFECT PAYLOAD
    const payload = {
        prompt: prompt,
        reference_images: processedRefs,
        aspect_ratio: aspectRatio,
        seed: Math.floor(Math.random() * 1000000),
        enable_safety_checker: false // DEBUG: OFF
    };

    console.log(`[V11.5] Sending request to Seedream v4.5 Edit...`);

    // safeCallFreepik in V11.4+ handles header merging robustly
    const result = await safeCallFreepik(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }, `v11-edit-spec-perfect`);

    console.log('[V11.5] POST Response:', JSON.stringify(result, null, 2));

    const taskId = result.data?.task_id || result.task_id;
    if (!taskId) throw new Error(`Task Init Failed: ${JSON.stringify(result)}`);

    // Polling Logic
    const POLLING_TIMEOUT = 120000;
    const start = Date.now();

    while (Date.now() - start < POLLING_TIMEOUT) {
        await sleep(3000);
        const statusUrl = `${baseUrl}/ai/text-to-image/seedream-v4-5-edit/${taskId}`;
        console.log(`[V11.5] Polling (${taskId}) Status Check...`);

        const statusRes = await safeCallFreepik(statusUrl, { method: 'GET' }, 0);
        const data = statusRes.data || statusRes;
        const status = data.status;

        if (status === 'COMPLETED') {
            const output = data.generated[0];
            return output.url || output;
        } else if (status === 'FAILED') {
            console.error('[V11.5] Synthesis FAILED Detail:', JSON.stringify(data, null, 2));
            throw new Error(`Synthesis Failed: ${data.error_message || 'Internal Model Error'}`);
        }
    }
    throw new Error(`Timeout waiting for V11 Edit`);
}

// [MAIN PIPELINE]
export async function safeComposeWithSeedream(baseImageUrl, overlayImageData, compositingInfo) {
    try {
        console.log('[V11.5] Pure-Repair Protocol Start');

        // 1. Fetch Buffer for Analysis
        const baseBuffer = await fetchImageBuffer(baseImageUrl);

        // 2. Original Aspect Ratio Mapping
        const baseMeta = await sharp(baseBuffer).metadata();
        const aspectRatio = getSceneAspectRatio(baseMeta.width, baseMeta.height);
        console.log(`[V11.5] Aspect Ratio: ${aspectRatio}`);

        // 3. Original "Replace X with Y" Prompt
        const type = compositingInfo.synthesisType || 'person';
        const finalPrompt = `Replace the main object in image 1 with the ${type} from image 2. Maintain background lighting and perspective exactly. Professional photography, contact shadows.`;

        // 4. API Call
        const finalUrl = await callSeedreamEdit({
            prompt: finalPrompt,
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
        console.error('[V11.5] Critical Failure:', err);
        throw err;
    }
}
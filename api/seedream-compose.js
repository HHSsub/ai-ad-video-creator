// api/seedream-compose.js - Freepik Seedream Integration with Hybrid Composition (Stamp & Blend)
// Refactored: Universal High-Fidelity Composition Engine
// Strategy: TRIPLE-LOCK Force-Compose (Anchor -> AI-Relight -> Over-Stamp)
// V7.0 - "White Box" Artifact Fix (Transparent Composition + Auto-Alpha)

import { safeCallFreepik } from '../src/utils/apiHelpers.js';
import { getTextToImageUrl, getTextToImageStatusUrl } from '../src/utils/engineConfigLoader.js';
import { uploadBase64ToS3 } from '../server/utils/s3-uploader.js'; // 🔥 S3 Integration
import sharp from 'sharp';
import fetch from 'node-fetch';

const POLLING_TIMEOUT = 180000; // 3 minutes timeout
const POLLING_INTERVAL = 3000; // 3 seconds interval

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 🛠️ Sharp Image Processing Utilities (Stamp)
// ==========================================

async function fetchImageBuffer(source) {
    if (!source) throw new Error("Image source is empty");

    if (source.startsWith('http')) {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } else {
        // Base64 Case
        const base64Clean = source.replace(/^data:image\/\w+;base64,/, "");
        return Buffer.from(base64Clean, 'base64');
    }
}

/**
 * [CRITICAL] Removes White/Solid Backgrounds from Product Images
 * Uses Sharp thresholding to isolate valid pixels.
 */
async function removeWhiteBackground(buffer) {
    try {
        console.log('[Alpha-Isolation] Removing white background...');

        const image = sharp(buffer).ensureAlpha();
        const { data, info } = await image
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Manual Pixel Manipulation
        // If (R>230 && G>230 && B>230) -> Alpha 0
        const threshold = 230;
        const pixelParams = 4; // RGBA

        let modified = false;

        for (let i = 0; i < data.length; i += pixelParams) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            if (r > threshold && g > threshold && b > threshold) {
                data[i + 3] = 0; // Set Alpha to 0
                modified = true;
            }
        }

        if (!modified) {
            console.log('[Alpha-Isolation] No white pixels detected/removed.');
            return buffer;
        }

        const transparentBuffer = await sharp(data, {
            raw: {
                width: info.width,
                height: info.height,
                channels: 4
            }
        }).png().toBuffer();

        console.log('[Alpha-Isolation] White background removed successfully.');
        return transparentBuffer;

    } catch (err) {
        console.warn('[Alpha-Isolation] Failed to remove BG, using original:', err);
        return buffer;
    }
}

/**
 * Calculates layout coordinates based on context/defaults
 */
function calculateLayout(baseMeta, overlayMeta, type, compositingInfo) {
    let targetX = 0.5;
    let targetY = 0.5;
    let scaleFactor = 0.35; // Standard Product Size

    const { targetCoordinates, sceneDescription } = compositingInfo || {};
    const prompt = (sceneDescription || "").toLowerCase();

    // Strategy Defaults
    if (type === 'logo') {
        targetY = 0.15; // Header area for logos
        scaleFactor = 0.20;
    } else {
        targetY = 0.70; // Product default: Lower Center
        scaleFactor = 0.40;
    }

    // Context Parsing
    if (prompt.includes('close up') || prompt.includes('macro') || prompt.includes('zoom')) scaleFactor *= 1.3;
    if (prompt.includes('wide shot') || prompt.includes('far') || prompt.includes('distant')) scaleFactor *= 0.7;

    if (prompt.includes('left')) targetX = 0.25;
    if (prompt.includes('right')) targetX = 0.75;
    if (prompt.includes('center') || prompt.includes('middle')) targetX = 0.5;

    if (prompt.includes('top') || prompt.includes('upper') || prompt.includes('ceiling')) targetY = 0.25;
    if (prompt.includes('bottom') || prompt.includes('lower') || prompt.includes('floor') || prompt.includes('table')) targetY = 0.75;

    // Explicit Overrides
    if (targetCoordinates) {
        if (typeof targetCoordinates.x === 'number') targetX = targetCoordinates.x;
        if (typeof targetCoordinates.y === 'number') targetY = targetCoordinates.y;
        if (typeof targetCoordinates.w === 'number') scaleFactor = targetCoordinates.w;
    }

    const targetWidthPx = Math.round(baseMeta.width * scaleFactor);

    return { targetX, targetY, scaleFactor, targetWidthPx };
}

/**
 * Step A: Pixel Anchor (Transparent Stamping)
 * Physically pastes the product onto the background.
 * Returns both the base64 image AND the layout config for the Triple-Lock Step C.
 */
async function stampImageWithLayout(baseSource, overlaySource, type, compositingInfo) {
    try {
        console.log(`[Stamp] Starting Context-Aware Stamping for type: ${type}`);
        const baseBuffer = await fetchImageBuffer(baseSource);
        const overlayBufferRaw = await fetchImageBuffer(overlaySource);

        // 🔥 CRITICAL Step 1: Remove White Background
        const overlayBuffer = await removeWhiteBackground(overlayBufferRaw);

        const baseImage = sharp(baseBuffer);
        const baseMeta = await baseImage.metadata();

        const layout = calculateLayout(baseMeta, {}, type, compositingInfo);

        // Resize Overlay
        const overlayResized = await sharp(overlayBuffer)
            .resize({ width: layout.targetWidthPx })
            .toBuffer();

        const overlayMeta = await sharp(overlayResized).metadata();

        // Calculate Top-Left Origin from Center Ratio
        let left = Math.round((baseMeta.width * layout.targetX) - (overlayMeta.width / 2));
        let top = Math.round((baseMeta.height * layout.targetY) - (overlayMeta.height / 2));

        // Bounds Clamp
        left = Math.max(0, Math.min(left, baseMeta.width - overlayMeta.width));
        top = Math.max(0, Math.min(top, baseMeta.height - overlayMeta.height));

        console.log(`[Stamp] Pixel Position: left=${left}, top=${top}, width=${layout.targetWidthPx}`);

        // 🔥 CRITICAL Step 2: Composite with blend 'over' (Respects alpha)
        const resultBuffer = await baseImage
            .composite([{ input: overlayResized, left, top, blend: 'over' }])
            .toBuffer();

        return {
            base64: resultBuffer.toString('base64'),
            layout: { left, top, overlayBuffer: overlayResized } // Used for Step 3 Over-Stamp
        };

    } catch (err) {
        console.error('[Stamp] Error during sharp composition:', err);
        throw new Error(`Pre-processing failed: ${err.message}`);
    }
}

/**
 * Step C: Over-Stamp (Triple-Lock)
 * Pastes the ORIGINAL overlay (resized & transparent) onto the AI generated result
 * to guarantee pixel-perfect fidelity.
 */
async function overStampImage(aiResultUrl, layoutConfig) {
    try {
        console.log('[Triple-Lock] Step C: Over-Stamping Original Identity...');

        // 1. Fetch AI Result
        const aiBuffer = await fetchImageBuffer(aiResultUrl);
        const aiImage = sharp(aiBuffer);

        // 2. Composite Transparent Overlay back on top
        // 🔥 CRITICAL Step 3: Blend 'over' with the CLEAN transparent overlay
        const finalBuffer = await aiImage
            .composite([{
                input: layoutConfig.overlayBuffer,
                left: layoutConfig.left,
                top: layoutConfig.top,
                blend: 'over'
            }])
            .toBuffer();

        return finalBuffer;

    } catch (err) {
        console.error('[Triple-Lock] Over-Stamp failed:', err);
        throw new Error(`Post-processing failed: ${err.message}`);
    }
}

// ==========================================
// 🔄 Core Logic
// ==========================================

async function pollSeedreamStatus(taskId) {
    const startTime = Date.now();

    while (Date.now() - startTime < POLLING_TIMEOUT) {
        try {
            const url = getTextToImageStatusUrl(taskId);
            const result = await safeCallFreepik(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            }, 'seedream-compose', `status-${taskId}`);

            if (result && result.data) {
                const { status, generated } = result.data;

                if (status === 'COMPLETED') {
                    if (generated && generated.length > 0) {
                        const finalUrl = typeof generated[0] === 'string' ? generated[0] : generated[0].url;
                        console.log(`[Seedream] Synthesis Complete. URL: ${finalUrl}`);
                        if (!finalUrl) throw new Error('URL extraction failed from generated result');
                        return finalUrl;
                    }
                    throw new Error('Status completed but no image generated.');
                } else if (status === 'FAILED') {
                    throw new Error('Image synthesis task failed (Freepik side).');
                }
                await sleep(POLLING_INTERVAL);
            } else {
                throw new Error('Invalid status response.');
            }
        } catch (err) {
            console.error(`[Seedream] Polling error: ${err.message}`);
            if (Date.now() - startTime > POLLING_TIMEOUT) throw err;
            await sleep(POLLING_INTERVAL);
        }
    }
    throw new Error(`Synthesis timeout (${POLLING_TIMEOUT}ms)`);
}

/**
 * safeComposeWithSeedream
 * The Universal Engine for 100% Fidelity Composition
 */
export async function safeComposeWithSeedream(baseImageUrl, overlayImageData, compositingInfo) {
    try {
        console.log('[safeComposeWithSeedream] Starting Triple-Lock Force-Composition (V7 Transparent)');

        const type = compositingInfo.synthesisType || 'product';
        const baseDescription = compositingInfo.sceneDescription || "A professional studio scene";

        // Prompt Logic
        const finalPrompt = `A professional high-fidelity photo. The exact object from the reference image must be maintained with 100% visual identity, including its original shape, texture, color, and branding. Place this object into the scene: ${baseDescription}. Apply realistic environmental lighting and cast natural contact shadows to match the background perfectly. NO alterations to the object itself.`;
        const negativePrompt = "white box, square artifact, morphing, structural change, altering identity, changing colors, distorted labels, hallucination, blurry, low quality, stylized, cartoon, painting, different object type, logo change, artistic interpretation.";

        // Hyperparameters (Strict)
        const strength = 0.1;
        const guidanceScale = 20.0;
        const numInferenceSteps = 50;

        // [Triple-Lock Step A] Anchor with Transparency
        const { base64: stampedBase64, layout } = await stampImageWithLayout(baseImageUrl, overlayImageData, type, compositingInfo);

        // Prepare References
        let references = [];
        if (overlayImageData.startsWith('http')) {
            references.push({ image: { url: overlayImageData } });
        } else {
            const base64Clean = overlayImageData.replace(/^data:image\/\w+;base64,/, "");
            references.push({ image: { base64: base64Clean } });
        }

        // Payload Construction
        const url = getTextToImageUrl();
        const payload = {
            prompt: finalPrompt,
            negative_prompt: negativePrompt,
            reference_images: references,
            num_images: 1,
            image: { base64: stampedBase64 },
            strength: strength,
            guidance_scale: guidanceScale,
            num_inference_steps: numInferenceSteps,
            aspect_ratio: compositingInfo?.aspectRatio || undefined
        };

        console.log(`[Universal Engine] Settings: Strength=${strength}, Guidance=${guidanceScale}`);

        // [Triple-Lock Step B] AI Relighting
        const result = await safeCallFreepik(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        }, 'seedream-compose', 'start-task');

        if (!result || !result.data || !result.data.task_id) {
            console.error('[Seedream Error] Payload:', JSON.stringify(payload, null, 2));
            throw new Error('[Seedream Error] Failed to initiate task.');
        }

        const taskId = result.data.task_id;
        console.log(`[Seedream] Task Initiated: ${taskId}`);

        // Polling
        await sleep(3000);
        const generatedImageUrl = await pollSeedreamStatus(taskId);

        // [Triple-Lock Step C] Over-Stamp with Transparency
        const finalBuffer = await overStampImage(generatedImageUrl, layout);
        const finalBase64 = finalBuffer.toString('base64');
        const finalDataUri = `data:image/jpeg;base64,${finalBase64}`;

        // [Triple-Lock Step D] S3 Upload
        const projectId = compositingInfo.projectId || 'temp_project';
        const timestamp = Date.now();
        const s3Key = `nexxii-storage/projects/${projectId}/images/triple_lock_v7_${timestamp}.jpg`;

        console.log(`[Triple-Lock] Uploading Final Result to S3: ${s3Key}`);
        const uploadResult = await uploadBase64ToS3(finalDataUri, s3Key);

        return {
            success: true,
            imageUrl: uploadResult.url,
            engine: 'seedream-v7-transparent'
        };

    } catch (err) {
        console.error('[safeComposeWithSeedream] Critical Error:', err);
        throw err;
    }
}

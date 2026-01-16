// api/seedream-compose.js - Freepik Seedream Integration with Hybrid Composition (Stamp & Blend)
// Refactored: Universal High-Fidelity Composition Engine
// Strategy: Hybrid Anchor-Blend (Sharp Stamping + AI Relighting)
// V5.0 - Universal "Anti-Hallucination" Update

import { safeCallFreepik } from '../src/utils/apiHelpers.js';
import { getTextToImageUrl, getTextToImageStatusUrl } from '../src/utils/engineConfigLoader.js';
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
        // [REF-REQ-3A] Replace buffer() with arrayBuffer()
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } else {
        // Base64 Case
        const base64Clean = source.replace(/^data:image\/\w+;base64,/, "");
        return Buffer.from(base64Clean, 'base64');
    }
}

/**
 * Step A: Pixel Anchor (Sharp Stamping)
 * Physically pastes the product onto the background to ensure shape/text fidelity.
 */
async function stampImage(baseSource, overlaySource, type, compositingInfo) {
    try {
        console.log(`[Stamp] Starting Context-Aware Stamping for type: ${type}`);
        const baseBuffer = await fetchImageBuffer(baseSource);
        const overlayBuffer = await fetchImageBuffer(overlaySource);

        const baseImage = sharp(baseBuffer);
        const baseMeta = await baseImage.metadata();

        // 1. Defaults (Center)
        let targetX = 0.5;
        let targetY = 0.5;
        let scaleFactor = 0.35; // Standard Product Size

        const { targetCoordinates, sceneDescription } = compositingInfo || {};
        const prompt = (sceneDescription || "").toLowerCase();

        // 2. Strategy Defaults (can be overridden by context)
        if (type === 'logo') {
            targetY = 0.15; // Header area for logos
            scaleFactor = 0.20;
        } else {
            // Universal Product/Object placement default: Lower Center
            targetY = 0.70;
            scaleFactor = 0.40;
        }

        // 3. Context Parsing (Simple NLP for positioning)
        // Zoom/Scale
        if (prompt.includes('close up') || prompt.includes('macro') || prompt.includes('zoom')) scaleFactor *= 1.3;
        if (prompt.includes('wide shot') || prompt.includes('far') || prompt.includes('distant')) scaleFactor *= 0.7;

        // X-Axis
        if (prompt.includes('left')) targetX = 0.25;
        if (prompt.includes('right')) targetX = 0.75;
        if (prompt.includes('center') || prompt.includes('middle')) targetX = 0.5;

        // Y-Axis
        if (prompt.includes('top') || prompt.includes('upper') || prompt.includes('ceiling')) targetY = 0.25;
        if (prompt.includes('bottom') || prompt.includes('lower') || prompt.includes('floor') || prompt.includes('table')) targetY = 0.75;

        // 4. Explicit Overrides (Priority)
        if (targetCoordinates) {
            console.log('[Stamp] Using explicit coordinates:', targetCoordinates);
            if (typeof targetCoordinates.x === 'number') targetX = targetCoordinates.x;
            if (typeof targetCoordinates.y === 'number') targetY = targetCoordinates.y;
            if (typeof targetCoordinates.w === 'number') scaleFactor = targetCoordinates.w;
        }

        console.log(`[Stamp] Final Layout: X=${targetX.toFixed(2)}, Y=${targetY.toFixed(2)}, Scale=${scaleFactor.toFixed(2)}`);

        // 5. Pixel Calculation
        const targetWidthPx = Math.round(baseMeta.width * scaleFactor);

        // Resize Overlay
        const overlayResized = await sharp(overlayBuffer)
            .resize({ width: targetWidthPx }) // Auto height
            .toBuffer();

        const overlayMeta = await sharp(overlayResized).metadata();

        // Calculate Top-Left Origin from Center Ratio
        let left = Math.round((baseMeta.width * targetX) - (overlayMeta.width / 2));
        let top = Math.round((baseMeta.height * targetY) - (overlayMeta.height / 2));

        // Bounds Clamp
        left = Math.max(0, Math.min(left, baseMeta.width - overlayMeta.width));
        top = Math.max(0, Math.min(top, baseMeta.height - overlayMeta.height));

        console.log(`[Stamp] Pixel Position: left=${left}, top=${top}, width=${targetWidthPx}`);

        // 6. Execute Composite
        const resultBuffer = await baseImage
            .composite([{ input: overlayResized, left, top }])
            .toBuffer();

        return resultBuffer.toString('base64');

    } catch (err) {
        console.error('[Stamp] Error during sharp composition:', err);
        throw new Error(`Pre-processing failed: ${err.message}`);
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
        console.log('[safeComposeWithSeedream] Starting Universal High-Fidelity Composition');

        const type = compositingInfo.synthesisType || 'product'; // Default to product
        const baseDescription = compositingInfo.sceneDescription || "A professional studio scene";

        // [REF-REQ-3B] Dynamic Prompting
        // "A professional high-fidelity photo. The exact object from the reference image must be maintained with 100% visual identity, including its original shape, texture, color, and branding. Place this object into the scene: ${baseDescription}. Apply realistic environmental lighting and cast natural contact shadows to match the background perfectly. NO alterations to the object itself."

        const finalPrompt = `A professional high-fidelity photo. The exact object from the reference image must be maintained with 100% visual identity, including its original shape, texture, color, and branding. Place this object into the scene: ${baseDescription}. Apply realistic environmental lighting and cast natural contact shadows to match the background perfectly. NO alterations to the object itself.`;

        const negativePrompt = "morphing, structural change, altering identity, changing colors, distorted labels, hallucination, blurry, low quality, stylized, cartoon, painting, different object type, logo change, artistic interpretation.";

        // [REF-REQ-3C] Hyperparameter Enforcement
        const strength = 0.05; // Strict range 0.05-0.10. Start with lower bound for max fidelity.
        const guidanceScale = 25.0; // Strict adherence force.
        const numInferenceSteps = 50; // Max quality.

        // Step A: Sharp Stamping (Anchor)
        const stampedBase64 = await stampImage(baseImageUrl, overlayImageData, type, compositingInfo);

        // Prepare References
        // [REF-REQ-4.3] Reference images must contain the original high-res product
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
            reference_images: references, // Lock identity with original
            num_images: 1,
            image: { base64: stampedBase64 }, // Anchor with stamped image
            strength: strength,
            guidance_scale: guidanceScale,
            num_inference_steps: numInferenceSteps,
            aspect_ratio: compositingInfo?.aspectRatio || undefined
        };

        // [REF-REQ-5] Log for debugging
        console.log(`[Universal Engine] Prompt: "${finalPrompt}"`);
        console.log(`[Universal Engine] Settings: Strength=${strength}, Guidance=${guidanceScale}, Steps=${numInferenceSteps}`);

        const result = await safeCallFreepik(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        }, 'seedream-compose', 'start-task');

        // [REF-REQ-5] Error Handling
        if (!result || !result.data || !result.data.task_id) {
            console.error('[Seedream Error] Payload was:', JSON.stringify(payload, null, 2));
            throw new Error('[Seedream Error] Failed to initiate task - check API payload.');
        }

        const taskId = result.data.task_id;
        console.log(`[Seedream] Task Initiated: ${taskId}`);

        // Polling
        await sleep(3000);
        const finalImageUrl = await pollSeedreamStatus(taskId);

        return {
            success: true,
            imageUrl: finalImageUrl,
            engine: 'seedream-v5-universal'
        };

    } catch (err) {
        console.error('[safeComposeWithSeedream] Critical Error:', err);
        throw err;
    }
}

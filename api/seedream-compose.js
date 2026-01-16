// api/seedream-compose.js - Freepik Seedream Integration with Hybrid Composition (Stamp & Blend)
// Refactored: Sharp Pre-processing + AI Harmonization + Context Aware Positioning
// EMERGENCY UPDATE: STRICT PRODUCT FIDELITY (Strength 0.12 + No Distortion)

import { safeCallFreepik } from '../src/utils/apiHelpers.js';
import { getTextToImageUrl, getTextToImageStatusUrl } from '../src/utils/engineConfigLoader.js';
import sharp from 'sharp';
import fetch from 'node-fetch';

const POLLING_TIMEOUT = 180000; // 3분 타임아웃
const POLLING_INTERVAL = 3000; // 3초 간격 폴링

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 🛠️ Sharp Image Processing Utilities (Stamp)
// ==========================================

async function fetchImageBuffer(source) {
    if (!source) throw new Error("Image source is empty");

    if (source.startsWith('http')) {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
        return await res.buffer();
    } else {
        // Base64 Case
        const base64Clean = source.replace(/^data:image\/\w+;base64,/, "");
        return Buffer.from(base64Clean, 'base64');
    }
}

/**
 * 선-합성 (Stamp) 함수 - Context-Aware Positioning
 * @param {string} baseSource - 배경 이미지
 * @param {string} overlaySource - 오버레이 이미지
 * @param {string} type - 'logo' | 'product'
 * @param {object} compositingInfo - 위치/크기 정보 및 맥락
 */
async function stampImage(baseSource, overlaySource, type, compositingInfo) {
    try {
        console.log(`[Stamp] Starting Context-Aware Stamping for type: ${type}`);
        const baseBuffer = await fetchImageBuffer(baseSource);
        const overlayBuffer = await fetchImageBuffer(overlaySource);

        const baseImage = sharp(baseBuffer);
        const baseMeta = await baseImage.metadata();

        // 1. 초기화 (Defaults)
        // 좌표는 0.0 ~ 1.0 비율 (중심점 기준)
        let targetX = 0.5; // Center
        let targetY = 0.5; // Center
        let scaleFactor = 0.35; // Default Width Ratio

        const { targetCoordinates, sceneDescription } = compositingInfo || {};
        const prompt = (sceneDescription || "").toLowerCase();

        // 2. 전략별 기본값 설정 (Type Strategy)
        if (type === 'logo') {
            targetY = 0.15; // 상단 헤더 (안전 구역)
            scaleFactor = 0.20; // 로고는 작게
        } else if (type === 'product') {
            targetY = 0.75; // 하단 테이블/바닥 영역
            scaleFactor = 0.35; // 제품은 적당한 크기
        }

        // 3. 문맥 분석 (Context Parsing)
        // 크기 보정
        if (prompt.includes('close up') || prompt.includes('macro') || prompt.includes('zoom')) scaleFactor *= 1.3;
        if (prompt.includes('wide shot') || prompt.includes('far') || prompt.includes('distant')) scaleFactor *= 0.7;

        // 위치 보정
        if (prompt.includes('left')) targetX = 0.25;
        if (prompt.includes('right')) targetX = 0.75;

        // Vertical 보정은 신중하게 (Product는 바닥 유지)
        if (prompt.includes('top') || prompt.includes('upper') || prompt.includes('ceiling')) targetY = 0.20;
        // 'Bottom' is usually the default for product, but explicit query reinforces it
        if (prompt.includes('bottom') || prompt.includes('lower') || prompt.includes('floor')) targetY = 0.80;

        // 정중앙 명시
        if (prompt.includes('center') || prompt.includes('middle')) targetX = 0.5;

        // 4. 명시적 좌표 오버라이드 (Explicit Override)
        if (targetCoordinates) {
            console.log('[Stamp] Using explicit coordinates:', targetCoordinates);
            if (typeof targetCoordinates.x === 'number') targetX = targetCoordinates.x;
            if (typeof targetCoordinates.y === 'number') targetY = targetCoordinates.y;
            if (typeof targetCoordinates.w === 'number') scaleFactor = targetCoordinates.w;
        } else if (type === 'product' && !sceneDescription) {
            // 🔥 WARNING for User's demand: Coordinate missing
            console.warn('[Stamp] WARNING: Product composition requested without Explicit Coordinates or Context. Applying Fallback (Center-Bottom).');
        }

        console.log(`[Stamp] Final Layout: X=${targetX.toFixed(2)}, Y=${targetY.toFixed(2)}, Scale=${scaleFactor.toFixed(2)}`);

        // 5. 물리적 계산 (Pixel Calculation)
        const targetWidthPx = Math.round(baseMeta.width * scaleFactor);

        // 리사이징
        const overlayResized = await sharp(overlayBuffer)
            .resize({ width: targetWidthPx }) // height auto (maintain aspect ratio)
            .toBuffer();

        const overlayMeta = await sharp(overlayResized).metadata();

        // 위치 계산 (Center Origin -> Top-Left Origin)
        let left = Math.round((baseMeta.width * targetX) - (overlayMeta.width / 2));
        let top = Math.round((baseMeta.height * targetY) - (overlayMeta.height / 2));

        // 경계 검사 (Bounds Check)
        // 이미지가 화면 밖으로 나가지 않도록 Clamp
        left = Math.max(0, Math.min(left, baseMeta.width - overlayMeta.width));
        top = Math.max(0, Math.min(top, baseMeta.height - overlayMeta.height));

        console.log(`[Stamp] Pixel Position: left=${left}, top=${top}, width=${targetWidthPx}`);

        // 6. 합성 (Composite)
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
                        console.log(`[Seedream] 합성 완료. URL: ${finalUrl}`);
                        if (!finalUrl) throw new Error('URL extraction failed from generated result');
                        return finalUrl;
                    }
                    throw new Error('상태는 완료되었으나 생성된 이미지가 없습니다.');
                } else if (status === 'FAILED') {
                    throw new Error('이미지 합성 태스크 실패 (Freepik 쪽 오류)');
                }
                await sleep(POLLING_INTERVAL);
            } else {
                throw new Error('상태 확인 응답이 올바르지 않습니다.');
            }
        } catch (err) {
            console.error(`[Seedream] 폴링 중 오류: ${err.message}`);
            if (Date.now() - startTime > POLLING_TIMEOUT) throw err;
            await sleep(POLLING_INTERVAL);
        }
    }
    throw new Error(`이미지 합성 시간 초과 (${POLLING_TIMEOUT}ms)`);
}

/**
 * Seedream v4-edit을 이용한 이미지 합성 함수 (Hybrid Engineering Optimized)
 */
export async function safeComposeWithSeedream(baseImageUrl, overlayImageData, compositingInfo) {
    try {
        console.log('[safeComposeWithSeedream] Hybrid Composition v3 (Strict Fidelity) Start');
        const type = compositingInfo.synthesisType || 'person'; // person, product, logo

        let finalImagePayload = {};
        let references = [];
        let finalPrompt = "";
        let negativePrompt = "";
        let strength = 0.5;
        let guidanceScale = 15.0;

        let baseDescription = compositingInfo.sceneDescription || "High quality photo";

        // Remove hallucinogenic keywords
        if (type === 'logo' || type === 'product') {
            baseDescription = baseDescription.replace(/ARRI|Alexa|Canon|camera|advertisement|text|font|typography|logo|packshot|product shot/gi, "");
            if (baseDescription.length > 100) baseDescription = baseDescription.substring(0, 100);
        }

        // ===================================
        // 🚀 TYPE A: LOGO (Stamp + Minimal AI)
        // ===================================
        if (type === 'logo') {
            const stampedBase64 = await stampImage(baseImageUrl, overlayImageData, 'logo', compositingInfo);
            finalImagePayload = { base64: stampedBase64 };

            references = [];
            strength = 0.20; // Shape preservation
            guidanceScale = 15.0; // Strict adherence

            finalPrompt = `${baseDescription}. seamless integration of the logo, natural lighting, photorealistic, 8k. Do not distort text.`;
            negativePrompt = "text distortion, font change, hallucination, new letters, 3d render, blurry";
        }

        // ===================================
        // 🚀 TYPE B: PRODUCT (Stamp + Shadow AI ONLY)
        // ===================================
        else if (type === 'product') {
            const stampedBase64 = await stampImage(baseImageUrl, overlayImageData, 'product', compositingInfo);
            finalImagePayload = { base64: stampedBase64 };

            references = [];
            // 🔥 EMERGENCY FIX: Strength lowered to 0.12 (from 0.35)
            // This ensures NO RE-GENERATION of the object, only slight blending with background noise/lighting.
            strength = 0.12;
            guidanceScale = 20.0; // 🔥 Force strict adherence to the input image (stamped)

            // 🔥 USER MANDATED PROMPT
            finalPrompt = `Maintain the original product's detail and shape perfectly, only adjust the lighting and shadows to match the background. ${baseDescription}`;

            negativePrompt = "distortion, shape change, new object, text, watermark, logo, hallucination, painting, cartoon, drawing, low quality";
        }

        // ===================================
        // 🚀 TYPE C: PERSON (Classic Reference)
        // ===================================
        else {
            finalImagePayload = { url: baseImageUrl };

            if (overlayImageData.startsWith('http')) {
                references.push({ image: { url: overlayImageData } });
            } else {
                const base64Clean = overlayImageData.replace(/^data:image\/\w+;base64,/, "");
                references.push({ image: { base64: base64Clean } });
            }

            strength = 0.65;
            guidanceScale = 15.0;

            const meta = compositingInfo.personMetadata || {};
            const identityTags = [
                meta.nationality ? `${meta.nationality}` : '',
                meta.gender || 'person',
                meta.age ? `(${meta.age}s)` : ''
            ].filter(Boolean).join(' ');

            const subjectPrompt = identityTags ? `Close up shot of a ${identityTags}, ` : '';
            finalPrompt = `${subjectPrompt}${baseDescription}. Perfect face swap, seamless identity transfer, maintain pose. 8k.`;
            negativePrompt = "wrong gender, different age, distorted face, bad anatomy";
        }

        const url = getTextToImageUrl();
        const payload = {
            prompt: finalPrompt,
            reference_images: references.length > 0 ? references : undefined,
            num_images: 1,
            image: finalImagePayload,
            strength: strength,
            guidance_scale: guidanceScale,
            num_inference_steps: 40,
            negative_prompt: negativePrompt,
            aspect_ratio: compositingInfo?.aspectRatio || undefined
        };

        const result = await safeCallFreepik(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        }, 'seedream-compose', 'start-task');

        if (!result || !result.data || !result.data.task_id) {
            throw new Error('Seedream ID not returned');
        }

        const taskId = result.data.task_id;
        console.log(`[Seedream] Task ID: ${taskId}, Polling...`);

        await sleep(3000);
        const finalImageUrl = await pollSeedreamStatus(taskId);

        return {
            success: true,
            imageUrl: finalImageUrl,
            engine: 'seedream-v4-hybrid'
        };

    } catch (err) {
        console.error('[safeComposeWithSeedream] Error:', err);
        throw err;
    }
}

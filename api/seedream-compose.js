// api/seedream-compose.js - Freepik Seedream Integration for Image Composition
// 사용자 요청: NanoBanana(Gemini) 대체용, Async -> Sync 변환 처리

import { safeCallFreepik } from '../src/utils/apiHelpers.js';
import { getTextToImageUrl, getTextToImageStatusUrl } from '../src/utils/engineConfigLoader.js';

const POLLING_TIMEOUT = 180000; // 3분 타임아웃
const POLLING_INTERVAL = 3000; // 3초 간격 폴링

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 🔥 태스크 상태 폴링 (내부적으로 처리하여 Sync처럼 동작하게 함)
async function pollSeedreamStatus(taskId) {
    const startTime = Date.now();

    while (Date.now() - startTime < POLLING_TIMEOUT) {
        try {
            // console.log(`[Seedream] 태스크 ${taskId} 상태 확인 중...`);

            // Freepik 표준 상태 확인 URL (Dynamic)
            const url = getTextToImageStatusUrl(taskId);

            const result = await safeCallFreepik(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            }, 'seedream-compose', `status-${taskId}`);

            if (result && result.data) {
                const { status, generated } = result.data;

                if (status === 'COMPLETED') {
                    if (generated && generated.length > 0) {
                        // 🔥 Fix: generated[0] can be a string (URL) or object {url: ...}
                        const finalUrl = typeof generated[0] === 'string' ? generated[0] : generated[0].url;
                        console.log(`[Seedream] 합성 완료. URL: ${finalUrl}`);

                        if (!finalUrl) {
                            console.error('[Seedream] generated[0] structure:', JSON.stringify(generated[0]));
                            throw new Error('URL extraction failed from generated result');
                        }
                        return finalUrl;
                    }
                    throw new Error('상태는 완료되었으나 생성된 이미지가 없습니다.');
                } else if (status === 'FAILED') {
                    throw new Error('이미지 합성 태스크 실패 (Freepik 쪽 오류)');
                }

                // 대기 후 재시도
                await sleep(POLLING_INTERVAL);

            } else {
                throw new Error('상태 확인 응답이 올바르지 않습니다.');
            }

        } catch (err) {
            console.error(`[Seedream] 폴링 중 오류: ${err.message}`);
            // 치명적 오류가 아니면 계속 시도 (네트워크 일시 오류 등)
            if (Date.now() - startTime > POLLING_TIMEOUT) throw err;
            await sleep(POLLING_INTERVAL);
        }
    }

    throw new Error(`이미지 합성 시간 초과 (${POLLING_TIMEOUT}ms)`);
}

/**
 * Seedream v4-edit을 이용한 이미지 합성 함수
 * @param {string} baseImageUrl - 배경 이미지 URL
 * @param {string} overlayImageData - 오버레이 이미지 (URL 또는 Base64)
 * @param {object} compositingInfo - 합성 컨텍스트 정보
 */
export async function safeComposeWithSeedream(baseImageUrl, overlayImageData, compositingInfo) {
    try {
        console.log('[safeComposeWithSeedream] 합성 시작 (Freepik v4-edit)');

        // 🔥 1. 프롬프트 구성 (User Defined Strict Prompts)
        const type = compositingInfo.synthesisType || 'person'; // person, product, logo
        let strictPrompt = "";
        let subjectPrompt = "";

        if (type === 'person') {
            const meta = compositingInfo.personMetadata || {};
            const identityDesc = [
                meta.nationality ? `${meta.nationality}` : '',
                meta.gender || 'person',
                meta.age ? `(${meta.age}s)` : ''
            ].filter(Boolean).join(' ');

            // Person Prompt
            subjectPrompt = identityDesc ? `Close up shot of a ${identityDesc}, ` : '';
            strictPrompt = "Perfect face and body swap using the uploaded reference image. Seamlessly transfer the identity, facial features, and body structure of the reference person into the source scene. Adapt the fit of the original clothing (e.g., jacket, pants) to naturally match the reference person's gender and physique. Maintain the original pose, lighting, and background details. High fidelity, photorealistic, 8k resolution.";

        } else if (type === 'product') {
            // Product Prompt
            strictPrompt = "Seamless product replacement. Replace the original object with the uploaded product image. Maintain 100% fidelity to the uploaded product's texture, color, shape, and branding details. Integrate the new product naturally into the scene by applying the source image's lighting, shadows, and perspective. Photorealistic finish, commercial photography quality.";

        } else if (type === 'logo') {
            // Logo Prompt (User Mandated "Pixel Perfect" Strategy)
            strictPrompt = "EXACTLY replicate the reference image's brand graphics: identical shape, exact colors, precise geometry, original spelling and letterforms. Place this perfect copy floating distinctly ON TOP of the background image without any blending, distortion, recoloring, or stylistic changes. Maintain pixel-perfect fidelity to the uploaded reference as a non-integrated overlay. Photorealistic composition, sharp edges, no transparency effects.";
        }

        let basePrompt = compositingInfo.sceneDescription
            ? `${compositingInfo.sceneDescription}`
            : "High quality photo, ultra realistic";

        // 🔥 CRITICAL FIX: Sanitize prompt for LOGO mode
        // Remove camera brands and "Product/Packshot" terms that cause hallucinations
        if (type === 'logo') {
            // 1. Remove "Transition" instructions (Video prompts often have "followed by...")
            const transitionSplit = basePrompt.split(/followed by|transition to|then|next scene/i);
            basePrompt = transitionSplit[0];

            // 2. Remove specific hallucination triggers
            basePrompt = basePrompt.replace(/ARRI|Alexa|Canon|Sony|Nikon|Red|shot on|camera|advertisement|text|font|typography|packshot|product shot|white background|studio lighting|earbuds|headphones|charging case|logo/gi, "");

            // 3. Limit length to avoid overwhelming the Logo instruction
            if (basePrompt.length > 100) basePrompt = basePrompt.substring(0, 100);

            // 4. Add safety prefix
            basePrompt = `Preserve the original scene: ${basePrompt}`;
        }

        // 최종 프롬프트 조합
        // For Logo, we want strict adherence to the strictPrompt and Reference Image. 
        // We minimize the basePrompt to just context.
        const finalPrompt = type === 'person'
            ? `${subjectPrompt}${basePrompt}, ${strictPrompt}`
            : type === 'logo'
                ? `${basePrompt}. ${strictPrompt}` // 🔥 CRITICAL FIX: Re-enable scene context to prevent random generation
                : `${strictPrompt}, ${basePrompt}`;

        // 2. 입력 이미지 구성 (Reference Image)
        const references = [];
        if (overlayImageData.startsWith('http')) {
            references.push({ image: { url: overlayImageData } });
        } else {
            const base64Clean = overlayImageData.replace(/^data:image\/\w+;base64,/, "");
            references.push({ image: { base64: base64Clean } });
        }

        const url = getTextToImageUrl();

        // 🔥 Dynamic Parameters based on Strategy
        let strength = 0.65;
        let guidanceScale = 15.0;
        // Default Negative Prompt
        let negativePrompt = "deformed, distorted, wrong identity, mixed race, different person, blurry, low quality, bad anatomy, ghosting, text, watermark";

        if (type === 'person') {
            strength = 0.65;
            guidanceScale = 15.0;
        } else if (type === 'product') {
            strength = 0.75; // Balance: Limit background damage while forcing object change
            guidanceScale = 20.0; // 🔥 MAX ADHERENCE to "Seamless replacement"
        } else if (type === 'logo') {
            // 🔥 FIXED: Strength 0.05 was too low to Insert new pixels. 
            // 0.40 allows inserting the logo while keeping 60% of original coherence.
            strength = 0.40;
            guidanceScale = 20.0; // 🔥 HARD LIMIT: Force "Pixel Perfect" copy
            // 🔥 Strict Negative Prompt
            negativePrompt = "hallucination, text, letters, typography, new design, variation, distortion, rendering, 3d, shadow, wall texture, background change, creative, artistic";
        }

        const payload = {
            prompt: finalPrompt,
            reference_images: references,
            num_images: 1,
            image: { url: baseImageUrl },
            strength: strength,
            guidance_scale: guidanceScale,
            num_inference_steps: 40, // 🔥 Increased to 40 as requested
            negative_prompt: negativePrompt,
            // 🔥 Dynamic Aspect Ratio
            aspect_ratio: compositingInfo?.aspectRatio || undefined
        };

        // 🔥 COMPREHENSIVE DEBUG LOGGING
        console.log(`\n========================================`);
        console.log(`[Seedream Compose] 합성 요청 시작`);
        console.log(`========================================`);
        console.log(`📍 씬 정보:`);
        console.log(`   - Scene Number: ${compositingInfo?.sceneNumber || 'N/A'}`);
        console.log(`   - Scene Context: ${compositingInfo?.sceneDescription?.substring(0, 100) || 'N/A'}...`);
        console.log(`🎨 합성 타입: ${type.toUpperCase()}`);
        console.log(`📝 최종 프롬프트 (${finalPrompt.length}자):`);
        console.log(`   "${finalPrompt.substring(0, 200)}..."`);
        console.log(`⚙️  파라미터:`);
        console.log(`   - Strength: ${strength} (${(1 - strength) * 100}% 원본 보존)`);
        console.log(`   - Guidance Scale: ${guidanceScale}`);
        console.log(`   - Inference Steps: ${payload.num_inference_steps}`);
        console.log(`🚫 Negative Prompt: ${negativePrompt.substring(0, 100)}...`);
        console.log(`🖼️  참조 이미지 개수: ${references.length}`);
        console.log(`========================================\n`);

        const result = await safeCallFreepik(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
                // x-freepik-api-key는 safeCallFreepik 내부에서 처리됨
            },
            body: JSON.stringify(payload)
        }, 'seedream-compose', 'start-task');

        if (!result || !result.data || !result.data.task_id) {
            throw new Error('Seedream 태스크 생성 실패: ID 반환 안됨');
        }

        const taskId = result.data.task_id;
        console.log(`[Seedream] 태스크 생성 성공: ${taskId}, 3초 대기 후 폴링 시작...`);

        // 4. 비동기 폴링 -> 동기 결과 반환
        // 🔥 중요: 태스크 생성 직후 바로 조회하면 404가 뜰 수 있으므로 잠시 대기
        await sleep(3000);

        const finalImageUrl = await pollSeedreamStatus(taskId);

        return {
            success: true,
            imageUrl: finalImageUrl,
            engine: 'seedream-v4-edit'
        };

    } catch (err) {
        console.error('[safeComposeWithSeedream] 합성 실패:', err);
        throw err;
    }
}

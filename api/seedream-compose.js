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

        // 1. 프롬프트 구성
        const prompt = compositingInfo.sceneDescription
            ? `High quality photo, ${compositingInfo.sceneDescription}, highly detailed, photorealistic, 8k`
            : "High quality photo, ultra realistic, seamless composition, 8k";

        // 2. 입력 이미지 구성 (reference_images)
        // 🔥 수정: '인물 합성'을 위해 Base 이미지는 Input으로, 인물 이미지는 Reference로 분리
        // Base Image -> Input Image (Main Canvas)
        // Person Image -> Reference Image (Content/Style Guide)

        const references = [];

        // Overlay Image (Person) -> Reference로 추가
        if (overlayImageData.startsWith('http')) {
            references.push({
                image: { url: overlayImageData }
            });
        } else {
            const base64Clean = overlayImageData.replace(/^data:image\/\w+;base64,/, "");
            references.push({
                image: { base64: base64Clean }
            });
        }

        // 3. API 요청 (Generation Endpoint 유지: v4)
        // 🔥 수정: 'seedream' (404) -> 'seedream-v4' (Valid)
        const url = getTextToImageUrl();

        const payload = {
            prompt: `${prompt}, featuring the person from reference image, detailed face, accurate likeness`,
            reference_images: references, // 인물 이미지만 참조
            num_images: 1,
            image: { url: baseImageUrl }, // Base 이미지를 Input(Img2Img)으로 설정하여 배경/구도 유지
            strength: 0.75, // 🔥 Allow more changes to the base image to blend the person (0.75)
            guidance_scale: 3.5, // Increase guidance to respect prompt/ref more
            num_inference_steps: 25,
            // 🔥 매핑된 AR 추가 (Generation Endpoint 필수값일 수 있음)
            aspect_ratio: 'widescreen_16_9'
        };

        console.log('[Seedream] 요청 Payload: Img2Img (Base) + Reference (Person)');

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

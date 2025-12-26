// api/seedream-compose.js - Freepik Seedream Integration for Image Composition
// 사용자 요청: NanoBanana(Gemini) 대체용, Async -> Sync 변환 처리

import { safeCallFreepik } from '../src/utils/apiHelpers.js';

const POLLING_TIMEOUT = 180000; // 3분 타임아웃
const POLLING_INTERVAL = 3000; // 3초 간격 폴링

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 🔥 태스크 상태 폴링 (내부적으로 처리하여 Sync처럼 동작하게 함)
async function pollSeedreamStatus(taskId) {
    const startTime = Date.now();

    while (Date.now() - startTime < POLLING_TIMEOUT) {
        try {
            // console.log(`[Seedream] 태스크 ${taskId} 상태 확인 중...`);

            // Freepik 표준 상태 확인 URL
            const url = `https://api.freepik.com/v1/ai/text-to-image/${taskId}`;

            const result = await safeCallFreepik(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            }, 'seedream-compose', `status-${taskId}`);

            if (result && result.data) {
                const { status, generated } = result.data;

                if (status === 'COMPLETED') {
                    if (generated && generated.length > 0) {
                        console.log(`[Seedream] 합성 완료. URL: ${generated[0].url}`);
                        return generated[0].url; // 최종 이미지 URL 반환
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
        // Freepik 문서에 따르면 reference_images는 [{ image: { url: ... } }] 형태일 수 있음.
        // 사용자 요청 스펙: reference_images[]: Base64 또는 URL (최대 5개)
        // 실제 API 스펙에 맞춰 조정: { image: { url: ... } } 또는 { image: { base64: ... } }

        const references = [];

        // Base Image
        references.push({
            image: { url: baseImageUrl }
        });

        // Overlay Image (URL or Base64 check)
        if (overlayImageData.startsWith('http')) {
            references.push({
                image: { url: overlayImageData }
            });
        } else {
            // Base64인 경우 헤더 제거 (data:image/png;base64, 부분 제거 필요할 수 있음)
            // Freepik은 보통 pure base64를 원함.
            const base64Clean = overlayImageData.replace(/^data:image\/\w+;base64,/, "");
            references.push({
                image: { base64: base64Clean }
            });
        }

        // 3. API 요청
        // 🔥 수정: v4-edit -> v4 (Generation)으로 변경 (Composition 목적)
        // Edit 엔드포인트는 Mask가 없으면 400 오류 가능성이 높음.
        // Composition은 'Generation with References'로 처리하는 것이 안전함.
        const url = 'https://api.freepik.com/v1/ai/text-to-image/seedream';

        const payload = {
            prompt: prompt,
            reference_images: references, // Base + Overlay 모두 참조로 전달
            num_images: 1,
            // image: { url: baseImageUrl }, // Img2Img 대신 순수 Reference 기반 생성 시도
            guidance_scale: 2.5,
            num_inference_steps: 20
        };

        console.log('[Seedream] 요청 Payload 구성 중...');

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
        console.log(`[Seedream] 태스크 생성 성공: ${taskId}, 폴링 시작...`);

        // 4. 비동기 폴링 -> 동기 결과 반환
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

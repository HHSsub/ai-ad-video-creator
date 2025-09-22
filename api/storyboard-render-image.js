// api/storyboard-render-image.js - Freepik Seedream v4 공식 API 적용

import { safeCallFreepik, getApiKeyStatus } from '../src/utils/apiHelpers.js';

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const POLLING_TIMEOUT = 120000; // 2 minutes
const POLLING_INTERVAL = 3000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 🔥 Seedream v4 태스크 상태 폴링 (공식 API)
async function pollSeedreamV4TaskStatus(taskId, conceptId = 0) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < POLLING_TIMEOUT) {
    try {
      console.log(`[pollSeedreamV4TaskStatus] 태스크 ${taskId.substring(0, 8)} 상태 확인 중... (컨셉: ${conceptId})`);
 
      // 🔥 공식 Seedream v4 상태 확인 엔드포인트
      const url = `${FREEPIK_API_BASE}/ai/text-to-image/seedream-v4/${encodeURIComponent(taskId)}`;
      
      const result = await safeCallFreepik(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }, conceptId, `seedream-v4-status-${taskId.substring(0, 8)}`);

      console.log(`[pollSeedreamV4TaskStatus] 응답:`, result);

      if (result && result.data) {
        const taskData = result.data;
        const status = (taskData.status || '').toUpperCase();

        console.log(`[pollSeedreamV4TaskStatus] 태스크 상태: ${status}`);

        if (status === 'COMPLETED') {
          // 🔥 Seedream v4의 generated 배열에서 이미지 URL 추출
          if (taskData.generated && Array.isArray(taskData.generated) && taskData.generated.length > 0) {
            const imageUrl = taskData.generated[0];
            console.log(`[pollSeedreamV4TaskStatus] ✅ 완료 - 이미지 URL: ${imageUrl.substring(0, 80)}...`);
            return { imageUrl, raw: taskData };
          } else {
            console.warn(`[pollSeedreamV4TaskStatus] COMPLETED 상태이지만 generated 배열이 비어있음`);
            return { imageUrl: null, raw: taskData };
          }
        } else if (status === 'FAILED') {
          throw new Error(`태스크 실패: ${taskData.error || 'Unknown error'}`);
        } else if (['IN_PROGRESS', 'PENDING', 'PROCESSING'].includes(status)) {
          console.log(`[pollSeedreamV4TaskStatus] 진행 중... (${status})`);
          await sleep(POLLING_INTERVAL);
          continue;
        } else {
          console.warn(`[pollSeedreamV4TaskStatus] 알 수 없는 상태: ${status}`);
          await sleep(POLLING_INTERVAL);
          continue;
        }
      }

      await sleep(POLLING_INTERVAL);

    } catch (error) {
      console.error(`[pollSeedreamV4TaskStatus] 폴링 오류:`, error.message);
      await sleep(POLLING_INTERVAL);
    }
  }

  throw new Error(`태스크 ${taskId} 타임아웃 (${POLLING_TIMEOUT / 1000}초 초과)`);
}

// 🔥 Freepik Seedream v4 공식 API 호출
async function generateImageWithSeedreamV4(imagePrompt, conceptId = 0) {
  console.log('[generateImageWithSeedreamV4] Seedream v4 공식 API 사용:', {
    prompt: imagePrompt.prompt,
    aspectRatio: imagePrompt.aspect_ratio,
    seed: imagePrompt.seed,
    conceptId: conceptId
  });

  // 🔥 공식 Seedream v4 생성 엔드포인트
  const endpoint = `${FREEPIK_API_BASE}/ai/text-to-image/seedream-v4`;
 
  // 🔥 Seedream v4 공식 파라미터 구조
  const requestBody = {
    prompt: imagePrompt.prompt,
    aspect_ratio: imagePrompt.aspect_ratio || "widescreen_16_9",
    guidance_scale: imagePrompt.guidance_scale || 2.5,
    seed: imagePrompt.seed || Math.floor(Math.random() * 1000000),
    webhook_url: null // 웹훅 사용 안함 (폴링 방식)
  };

  // 🔥 레퍼런스 이미지가 있는 경우 추가
  if (imagePrompt.reference_images && Array.isArray(imagePrompt.reference_images) && imagePrompt.reference_images.length > 0) {
    requestBody.reference_images = imagePrompt.reference_images;
  }

  // undefined/null 값 정리
  Object.keys(requestBody).forEach(key => {
    const v = requestBody[key];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      delete requestBody[key];
    }
  });

  console.log('[generateImageWithSeedreamV4] API 요청 엔드포인트:', endpoint);
  console.log('[generateImageWithSeedreamV4] 요청 바디:', {
    promptPreview: requestBody.prompt.substring(0, 100) + '...',
    aspectRatio: requestBody.aspect_ratio,
    guidanceScale: requestBody.guidance_scale,
    seed: requestBody.seed,
    conceptId: conceptId
  });

  try {
    // 🔥 Seedream v4 태스크 생성
    const result = await safeCallFreepik(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }, conceptId, `seedream-v4-create-concept-${conceptId}`);

    console.log('[generateImageWithSeedreamV4] 태스크 생성 응답:', result);

    if (!result || !result.data || !result.data.task_id) {
      throw new Error('태스크 ID를 받지 못했습니다 (Freepik Seedream v4 응답 비정상)');
    }

    const taskId = result.data.task_id;
    console.log(`[generateImageWithSeedreamV4] 태스크 생성 완료: ${taskId} (컨셉: ${conceptId})`);

    // 폴링으로 완료될 때까지 대기
    const pollResult = await pollSeedreamV4TaskStatus(taskId, conceptId);

    const imageUrl = pollResult.imageUrl || null;

    return {
      success: true,
      imageUrl: imageUrl,
      method: 'freepik-seedream-v4-polling-keypool',
      taskId: taskId,
      conceptId: conceptId,
      raw: pollResult.raw
    };

  } catch (error) {
    console.error('[generateImageWithSeedreamV4] 전체 실패 (컨셉:', conceptId, '):', error);
    throw error;
  }
}

// 폴백 이미지 생성 (디자인/디버깅 용)
function generateFallbackImage(sceneNumber, conceptId) {
  const themes = [
    { bg: '2563EB', text: 'FFFFFF', label: 'Professional+Business' },
    { bg: '059669', text: 'FFFFFF', label: 'Product+Showcase' },
    { bg: 'DC2626', text: 'FFFFFF', label: 'Lifestyle+Scene' },
    { bg: '7C2D12', text: 'FFFFFF', label: 'Premium+Brand' },
    { bg: '4338CA', text: 'FFFFFF', label: 'Innovation+Tech' },
    { bg: '0891B2', text: 'FFFFFF', label: 'Call+To+Action' }
  ];

  const themeIndex = ((sceneNumber || 1) - 1) % themes.length;
  const theme = themes[themeIndex];

  return `https://via.placeholder.com/1920x1080/${theme.bg}/${theme.text}?text=${theme.label}+Scene+${sceneNumber || 1}`;
}

export default async function handler(req, res) {
  // CORS 기본 처리
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();

  try {
    let { imagePrompt, sceneNumber, conceptId, prompt } = req.body || {};

    console.log('[storyboard-render-image] 요청 수신:', {
      sceneNumber,
      conceptId,
      hasImagePrompt: !!imagePrompt,
      legacyPrompt: !!prompt,
      promptPreview: (imagePrompt?.prompt || prompt || '').substring(0, 200)
    });

    // 🔥 API 키 상태 확인
    const keyStatus = getApiKeyStatus();
    console.log(`[storyboard-render-image] Freepik API 키 상태: ${keyStatus.freepik.availableKeys}/${keyStatus.freepik.totalKeys}개 사용가능`);

    // 🔥 하위 호환 - 구형 형식을 Seedream v4 형식으로 변환
    if (!imagePrompt && prompt) {
      imagePrompt = {
        prompt,
        aspect_ratio: 'widescreen_16_9',
        guidance_scale: 2.5,
        seed: Math.floor(Math.random() * 1000000)
      };
      console.log('[storyboard-render-image] 구형 요청을 Seedream v4 imagePrompt로 변환');
    }

    // 🔥 imagePrompt 구조를 Seedream v4 형식으로 정규화
    if (imagePrompt) {
      // 기존 구조에서 Seedream v4 파라미터로 매핑
      const normalizedPrompt = {
        prompt: imagePrompt.prompt || imagePrompt.image_prompt?.prompt,
        aspect_ratio: imagePrompt.aspect_ratio || 
                     imagePrompt.image?.size || 
                     imagePrompt.size || 
                     'widescreen_16_9',
        guidance_scale: imagePrompt.guidance_scale || 
                       imagePrompt.image_prompt?.guidance_scale || 
                       2.5,
        seed: imagePrompt.seed || 
              imagePrompt.image_prompt?.seed || 
              Math.floor(Math.random() * 1000000)
      };
      
      imagePrompt = normalizedPrompt;
    }

    if (!imagePrompt || !imagePrompt.prompt || typeof imagePrompt.prompt !== 'string' || imagePrompt.prompt.trim().length < 5) {
      console.error('[storyboard-render-image] 유효하지 않은 imagePrompt:', imagePrompt);
      return res.status(400).json({
        error: 'Valid imagePrompt required',
        received: imagePrompt
      });
    }

    // API 키가 없으면 폴백 이미지 반환
    if (keyStatus.freepik.totalKeys === 0) {
      console.error('[storyboard-render-image] Freepik API 키가 없음');
      const fallbackUrl = generateFallbackImage(sceneNumber, conceptId);
      return res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        message: 'API 키 없음',
        processingTime: Date.now() - startTime,
        metadata: { error: 'no_api_key' }
      });
    }

    console.log(`[storyboard-render-image] 컨셉 ${conceptId}에 대한 Seedream v4 키 풀 활용 시작`);

    try {
      // 🔥 Seedream v4로 이미지 생성
      const result = await generateImageWithSeedreamV4(imagePrompt, conceptId || 0);

      const processingTime = Date.now() - startTime;

      console.log('[storyboard-render-image] ✅ 성공 완료:', {
        sceneNumber,
        conceptId,
        imageUrl: result.imageUrl,
        processingTime: processingTime + 'ms',
        taskId: result.taskId,
        keyPoolUsed: true
      });

      // 🔥 최종 API 키 상태 로깅
      const finalKeyStatus = getApiKeyStatus();

      return res.status(200).json({
        success: true,
        url: result.imageUrl,
        processingTime: processingTime,
        method: result.method,
        fallback: false,
        metadata: {
          sceneNumber,
          conceptId,
          promptUsed: imagePrompt.prompt,
          apiProvider: 'Freepik Seedream v4 2025 KeyPool',
          aspectRatio: imagePrompt.aspect_ratio,
          guidanceScale: imagePrompt.guidance_scale,
          seed: imagePrompt.seed,
          taskId: result.taskId,
          raw: result.raw || null,
          keyPoolStatus: {
            totalKeys: finalKeyStatus.freepik.totalKeys,
            availableKeys: finalKeyStatus.freepik.availableKeys,
            conceptId: conceptId,
            keyDistribution: 'round_robin_by_concept'
          }
        }
      });

    } catch (freepikError) {
      console.error('[storyboard-render-image] Freepik 호출 실패:', freepikError && freepikError.message ? freepikError.message : String(freepikError));

      const fallbackUrl = generateFallbackImage(sceneNumber, conceptId);

      // 🔥 에러 시에도 키 풀 상태 포함
      const errorKeyStatus = getApiKeyStatus();

      return res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        processingTime: Date.now() - startTime,
        error: freepikError && freepikError.message ? freepikError.message : String(freepikError),
        metadata: {
          sceneNumber,
          conceptId,
          promptUsed: imagePrompt.prompt,
          apiProvider: 'Fallback',
          originalError: freepikError && freepikError.message ? freepikError.message : String(freepikError),
          keyPoolStatus: {
            totalKeys: errorKeyStatus.freepik.totalKeys,
            availableKeys: errorKeyStatus.freepik.availableKeys,
            errorOccurred: true
          }
        }
      });
    }

  } catch (error) {
    console.error('[storyboard-render-image] 전체 시스템 오류:', error);

    const fallbackUrl = generateFallbackImage(
      req.body?.sceneNumber || 1,
      req.body?.conceptId || 1
    );

    return res.status(200).json({
      success: true,
      url: fallbackUrl,
      fallback: true,
      processingTime: Date.now() - startTime,
      error: error.message || String(error),
      metadata: {
        systemError: true,
        originalError: error.message || String(error)
      }
    });
  }
}

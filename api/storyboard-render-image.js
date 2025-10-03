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
            return { imageUrl, status: 'COMPLETED', raw: taskData };
          } else {
            throw new Error('COMPLETED 상태이지만 generated 배열이 비어있습니다');
          }
        }

        if (status === 'FAILED' || status === 'ERROR') {
          throw new Error(`Seedream v4 태스크 실패: ${status}`);
        }

        if (status === 'PENDING' || status === 'PROCESSING' || status === 'CREATED') {
          console.log(`[pollSeedreamV4TaskStatus] 대기 중... (${status})`);
          await sleep(POLLING_INTERVAL);
          continue;
        }

        throw new Error(`알 수 없는 태스크 상태: ${status}`);
      } else {
        throw new Error('응답에 data 필드가 없습니다');
      }

    } catch (error) {
      if (Date.now() - startTime >= POLLING_TIMEOUT) {
        throw new Error(`Seedream v4 태스크 타임아웃 (${POLLING_TIMEOUT}ms 초과)`);
      }
      
      console.error(`[pollSeedreamV4TaskStatus] 폴링 에러 (컨셉: ${conceptId}):`, error);
      
      if (error.message.includes('FAILED') || error.message.includes('ERROR')) {
        throw error;
      }
      
      await sleep(POLLING_INTERVAL);
    }
  }

  throw new Error(`Seedream v4 태스크 타임아웃 (${POLLING_TIMEOUT}ms)`);
}

// 🔥 Seedream v4 이미지 생성 함수 (키 풀 활용)
async function generateImageWithSeedreamV4(imagePrompt, conceptId = 0) {
  try {
    console.log(`[generateImageWithSeedreamV4] 시작 (컨셉: ${conceptId}):`, {
      prompt: imagePrompt.prompt.substring(0, 100),
      aspect_ratio: imagePrompt.aspect_ratio,
      guidance_scale: imagePrompt.guidance_scale,
      seed: imagePrompt.seed
    });

    // 🔥 Seedream v4 태스크 생성 (키 풀 사용)
    const createUrl = `${FREEPIK_API_BASE}/ai/text-to-image/seedream-v4`;
    
    const createResult = await safeCallFreepik(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(imagePrompt)
    }, conceptId, `seedream-v4-create-concept-${conceptId}`);

    console.log(`[generateImageWithSeedreamV4] 태스크 생성 응답:`, createResult);

    if (!createResult || !createResult.data || !createResult.data.task_id) {
      throw new Error('Seedream v4 태스크 ID를 받지 못했습니다: ' + JSON.stringify(createResult));
    }

    const taskId = createResult.data.task_id;
    console.log(`[generateImageWithSeedreamV4] 태스크 생성 성공 (컨셉: ${conceptId}): ${taskId}`);

    // 🔥 태스크 상태 폴링
    const pollResult = await pollSeedreamV4TaskStatus(taskId, conceptId);

    console.log(`[generateImageWithSeedreamV4] 최종 성공 (컨셉: ${conceptId}):`, {
      imageUrl: pollResult.imageUrl.substring(0, 80),
      status: pollResult.status
    });

    return {
      imageUrl: pollResult.imageUrl,
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
          errorType: 'freepik_api_error',
          keyPoolStatus: {
            totalKeys: errorKeyStatus.freepik.totalKeys,
            availableKeys: errorKeyStatus.freepik.availableKeys
          }
        }
      });
    }

  } catch (error) {
    console.error('[storyboard-render-image] 전체 오류:', error);
    
    const fallbackUrl = generateFallbackImage(req.body?.sceneNumber, req.body?.conceptId);
    
    return res.status(500).json({
      success: false,
      url: fallbackUrl,
      fallback: true,
      error: error.message || String(error),
      processingTime: Date.now() - startTime,
      metadata: {
        errorType: 'server_error'
      }
    });
  }
}

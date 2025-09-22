// api/storyboard-render-image.js - Freepik API 키 풀 시스템 적용
// Freepik Mystic API 공식문서 기반 + 키 풀 분배

import { safeCallFreepik, getApiKeyStatus } from '../src/utils/apiHelpers.js';

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const POLLING_TIMEOUT = 120000; // 2 minutes
const POLLING_INTERVAL = 3000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 태스크 상태 폴링 (Mystic -> Seedream 엔드포인트)
async function pollTaskStatus(taskId, conceptId = 0) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < POLLING_TIMEOUT) {
    try {
      console.log(`[pollTaskStatus] Seedream 태스크 ${taskId.substring(0, 8)} 상태 확인 중... (컨셉: ${conceptId})`);
 
      const url = `${FREEPIK_API_BASE}/ai/text-to-image/seedream-v4/${encodeURIComponent(taskId)}`;
      
      // 🔥 키 풀을 활용한 안전한 API 호출
      const result = await safeCallFreepik(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }, conceptId, `seedream-status-${taskId.substring(0, 8)}`); // mystic -> seedream

      console.log(`[pollTaskStatus] 응답:`, result);

      if (result && result.data) {
        const taskData = result.data;
        const status = (taskData.status || '').toUpperCase();

        console.log(`[pollTaskStatus] 태스크 상태: ${status}`);

        if (status === 'COMPLETED') {
          if (taskData.generated && Array.isArray(taskData.generated) && taskData.generated.length > 0) {
            const imageUrl = taskData.generated[0];
            console.log(`[pollTaskStatus] ✅ 완료 - 이미지 URL: ${imageUrl.substring(0, 80)}...`);
            return { imageUrl, raw: taskData };
          } else {
            console.warn(`[pollTaskStatus] COMPLETED 상태이지만 generated 배열이 비어있음`);
            return { imageUrl: null, raw: taskData };
          }
        } else if (status === 'FAILED') {
          throw new Error(`태스크 실패: ${taskData.error || 'Unknown error'}`);
        } else if (['IN_PROGRESS', 'PENDING', 'PROCESSING'].includes(status)) {
          console.log(`[pollTaskStatus] 진행 중... (${status})`);
          await sleep(POLLING_INTERVAL);
          continue;
        } else {
          console.warn(`[pollTaskStatus] 알 수 없는 상태: ${status}`);
          await sleep(POLLING_INTERVAL);
          continue;
        }
      }

      await sleep(POLLING_INTERVAL);

    } catch (error) {
      console.error(`[pollTaskStatus] 폴링 오류:`, error.message);
      await sleep(POLLING_INTERVAL);
    }
  }

  throw new Error(`태스크 ${taskId} 타임아웃 (${POLLING_TIMEOUT / 1000}초 초과)`);
}

// Freepik Mystic API 공식문서 기반 요청생성 (키 풀 활용)
async function generateImageWithFreepik(imagePrompt, conceptId = 0) {
  console.log('[generateImageWithFreepik] Mystic 모델 스펙 사용 + 키 풀 분배:', {
    prompt: imagePrompt.prompt,
    size: imagePrompt.image?.size,
    style: imagePrompt.styling?.style,
    seed: imagePrompt.seed,
    conceptId: conceptId
  });

  // Mystic 생성 엔드포인트 (문서: POST /v1/ai/mystic)
  const endpoint = `${FREEPIK_API_BASE}/ai/text-to-image/seedream-v4`; // mystic으로하려면 ai/mystic
 
  // 문서 필드명 기준으로 요청 바디 구성
  const requestBody = {
    prompt: imagePrompt.prompt,
    webhook_url: imagePrompt.webhook_url || null,
    structure_reference: imagePrompt.structure_reference || null,
    structure_strength: imagePrompt.structure_strength ?? 50,
    style_reference: imagePrompt.style_reference || null,
    adherence: imagePrompt.adherence ?? 50,
    hdr: imagePrompt.hdr ?? 50,
    resolution: imagePrompt.resolution || (imagePrompt.image?.resolution || "2k"),
    aspect_ratio: imagePrompt.image?.size || imagePrompt.aspect_ratio || "widescreen_16_9",
    model: imagePrompt.model || "realism",
    creative_detailing: imagePrompt.creative_detailing ?? 33,
    engine: imagePrompt.engine || "automatic",
    fixed_generation: imagePrompt.fixed_generation ?? false,
    filter_nsfw: imagePrompt.filter_nsfw ?? true,
    styling: imagePrompt.styling ? {
      styles: imagePrompt.styling?.styles || [],
      characters: imagePrompt.styling?.characters || [],
      colors: imagePrompt.styling?.colors || []
    } : undefined,
    seed: imagePrompt.seed || undefined,
    num_images: imagePrompt.num_images || 1
  };

  // undefined/null/빈값 제거
  Object.keys(requestBody).forEach(key => {
    const v = requestBody[key];
    if (v === undefined || v === null) delete requestBody[key];
    if (typeof v === 'string' && v.trim() === '') delete requestBody[key];
    if (Array.isArray(v) && v.length === 0) delete requestBody[key];
  });

  // styling 내부 정리
  if (requestBody.styling) {
    Object.keys(requestBody.styling).forEach(k => {
      const vv = requestBody.styling[k];
      if (vv === undefined || vv === null) delete requestBody.styling[k];
      if (Array.isArray(vv) && vv.length === 0) delete requestBody.styling[k];
    });
    if (Object.keys(requestBody.styling).length === 0) delete requestBody.styling;
  }

  console.log('[generateImageWithFreepik] API 요청 엔드포인트:', endpoint);
  console.log('[generateImageWithFreepik] 요청 바디 예시 (prompt 절대 자르지 않음):', {
    promptPreview: (imagePrompt.prompt || '').substring(0, 200) + (imagePrompt.prompt && imagePrompt.prompt.length > 200 ? '...[truncated preview]' : ''),
    resolvedBodyKeys: Object.keys(requestBody),
    conceptId: conceptId
  });

  try {
    // 🔥 키 풀을 활용한 안전한 태스크 생성: POST /v1/ai/mystic or /vi/ai/text-to-image/seedream-v4
    const result = await safeCallFreepik(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }, conceptId, `seedream-create-concept-${conceptId}`); // mystic에서 seedream으로 수정했음 

    console.log('[generateImageWithFreepik] 태스크 생성 응답:', result);

    if (!result || !result.data || !result.data.task_id) {
      throw new Error('태스크 ID를 받지 못했습니다 (Freepik 응답 비정상)');
    }

    const taskId = result.data.task_id;
    console.log(`[generateImageWithFreepik] 태스크 생성 완료: ${taskId} (컨셉: ${conceptId})`);

    // 폴링으로 완료될 때까지 대기
    const pollResult = await pollTaskStatus(taskId, conceptId);

    // pollResult: { imageUrl, raw }
    const imageUrl = pollResult.imageUrl || null;

    return {
      success: true,
      imageUrl: imageUrl,
      method: 'freepik-seedream-polling-keypool',
      taskId: taskId,
      conceptId: conceptId,
      raw: pollResult.raw
    };

  } catch (error) {
    console.error('[generateImageWithFreepik] 전체 실패 (컨셉:', conceptId, '):', error);
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

    // 하위 호환 - 구형 형식 지원
    if (!imagePrompt && prompt) {
      imagePrompt = {
        prompt,
        negative_prompt: 'blurry, low quality, watermark, cartoon, distorted',
        image: { size: 'widescreen_16_9' },
        styling: { style: 'photo' },
        seed: Math.floor(10000 + Math.random() * 90000),
        num_images: 1
      };
      console.log('[storyboard-render-image] 구형 요청을 imagePrompt로 래핑');
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

    console.log(`[storyboard-render-image] 컨셉 ${conceptId}에 대한 Freepik 키 풀 활용 시작`);

    try {
      // 🔥 컨셉 ID를 기준으로 키 풀에서 적절한 키 선택하여 이미지 생성
      // 프롬프트 절대 자르지 않음: imagePrompt.prompt 전체를 전달
      const result = await generateImageWithFreepik(imagePrompt, conceptId || 0);

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
          promptUsed: imagePrompt.prompt, // 절대 자르지 않음
          apiProvider: 'Freepik Seedream-v4 2025 KeyPool',
          size: imagePrompt.image?.size || imagePrompt.aspect_ratio,
          style: imagePrompt.styling?.style || null,
          seed: imagePrompt.seed || null,
          taskId: result.taskId,
          raw: result.raw || null,
          // 🔥 키 풀 정보 추가
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
          promptUsed: imagePrompt.prompt, // 절대 자르지 않음
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

// api/storyboard-render-image.js - 전체 코드 (생략 없음)

import { safeCallFreepik, getApiKeyStatus } from '../src/utils/apiKeyManager.js';

async function pollSeedreamV4TaskStatus(taskId, conceptId, maxAttempts = 60, pollInterval = 5000) {
  console.log(`[pollSeedreamV4TaskStatus] 폴링 시작: taskId=${taskId}, conceptId=${conceptId}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const statusEndpoint = `https://api.freepik.com/v1/ai/image-generation/seedream/v4/${taskId}`;
      
      const statusResult = await safeCallFreepik(statusEndpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }, conceptId, `seedream-v4-status-concept-${conceptId}`);

      console.log(`[pollSeedreamV4TaskStatus] 시도 ${attempt}/${maxAttempts}, 상태:`, statusResult?.data?.status);

      if (!statusResult || !statusResult.data) {
        throw new Error('상태 확인 응답이 비정상입니다');
      }

      const status = statusResult.data.status;

      if (status === 'completed') {
        const imageUrl = statusResult.data.output?.url;
        if (!imageUrl) {
          throw new Error('완료되었으나 이미지 URL이 없습니다');
        }
        console.log(`[pollSeedreamV4TaskStatus] ✅ 완료: ${imageUrl}`);
        return {
          success: true,
          imageUrl: imageUrl,
          raw: statusResult.data
        };
      }

      if (status === 'failed' || status === 'error') {
        const errorMsg = statusResult.data.error?.message || 'Seedream v4 태스크 실패';
        throw new Error(errorMsg);
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

    } catch (error) {
      console.error(`[pollSeedreamV4TaskStatus] 시도 ${attempt} 오류:`, error.message);
      if (attempt >= maxAttempts) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(`Seedream v4 태스크 타임아웃 (${maxAttempts}회 시도)`);
}

async function generateImageWithSeedreamV4(imagePrompt, conceptId = 0) {
  if (!imagePrompt || !imagePrompt.prompt) {
    throw new Error('imagePrompt.prompt가 필요합니다');
  }

  const endpoint = 'https://api.freepik.com/v1/ai/image-generation/seedream/v4';

  const requestBody = {
    prompt: imagePrompt.prompt,
    negative_prompt: imagePrompt.negative_prompt || "blurry, low quality, watermark, logo, text",
    aspect_ratio: imagePrompt.aspect_ratio || 'widescreen_16_9',
    guidance_scale: imagePrompt.guidance_scale || 2.5,
    seed: imagePrompt.seed || Math.floor(Math.random() * 1000000),
    webhook: null
  };

  if (imagePrompt.reference_images && Array.isArray(imagePrompt.reference_images) && imagePrompt.reference_images.length > 0) {
    requestBody.reference_images = imagePrompt.reference_images;
  }

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

  return `https://via.placeholder.com/1920x1080/${theme.bg}/${theme.text}?text=Concept+${conceptId}+Scene+${sceneNumber}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();

  try {
    let { imagePrompt, sceneNumber, conceptId, prompt, aspectRatio } = req.body || {};

    console.log('[storyboard-render-image] 🔍 요청 수신:', {
      sceneNumber,
      conceptId,
      hasImagePrompt: !!imagePrompt,
      legacyPrompt: !!prompt,
      imagePromptType: typeof imagePrompt,
      imagePromptKeys: imagePrompt ? Object.keys(imagePrompt) : []
    });

    const keyStatus = getApiKeyStatus();
    console.log(`[storyboard-render-image] Freepik API 키 상태: ${keyStatus.freepik.availableKeys}/${keyStatus.freepik.totalKeys}개 사용가능`);

    if (!imagePrompt && prompt) {
      console.log('[storyboard-render-image] ⚠️ 레거시 prompt 형식 감지, imagePrompt로 변환');
      imagePrompt = {
        prompt,
        negative_prompt: "blurry, low quality, watermark, text, logo",
        aspect_ratio: aspectRatio || 'widescreen_16_9',
        guidance_scale: 2.5,
        seed: Math.floor(Math.random() * 1000000)
      };
    }

    if (imagePrompt) {
      const promptText = imagePrompt.prompt || 
                         imagePrompt.image_prompt?.prompt || 
                         imagePrompt.text || 
                         '';

      if (!promptText || promptText.trim().length < 5) {
        console.error('[storyboard-render-image] ❌ 유효하지 않은 prompt:', imagePrompt);
        return res.status(400).json({
          success: false,
          error: 'Valid prompt required (minimum 5 characters)',
          received: imagePrompt
        });
      }

      const normalizedPrompt = {
        prompt: promptText,
        negative_prompt: imagePrompt.negative_prompt || 
                        imagePrompt.image_prompt?.negative_prompt || 
                        "blurry, low quality, watermark, text, logo",
        aspect_ratio: imagePrompt.aspect_ratio || 
                     imagePrompt.image?.size || 
                     imagePrompt.size || 
                     aspectRatio ||
                     'widescreen_16_9',
        guidance_scale: imagePrompt.guidance_scale || 
                       imagePrompt.image_prompt?.guidance_scale || 
                       2.5,
        seed: imagePrompt.seed || 
              imagePrompt.image_prompt?.seed || 
              Math.floor(Math.random() * 1000000),
        styling: imagePrompt.styling || {
          style: 'photo',
          color: 'color',
          lighting: 'natural'
        }
      };

      imagePrompt = normalizedPrompt;
      
      console.log('[storyboard-render-image] ✅ imagePrompt 정규화 완료:', {
        promptPreview: imagePrompt.prompt.substring(0, 100) + '...',
        aspect_ratio: imagePrompt.aspect_ratio,
        guidance_scale: imagePrompt.guidance_scale,
        seed: imagePrompt.seed
      });
    } else {
      console.error('[storyboard-render-image] ❌ imagePrompt와 prompt 모두 없음');
      return res.status(400).json({
        success: false,
        error: 'imagePrompt or prompt is required'
      });
    }

    if (keyStatus.freepik.totalKeys === 0) {
      console.error('[storyboard-render-image] Freepik API 키가 없음');
      const fallbackUrl = generateFallbackImage(sceneNumber, conceptId);
      return res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        message: 'API 키 없음 - 폴백 이미지 사용',
        processingTime: Date.now() - startTime,
        metadata: { 
          error: 'no_api_key',
          sceneNumber,
          conceptId
        }
      });
    }

    console.log(`[storyboard-render-image] 🚀 컨셉 ${conceptId}, 씬 ${sceneNumber} Seedream v4 키 풀 활용 시작`);

    try {
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
      console.error('[storyboard-render-image] ❌ Freepik 호출 실패:', freepikError.message);

      const fallbackUrl = generateFallbackImage(sceneNumber, conceptId);

      const errorKeyStatus = getApiKeyStatus();

      return res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        processingTime: Date.now() - startTime,
        error: freepikError.message,
        metadata: {
          sceneNumber,
          conceptId,
          promptUsed: imagePrompt.prompt,
          apiProvider: 'Fallback',
          originalError: freepikError.message,
          keyPoolStatus: {
            totalKeys: errorKeyStatus.freepik.totalKeys,
            availableKeys: errorKeyStatus.freepik.availableKeys,
            errorOccurred: true
          }
        }
      });
    }

  } catch (error) {
    console.error('[storyboard-render-image] ❌ 전체 시스템 오류:', error);

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

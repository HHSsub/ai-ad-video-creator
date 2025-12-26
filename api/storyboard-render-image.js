import { safeCallFreepik, getApiKeyStatus } from '../src/utils/apiHelpers.js';
import { getTextToImageUrl, getTextToImageStatusUrl } from '../src/utils/engineConfigLoader.js';
import { uploadImageToS3, uploadBufferToS3 } from '../server/utils/s3-uploader.js';
import { safeComposeWithSeedream } from './seedream-compose.js';

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const POLLING_TIMEOUT = 120000; // 2 minutes
const POLLING_INTERVAL = 3000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 🔥 동적 엔진 이미지 생성 태스크 상태 폴링 (엔진 독립적 + S3 업로드)
async function pollTaskStatus(taskId, conceptId = 0, projectId = null, sceneNumber = null) {
  const startTime = Date.now();

  while (Date.now() - startTime < POLLING_TIMEOUT) {
    try {
      console.log(`[pollTaskStatus] 태스크 ${taskId.substring(0, 8)} 상태 확인 중... (컨셉: ${conceptId})`);

      // 🔥 동적 URL 생성 - engines.json의 현재 엔진 사용
      const url = getTextToImageStatusUrl(taskId);

      const result = await safeCallFreepik(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }, conceptId, `image-status-${taskId.substring(0, 8)}`);

      console.log(`[pollTaskStatus] 응답:`, result);

      if (result && result.data) {
        const taskData = result.data;
        const status = (taskData.status || '').toUpperCase();

        console.log(`[pollTaskStatus] 태스크 상태: ${status}`);

        // ✅ 완료
        if (status === 'COMPLETED') {
          if (taskData.generated && Array.isArray(taskData.generated) && taskData.generated.length > 0) {
            const freepikUrl = taskData.generated[0];
            console.log(`[pollTaskStatus] ✅ 완료 - Freepik URL: ${freepikUrl.substring(0, 80)}...`);

            // 🔥 S3 업로드 (projectId가 있을 때만)
            let finalImageUrl = freepikUrl;
            if (projectId && conceptId && sceneNumber) {
              try {
                console.log(`[pollTaskStatus] 🚀 S3 업로드 시작: project=${projectId}, concept=${conceptId}, scene=${sceneNumber}`);
                finalImageUrl = await uploadImageToS3(freepikUrl, projectId, conceptId, sceneNumber);
                console.log(`[pollTaskStatus] ✅ S3 업로드 완료: ${finalImageUrl}`);
              } catch (s3Error) {
                console.error(`[pollTaskStatus] ⚠️ S3 업로드 실패, Freepik URL 사용:`, s3Error.message);
                // S3 업로드 실패 시 Freepik URL 그대로 사용 (fallback)
              }
            } else {
              console.warn(`[pollTaskStatus] ⚠️ S3 업로드 스킵 (projectId=${projectId}, conceptId=${conceptId}, sceneNumber=${sceneNumber})`);
            }

            return { imageUrl: finalImageUrl, status: 'COMPLETED', raw: taskData };
          } else {
            throw new Error('COMPLETED 상태이지만 generated 배열이 비어있습니다');
          }
        }

        // ❌ 실패
        if (status === 'FAILED' || status === 'ERROR') {
          throw new Error(`이미지 생성 태스크 실패: ${status}`);
        }

        // ✅ 진행 중 - 정상 대기
        if (status === 'IN_PROGRESS' || status === 'PENDING' || status === 'PROCESSING' || status === 'CREATED') {
          console.log(`[pollTaskStatus] 대기 중... (${status})`);
          await sleep(POLLING_INTERVAL);
          continue;
        }

        // ❌ 알 수 없는 상태
        throw new Error(`알 수 없는 태스크 상태: ${status}`);
      } else {
        throw new Error('응답에 data 필드가 없습니다');
      }

    } catch (error) {
      if (Date.now() - startTime >= POLLING_TIMEOUT) {
        throw new Error(`이미지 생성 태스크 타임아웃 (${POLLING_TIMEOUT}ms 초과)`);
      }

      console.error(`[pollTaskStatus] 폴링 에러 (컨셉: ${conceptId}):`, error);

      if (error.message.includes('FAILED') || error.message.includes('ERROR')) {
        throw error;
      }

      await sleep(POLLING_INTERVAL);
    }
  }

  throw new Error(`이미지 생성 태스크 타임아웃 (${POLLING_TIMEOUT}ms)`);
}


// 🔥 Freepik AR 매핑 헬퍼
// 🔥 Freepik API Adapter (Internal -> API Spec)
// 문서를 통해 확인된 정확한 파라미터 매핑 수행
function mapToFreepikParams(internalParams) {
  const arMap = {
    // 내부 코드 -> Freepik Seedream v4 Enum
    'portrait_9_16': 'social_story_9_16',
    // Widescreen/Square는 Pass-through (widescreen_16_9, square_1_1)
  };

  // aspect_ratio 키를 제거하고 image_size로 변환
  const { aspect_ratio, ...rest } = internalParams;

  const mappedParams = {
    ...rest,
    // API uses 'image_size', Internal uses 'aspect_ratio'
    // 매핑된 값이 있으면 사용, 없으면 원본 사용 (default: widescreen_16_9)
    aspect_ratio: arMap[aspect_ratio] || aspect_ratio || 'widescreen_16_9'
  };

  return mappedParams;
}

// 🔥 동적 엔진 이미지 생성 함수 (키 풀 활용 + 엔진 독립적 + S3 업로드)
async function generateImageWithDynamicEngine(imagePrompt, conceptId = 0, projectId = null, sceneNumber = null) {
  try {
    // API 스펙에 맞는 파라미터 변환 (Adapter Pattern)
    const finalPrompt = mapToFreepikParams(imagePrompt);

    console.log(`[generateImageWithDynamicEngine] 시작 (컨셉: ${conceptId}, 프로젝트: ${projectId}, 씬: ${sceneNumber}):`, {
      prompt: finalPrompt.prompt.substring(0, 100),
      aspect_ratio: finalPrompt.aspect_ratio, // 매핑된 값 로깅
      guidance_scale: finalPrompt.guidance_scale,
      seed: finalPrompt.seed
    });

    // 🔥 동적 URL 생성 - engines.json의 현재 textToImage 엔진 사용
    const createUrl = getTextToImageUrl();

    console.log(`[generateImageWithDynamicEngine] 사용 중인 엔진 URL: ${createUrl}`);

    const createResult = await safeCallFreepik(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(finalPrompt) // 매핑된 프롬프트 전송
    }, conceptId, `image-create-concept-${conceptId}`);

    console.log(`[generateImageWithDynamicEngine] 태스크 생성 응답:`, createResult);

    if (!createResult || !createResult.data || !createResult.data.task_id) {
      throw new Error('이미지 생성 태스크 ID를 받지 못했습니다: ' + JSON.stringify(createResult));
    }

    const taskId = createResult.data.task_id;
    console.log(`[generateImageWithDynamicEngine] 태스크 생성 성공 (컨셉: ${conceptId}): ${taskId}`);

    // 🔥 태스크 상태 폴링 (projectId, sceneNumber 전달)
    const pollResult = await pollTaskStatus(taskId, conceptId, projectId, sceneNumber);

    console.log(`[generateImageWithDynamicEngine] 최종 성공 (컨셉: ${conceptId}):`, {
      imageUrl: pollResult.imageUrl.substring(0, 80),
      status: pollResult.status
    });

    return {
      imageUrl: pollResult.imageUrl,
      method: 'freepik-dynamic-engine-keypool',
      taskId: taskId,
      conceptId: conceptId,
      raw: pollResult.raw
    };

  } catch (error) {
    console.error('[generateImageWithDynamicEngine] 전체 실패 (컨셉:', conceptId, '):', error);
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
    let { imagePrompt, sceneNumber, conceptId, prompt, projectId, personUrl } = req.body || {};

    console.log('[storyboard-render-image] 요청 수신:', {
      sceneNumber,
      conceptId,
      projectId,
      hasImagePrompt: !!imagePrompt,
      legacyPrompt: !!prompt,
      promptPreview: (imagePrompt?.prompt || prompt || '').substring(0, 200)
    });

    // 🔥 API 키 상태 확인
    const keyStatus = getApiKeyStatus();
    console.log(`[storyboard-render-image] Freepik API 키 상태: ${keyStatus.freepik.availableKeys}/${keyStatus.freepik.totalKeys}개 사용가능`);

    // 🔥 하위 호환 - 구형 형식을 표준 형식으로 변환
    if (!imagePrompt && prompt) {
      imagePrompt = {
        prompt,
        aspect_ratio: 'widescreen_16_9',
        guidance_scale: 2.5,
        seed: Math.floor(Math.random() * 1000000)
      };
      console.log('[storyboard-render-image] 구형 요청을 표준 imagePrompt로 변환');
    }

    // 🔥 imagePrompt 구조 정규화
    if (imagePrompt) {
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

    console.log('[storyboard-render-image] 요청 본문:', {
      imagePrompt: req.body.imagePrompt ? '존재' : '없음',
      projectId: req.body.projectId,
      sceneNumber: req.body.sceneNumber,
      conceptId: req.body.conceptId
    });

    // 🔥 projectId와 sceneNumber 추출
    // 이미 req.body에서 추출된 변수들을 사용하므로 재선언 대신 기존 변수 사용
    // const projectId = req.body.projectId || null; // 이미 선언됨
    // const sceneNumber = req.body.sceneNumber || null; // 이미 선언됨
    // const conceptId = req.body.conceptId || 0; // 이미 선언됨

    console.log('[storyboard-render-image] 🔥 S3 업로드 파라미터:', { projectId, sceneNumber, conceptId });

    console.log(`[storyboard-render-image] 컨셉 ${conceptId}에 대한 동적 엔진 키 풀 활용 시작`);

    try {
      // 🔥 동적 엔진으로 이미지 생성 (S3 업로드 포함)
      let result = await generateImageWithDynamicEngine(
        imagePrompt, // 이미 정규화된 imagePrompt 사용
        conceptId || 0,
        projectId,  // 🔥 S3 업로드를 위해 전달
        sceneNumber // 🔥 S3 업로드를 위해 전달
      );

      // 🔥 [M] 제품/로고 합성 로직 (Step 1 Upload)
      if (req.body.productImageUrl && projectId && sceneNumber && result.imageUrl) {
        // 프롬프트 내 제품/로고 합성 마커 확인
        // Gemini 프롬프트 생성 시 [PRODUCT COMPOSITING SCENE] 또는 [LOGO] 등이 포함됨
        const productMarkers = /\[PRODUCT.*?\]|\[LOGO.*?\]|product compositing|brand logo/i;
        const currentPrompt = imagePrompt.prompt || '';

        // 마커가 있거나, videoPurpose가 명확히 제품 중심인 경우 (User request)
        // 하지만 모든 씬에 바르는 건 위험하므로 마커 기준이 안전함.
        if (productMarkers.test(currentPrompt)) {
          console.log(`[storyboard-render-image] 📦 제품/로고 합성 조건 충족 (씬 ${sceneNumber})`);
          console.log(`[storyboard-render-image] 🔹 Base: ${result.imageUrl}`);
          console.log(`[storyboard-render-image] 🔹 Product: ${req.body.productImageUrl}`);

          try {
            const compositingInfo = {
              videoPurpose: 'product_placement',
              compositingContext: 'INTEGRATE_PRODUCT_INTO_SCENE',
              sceneDescription: currentPrompt.replace(/\[.*?\]/g, '').trim() // 태그 제거한 설명
            };

            const compResult = await safeComposeWithSeedream(result.imageUrl, req.body.productImageUrl, compositingInfo);

            if (compResult.success && compResult.composedImageData) {
              const buffer = Buffer.from(compResult.composedImageData, 'base64');
              const filename = `comp_product_concept_${conceptId}_scene_${sceneNumber}_${Date.now()}.jpg`;
              const compUrl = await uploadBufferToS3(buffer, projectId, filename);

              console.log(`[storyboard-render-image] ✅ 제품 합성 및 업로드 완료: ${compUrl}`);

              result.imageUrl = compUrl;
              result.metadata = { ...result.metadata, substitutedProduct: true, originalUrl: result.metadata?.originalUrl || result.imageUrl };
            } else if (compResult.success && compResult.imageUrl) {
              // Seedream이 URL을 반환한 경우 (일반적으로 여기 걸림)
              // URL -> S3 업로드 (위 pollTaskStatus에서 이미 처리했으면 좋겠지만, 
              // seedream-compose는 URL만 반환하고 S3 업로드는 poll 내부에서 안 함(외부 모듈임).
              // safeComposeWithSeedream의 반환값: { success: true, imageUrl: ... } (v4-edit/generation)

              // URL을 다운로드하여 S3에 저장해야 함 (또는 URL 그대로 사용)
              // 일관성을 위해 S3 업로드 권장.
              console.log(`[storyboard-render-image] ✅ 제품 합성 완료 (URL): ${compResult.imageUrl}`);
              const finalCompUrl = await uploadImageToS3(compResult.imageUrl, projectId, conceptId, sceneNumber);
              console.log(`[storyboard-render-image] 🚀 S3 업로드 완료: ${finalCompUrl}`);

              result.imageUrl = finalCompUrl;
              result.metadata = { ...result.metadata, substitutedProduct: true, originalUrl: result.metadata?.originalUrl || result.imageUrl };
            }
          } catch (compError) {
            console.error(`[storyboard-render-image] ⚠️ 제품 합성 실패 (무시됨):`, compError.message);
          }
        }
      }

      // 🔥 [M] 인물 합성 로직 (Person Archive)
      // DEBUG: 인물 합성 진입 조건 확인
      console.log(`[storyboard-render-image] 👤 인물 합성 체크:`, {
        promptFragment: (imagePrompt.prompt || '').substring(0, 30),
        hasPersonUrl: !!personUrl,
        personUrlPreview: personUrl ? personUrl.substring(0, 20) + '...' : 'NONE',
        projectId,
        sceneNumber
      });

      if (personUrl && projectId && sceneNumber && result.imageUrl) {
        // 키워드 감지 (사람 관련 - 복수형 및 대소문자 정교화)
        // 'girls', 'boys' 등 복수형 명시 및 단어 경계(\b) 적용으로 정확도 향상
        const personKeywords = /\b(man|men|woman|women|person|people|girl|girls|boy|boys|model|models|character|characters|protagonist|worker|workers|student|students|teacher|teachers|doctor|doctors|nurse|nurses|driver|drivers|lady|ladies|gentleman|gentlemen|child|children|kid|kids|baby|babies|teen|teens|teenager|teenagers|adult|adults|human|humans|couple|couples|family|families|friend|friends|group|crowd|audience)\b/i;
        const currentPrompt = imagePrompt.prompt || '';


        if (personKeywords.test(currentPrompt)) {
          console.log(`[storyboard-render-image] 👤 인물 합성 조건 충족 (씬 ${sceneNumber})`);
          console.log(`[storyboard-render-image] 🔹 Base: ${result.imageUrl}`);
          console.log(`[storyboard-render-image] 🔹 Person: ${personUrl}`);

          try {
            const compositingInfo = {
              videoPurpose: 'person_integration',
              compositingContext: 'INTEGRATE_PERSON_INTO_SCENE',
              sceneDescription: currentPrompt
            };

            const compResult = await safeComposeWithSeedream(result.imageUrl, personUrl, compositingInfo);

            if (compResult.success && compResult.composedImageData) {
              // Base64 -> Buffer
              const buffer = Buffer.from(compResult.composedImageData, 'base64');

              // S3 업로드
              const filename = `comp_concept_${conceptId}_scene_${sceneNumber}_${Date.now()}.jpg`;
              const compUrl = await uploadBufferToS3(buffer, projectId, filename);

              console.log(`[storyboard-render-image] ✅ 인물 합성 및 업로드 완료: ${compUrl}`);

              // 결과 URL 교체
              result.imageUrl = compUrl;
              result.metadata = { ...result.metadata, substitutedPerson: true, originalUrl: result.imageUrl };
            }
          } catch (compError) {
            console.error(`[storyboard-render-image] ⚠️ 인물 합성 실패 (무시됨):`, compError.message);
          }
        }
      }

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
          apiProvider: 'Freepik Dynamic Engine 2025 KeyPool',
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

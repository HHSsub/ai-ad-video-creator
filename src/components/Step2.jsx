// src/components/Step2.jsx - 함수 순서 수정 + Gemini JSON 완전 활용 + 이미지 필드 완전 통합(imageUpload만 사용, 구버전 productImage/brandLogo 완전 제거)
import { useState } from 'react';
import PropTypes from 'prop-types';
import styles from './Step2_module.css'; 
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// 스피너 오버레이 컴포넌트
const SpinnerOverlay = ({ title, percent, lines }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center">
    <div className="w-full max-w-2xl bg-white/10 rounded p-6 text-white">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="text-sm text-white/80">{percent}%</span>
      </div>
      <div className="w-full bg-white/20 rounded h-2 mt-3 overflow-hidden">
        <div className="bg-white h-2 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <details className="mt-4 text-sm text-white/90" open>
        <summary className="cursor-pointer select-none">세부 로그</summary>
        <div className="mt-2 h-40 overflow-auto bg-black/40 rounded p-2 font-mono text-xs whitespace-pre-wrap">
          {(lines || []).slice(-200).join('\n')}
        </div>
      </details>
    </div>
  </div>
);

SpinnerOverlay.propTypes = {
  title: PropTypes.string,
  percent: PropTypes.number,
  lines: PropTypes.arrayOf(PropTypes.string),
};

// 진척도 관리 클래스
class ProgressManager {
  constructor() {
    this.phases = {
      STEP1: { start: 0, end: 25, current: 0 },
      STEP2: { start: 25, end: 50, current: 25 },
      IMAGES: { start: 50, end: 80, current: 50 },
      COMPOSE: { start: 80, end: 100, current: 80 }
    };
    this.currentPhase = 'STEP1';
  }

  startPhase(phaseName) {
    this.currentPhase = phaseName;
    this.phases[phaseName].current = this.phases[phaseName].start;
    return this.phases[phaseName].start;
  }

  updatePhase(phaseName, progress) {
    const phase = this.phases[phaseName];
    const range = phase.end - phase.start;
    phase.current = phase.start + (range * Math.min(1, Math.max(0, progress)));
    return Math.round(phase.current);
  }

  completePhase(phaseName) {
    this.phases[phaseName].current = this.phases[phaseName].end;
    return this.phases[phaseName].end;
  }

  getCurrentProgress() {
    return Math.round(this.phases[this.currentPhase].current);
  }
}

// Seedream v4 영상 비율 매핑
function getAspectRatioCode(videoAspectRatio) {
  console.log(`[getAspectRatioCode] 입력: "${videoAspectRatio}"`);
  
  if (!videoAspectRatio || typeof videoAspectRatio !== 'string') {
    console.log('[getAspectRatioCode] 기본값 사용: widescreen_16_9');
    return 'widescreen_16_9';
  }
  
  const normalized = videoAspectRatio.toLowerCase().trim();
  
  if (normalized.includes('16:9') || normalized.includes('가로')) {
    console.log('[getAspectRatioCode] → widescreen_16_9');
    return 'widescreen_16_9';
  }
  
  if (normalized.includes('9:16') || normalized.includes('세로') || normalized.includes('vertical')) {
    console.log('[getAspectRatioCode] → vertical_9_16'); 
    return 'vertical_9_16';
  }
  
  if (normalized.includes('1:1') || normalized.includes('정사각형') || normalized.includes('square')) {
    console.log('[getAspectRatioCode] → square_1_1');
    return 'square_1_1';
  }
  
  if (normalized.includes('4:5') || normalized.includes('portrait')) {
    console.log('[getAspectRatioCode] → portrait_4_5');
    return 'portrait_4_5';
  }
  
  console.log('[getAspectRatioCode] 매칭 실패, 기본값: widescreen_16_9');
  return 'widescreen_16_9';
}

// 워커 풀 함수
async function runSafeWorkerPool(tasks, concurrency, onProgress) {
  let completed = 0;
  let failed = 0;
  const total = tasks.length;

  const runTask = async (task) => {
    try {
      await task();
      completed++;
    } catch (error) {
      console.error('Task 실행 실패:', error);
      failed++;
    } finally {
      if (onProgress) onProgress(completed, failed, total);
    }
  };

  const activePromises = [];
  for (const task of tasks) {
    if (activePromises.length >= concurrency) {
      await Promise.race(activePromises);
      const resolvedIndex = activePromises.findIndex(p => p.isResolved);
      if (resolvedIndex >= 0) {
        activePromises.splice(resolvedIndex, 1);
      }
    }
    
    const promise = runTask(task);
    promise.then(() => { promise.isResolved = true; });
    activePromises.push(promise);
  }

  await Promise.all(activePromises);
}

// 제품/서비스에 따른 프롬프트 파일 결정
function getPromptFiles(videoPurpose) {
  console.log(`[getPromptFiles] videoPurpose: ${videoPurpose}`);
  
  if (videoPurpose === 'product') {
    console.log('[getPromptFiles] → 제품용 프롬프트');
    return {
      step1: 'step1_product',
      step2: 'step2_product'
    };
  } else if (videoPurpose === 'service') {
    console.log('[getPromptFiles] → 서비스용 프롬프트');
    return {
      step1: 'step1_service',
      step2: 'step2_service'
    };
  }
  
  console.log('[getPromptFiles] → 기본값 (제품용)');
  return {
    step1: 'step1_product',
    step2: 'step2_product'
  };
}

// 🔥 통합 이미지 데이터 추출 함수 (구버전 제거)
const getUnifiedImageData = (formData) => {
  let unifiedImageData = null;
  if (formData.imageUpload?.url) {
    unifiedImageData = formData.imageUpload.url;
    return {
      hasImage: true,
      imageData: unifiedImageData,
      source: 'imageUpload'
    };
  }
  return {
    hasImage: false,
    imageData: null,
    source: null
  };
};

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [percent, setPercent] = useState(0);
  const [logs, setLogs] = useState([]);
  const [imagesDone, setImagesDone] = useState(0);
  const [imagesFail, setImagesFail] = useState(0);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [styles, setStyles] = useState([]);

  const isBusy = isLoading;
  const progressManager = new ProgressManager();

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setLogs(prev => [...prev, logEntry]);
  };

  const updateProgress = (phase, progress) => {
    const newPercent = progressManager.updatePhase(phase, progress);
    setPercent(newPercent);
  };

  // 🔥 overlayImageData도 통합필드만 사용
  const getOverlayImageData = (compositingInfo) => {
    let overlayData = null;
    if (compositingInfo.productImageData) {
      overlayData = compositingInfo.productImageData;
    } else if (compositingInfo.brandLogoData) {
      overlayData = compositingInfo.brandLogoData;
    }
    if (overlayData && !overlayData.startsWith('data:image/')) {
      if (/^[A-Za-z0-9+/=]+$/.test(overlayData)) {
        overlayData = `data:image/jpeg;base64,${overlayData}`;
      }
    }
    return overlayData || null;
  };

  // 🔥 나노 바나나 합성 함수 - getOverlayImageData 정의 후에 배치(구버전 제거)
  const composeSingleImageSafely = async (imageObj, style, compositingInfo, retryCount = 0, maxRetries = 2) => {
    if (!imageObj.isCompositingScene || !imageObj.compositingInfo) {
      return imageObj;
    }
    const overlayImageData = getOverlayImageData(compositingInfo);
    if (!overlayImageData) {
      return imageObj;
    }
    try {
      const requestDelay = Math.random() * 3000 + 2000;
      await new Promise(resolve => setTimeout(resolve, requestDelay));
      const requestPayload = {
        baseImageUrl: imageObj.url,
        overlayImageData: overlayImageData,
        compositingInfo: imageObj.compositingInfo,
        sceneNumber: imageObj.sceneNumber,
        conceptId: style.concept_id
      };
      const response = await fetch(`${API_BASE}/api/nanobanana-compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      }
      const result = await response.json();
      if (result.success && result.composedImageUrl) {
        return {
          ...imageObj,
          url: result.composedImageUrl,
          thumbnail: result.composedImageUrl,
          isComposed: true,
          compositionMetadata: result.metadata,
          originalUrl: imageObj.url,
          compositingSuccess: true
        };
      } else {
        throw new Error(`합성 결과 없음: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      const retryableErrors = ['429', '500', '502', '503', '504', 'timeout'];
      const shouldRetry = retryableErrors.some(code => error.message.includes(code));
      if (retryCount < maxRetries && shouldRetry) {
        const retryDelay = (retryCount + 1) * 5000;
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return composeSingleImageSafely(imageObj, style, compositingInfo, retryCount + 1, maxRetries);
      } else {
        return {
          ...imageObj,
          isComposed: false,
          compositingSuccess: false,
          compositionError: error.message
        };
      }
    }
  };

  // 메인 스토리보드 생성 함수
  const handleGenerateStoryboard = async () => {
    if (isBusy) return;

    const startTime = Date.now();
    setIsLoading?.(true);
    setPercent(0);
    setLogs([]);
    setImagesDone(0);
    setImagesFail(0);
    setError('');

    try {
      log('🎬 AI 광고 영상 스토리보드 생성 시작');
      log(`📋 입력 데이터: ${formData.brandName} - ${formData.videoPurpose} (${formData.videoLength})`);

      const promptFiles = getPromptFiles(formData.videoPurpose);
      log(`📝 선택된 프롬프트: ${promptFiles.step1} → ${promptFiles.step2}`);

      // STEP1: 기본 스토리보드 생성
      progressManager.startPhase('STEP1');
      log('1/4 STEP1: 기본 스토리보드 구조 생성 시작');
      updateProgress('STEP1', 0.1);

      const step1ProgressInterval = setInterval(() => {
        const currentProgress = progressManager.phases.STEP1.current;
        if (currentProgress < 24) {
          updateProgress('STEP1', Math.min(0.9, (currentProgress) / 25 + 0.1));
        }
      }, 800);

      // 🔥 imageUpload만 API 페이로드에 포함
      const apiPayload = {
        ...formData,
        imageUpload: formData.imageUpload ? {
          name: formData.imageUpload.name,
          size: formData.imageUpload.size,
          url: formData.imageUpload.url
        } : null,
        promptType: promptFiles.step1
      };

      const step1Response = await fetch(`${API_BASE}/api/storyboard-init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiPayload),
      });

      clearInterval(step1ProgressInterval);

      if (!step1Response.ok) {
        const errorText = await step1Response.text().catch(() => '');
        throw new Error(`Step1 API 호출 실패: ${step1Response.status} - ${errorText.substring(0, 100)}`);
      }

      let initData;
      try {
        const responseText = await step1Response.text();
        if (!responseText.trim()) {
          throw new Error('서버에서 빈 응답을 받았습니다.');
        }
        initData = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error('서버 응답 형식이 올바르지 않습니다. 서버 로그를 확인하세요.');
      }

      if (!initData.success) {
        throw new Error(initData.error || 'Step1 스토리보드 생성 실패');
      }

      if (!initData.styles || !Array.isArray(initData.styles)) {
        throw new Error('Step1 스토리보드 데이터 형식이 올바르지 않습니다.');
      }

      const { styles, metadata, compositingInfo } = initData;

      progressManager.completePhase('STEP1');
      setPercent(25);
      log('✅ STEP1 완료: 기본 스토리보드 구조 생성 성공');

      // STEP2: 상세 JSON 스토리보드 생성
      progressManager.startPhase('STEP2');
      log('2/4 STEP2: 상세 JSON 스토리보드 생성 시작');
      updateProgress('STEP2', 0.1);

      await new Promise(resolve => setTimeout(resolve, 3000));

      progressManager.completePhase('STEP2');
      setPercent(50);
      log('✅ STEP2 완료: 상세 JSON 스토리보드 생성 성공');

      const finalStyles = styles;
      const finalCompositingInfo = compositingInfo;

      // 🔥 통합 이미지 필드만 사용
      const imageInfo = getUnifiedImageData(formData);
      if (imageInfo.hasImage) {
        if (formData.videoPurpose === 'product' || formData.videoPurpose === 'conversion') {
          finalCompositingInfo.productImageData = imageInfo.imageData;
        } else {
          finalCompositingInfo.brandLogoData = imageInfo.imageData;
        }
      }

      // STEP3: 이미지 생성
      const perStyle = finalStyles.length > 0 ? (finalStyles[0].imagePrompts?.length || 0) : 0;
      const totalImages = finalStyles.length * perStyle;
      if (totalImages > 0) {
        progressManager.startPhase('IMAGES');
        log('3/4 IMAGES: 이미지 생성 시작');
        updateProgress('IMAGES', 0.1);

        let successImages = 0;
        let failedImages = 0;

        finalStyles.forEach(style => {
          if (!style.images) style.images = [];
        });

        const imageTasks = [];
        finalStyles.forEach(style => {
          style.imagePrompts.forEach(p => {
            imageTasks.push(async () => {
              try {
                // 🔥 GEMINI JSON 완전 활용 - 모든 파라미터 사용
                let promptToSend = p.prompt || p.image_prompt?.prompt || 'Professional commercial photo, 8K, high quality';
                if (p.styling) {
                  const styleInfo = [];
                  if (p.styling.style) styleInfo.push(p.styling.style);
                  if (p.styling.color) styleInfo.push(p.styling.color);
                  if (p.styling.lighting) styleInfo.push(`${p.styling.lighting} lighting`);
                  if (styleInfo.length > 0) {
                    promptToSend += `, ${styleInfo.join(', ')}`;
                  }
                }
                promptToSend += '. Professional advertising photography, 8K, ultra-detailed, masterpiece.';
                const res = await fetch(`${API_BASE}/api/storyboard-render-image`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    imagePrompt: {
                      prompt: promptToSend,
                      aspect_ratio: getAspectRatioCode(formData.aspectRatioCode),
                      guidance_scale: p.guidance_scale || 2.5,
                      seed: p.seed || Math.floor(10000 + Math.random() * 90000)
                    },
                    sceneNumber: p.sceneNumber,
                    conceptId: style.concept_id || style.id
                  })
                });

                if (res.ok) {
                  const data = await res.json();
                  if (data.success && data.url) {
                    const imageObj = {
                      id: `${style.style || style.conceptName || 'style'}-${p.sceneNumber}`.toLowerCase().replace(/\s+/g, '-'),
                      title: p.title || `Scene ${p.sceneNumber}`,
                      style: style.style || 'Commercial Photography',
                      copy: p.copy || `씬 ${p.sceneNumber}`,
                      timecode: p.timecode || `00:${String((p.sceneNumber-1)*2).padStart(2,'0')}-00:${String(p.sceneNumber*2).padStart(2,'0')}`,
                      negative_prompt: p.negative_prompt || "blurry, low quality",
                      size: p.size || `${p.width || 1024}x${p.height || 1024}`,
                      seed: `${p.seed || Math.floor(Math.random() * 1000000)}`,
                      filter: p.styling?.style || 'photo',
                      url: data.url,
                      thumbnail: data.url,
                      prompt: promptToSend,
                      duration: p.duration || 2,
                      sceneNumber: p.sceneNumber,
                      isCompositingScene: p.isCompositingScene || false,
                      compositingInfo: p.compositingInfo || null,
                      originalGeminiData: {
                        styling: p.styling,
                        guidance_scale: p.guidance_scale,
                        motion_prompt: p.motion_prompt,
                        filter_nsfw: p.filter_nsfw
                      }
                    };

                    style.images.push(imageObj);
                    successImages++;
                    setImagesDone(prev => prev + 1);
                    log(`✅ Scene ${p.sceneNumber} 이미지 생성 완료 (${style.conceptName || style.style})`);
                  } else {
                    throw new Error(data.error || '이미지 URL 없음');
                  }
                } else {
                  const errorText = await res.text().catch(() => '');
                  throw new Error(`HTTP ${res.status}: ${errorText.substring(0, 100)}`);
                }
              } catch (error) {
                failedImages++;
                setImagesFail(prev => prev + 1);
                log(`❌ Scene ${p.sceneNumber} 이미지 생성 실패: ${error.message}`);
              }
            });
          });
        });

        await runSafeWorkerPool(imageTasks, 3, (completed, failed, total) => {
          const progress = (completed + failed) / total;
          updateProgress('IMAGES', progress);
          log(`이미지 생성: ${completed + failed}/${total} 완료`);
        });

        finalStyles.forEach(style => {
          if (style.images) {
            style.images.sort((a, b) => a.sceneNumber - b.sceneNumber);
          }
        });

        progressManager.completePhase('IMAGES');
        setPercent(80);
        log(`🎨 이미지 생성 완료: 성공 ${successImages} / 실패 ${failedImages} / 총 ${totalImages}`);

        // STEP4: 이미지 합성 (Nano Banana)
        const totalCompositingScenes = finalCompositingInfo?.totalCompositingScenes || 0;
        if (imageInfo.hasImage && totalCompositingScenes > 0) {
          progressManager.startPhase('COMPOSE');
          log('4/4 COMPOSE: Nano Banana 이미지 합성 시작');
          updateProgress('COMPOSE', 0.1);

          // 합성 대상 이미지들 수집
          const allCompositingImages = [];
          finalStyles.forEach(style => {
            if (style.images) {
              const compositingScenes = style.images.filter(img =>
                img.isCompositingScene &&
                img.compositingInfo &&
                img.url
              );
              allCompositingImages.push(...compositingScenes);
            }
          });

          let compositingSuccess = 0;
          let compositingFailed = 0;

          // 각 이미지의 compositingInfo에 통합 이미지 데이터 포함
          for (let i = 0; i < allCompositingImages.length; i++) {
            const imageObj = allCompositingImages[i];

            // 통합 이미지 데이터만 사용
            if (!imageObj.compositingInfo.productImageData && imageInfo.imageData && (formData.videoPurpose === 'product' || formData.videoPurpose === 'conversion')) {
              imageObj.compositingInfo.productImageData = imageInfo.imageData;
            }
            if (!imageObj.compositingInfo.brandLogoData && imageInfo.imageData && !(formData.videoPurpose === 'product' || formData.videoPurpose === 'conversion')) {
              imageObj.compositingInfo.brandLogoData = imageInfo.imageData;
            }

            try {
              const style = finalStyles.find(s => s.images?.includes(imageObj));
              const composedImage = await composeSingleImageSafely(imageObj, style, finalCompositingInfo);

              if (composedImage.compositingSuccess) {
                compositingSuccess++;
                log(`✅ Scene ${composedImage.sceneNumber} 합성 성공`);
              } else {
                compositingFailed++;
                log(`❌ Scene ${composedImage.sceneNumber} 합성 실패: ${composedImage.compositionError || 'Unknown error'}`);
              }

              const progress = (i + 1) / allCompositingImages.length;
              updateProgress('COMPOSE', progress);

              if (i < allCompositingImages.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            } catch (error) {
              compositingFailed++;
              log(`❌ Scene ${imageObj.sceneNumber} 합성 오류: ${error.message}`);
            }

            updateProgress('COMPOSE', Math.min(0.9, (i + 1) / allCompositingImages.length));
          }
          log(`📊 제품 합성 완료: 성공 ${compositingSuccess}개, 실패 ${compositingFailed}개`);
          progressManager.completePhase('COMPOSE');
        } else {
          log('4/4 이미지 합성 스킵 (업로드된 이미지 없음)');
          progressManager.completePhase('COMPOSE');
        }

        setPercent(100);
        log(`전체 처리 완료: 성공 ${successImages} / 실패 ${failedImages} / 총 ${totalImages}`);

        const finalStoryboard = {
          success: true,
          styles: finalStyles,
          compositingInfo: finalCompositingInfo,
          metadata: {
            ...metadata,
            videoPurpose: formData.videoPurpose,
            promptFiles: promptFiles,
            perStyleCount: perStyle,
            totalImages: totalImages,
            successImages: successImages,
            failedImages: failedImages,
            compositingSuccess: compositingSuccess || 0,
            compositingFailed: compositingFailed || 0,
            processingTimeMs: Date.now() - startTime,
            createdAt: new Date().toISOString(),
          }
        };

        setStoryboard?.(finalStoryboard);
        setStyles(finalStyles);

        log('✅ 스토리보드 생성 완료! 컨셉을 확인하고 "다음 단계" 버튼을 클릭하세요.');
      } else {
        setPercent(100);

        const finalStoryboard = {
          success: true,
          styles: finalStyles,
          compositingInfo: finalCompositingInfo,
          metadata: {
            ...metadata,
            videoPurpose: formData.videoPurpose,
            promptFiles: promptFiles,
            perStyleCount: perStyle,
            totalImages: totalImages,
            processingTimeMs: Date.now() - startTime,
            createdAt: new Date().toISOString(),
          }
        };
        setStoryboard?.(finalStoryboard);
        setStyles(finalStyles);
        log('✅ 스토리보드 구조 생성 완료! "다음 단계" 버튼을 클릭하세요.');
      }

    } catch (e) {
      setError(e.message);
      setIsLoading?.(false);
      setPercent(0);
    }
  };

  // 🔥 버튼 텍스트도 imageUpload만 반영
  const getButtonText = () => {
    const imageInfo = getUnifiedImageData(formData);
    return imageInfo.hasImage
      ? '스토리보드 생성 + Nano Banana 이미지 합성 시작'
      : '스토리보드 생성 시작';
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      {isBusy && <SpinnerOverlay title="스토리보드/이미지 생성/합성 중..." percent={percent} lines={logs} />}

      <div className={`bg-white rounded-lg shadow-lg p-6 ${isBusy ? 'pointer-events-none opacity-50' : ''}`}>
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            2단계: 스토리보드 생성 + 이미지 합성 ({formData.videoPurpose})
          </h2>
          <p className="text-gray-600">
            🔥 <strong>업로드된 이미지를 합성 대상 씬에 자동 합성</strong> - Nano Banana API 활용
            <br />
            STEP1(0-25%) → STEP2(25-50%) → 이미지생성(50-80%) → 합성(80-100%)
            <br />
            📝 선택된 프롬프트: <strong>{formData.videoPurpose}</strong>용 ({getPromptFiles(formData.videoPurpose).step1} → {getPromptFiles(formData.videoPurpose).step2})
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded p-3">
            {error}
          </div>
        )}

        {/* 🔥 imageUpload만 미리보기 */}
        {formData.imageUpload?.url && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded p-3">
            <h4 className="text-sm font-semibold text-green-800 mb-2">합성용 이미지 (Nano Banana로 자동 합성)</h4>
            <div className="flex gap-4">
              <div className="text-center">
                <img
                  src={formData.imageUpload.url}
                  alt="업로드 이미지"
                  className="w-16 h-16 object-cover rounded border"
                />
                <p className="text-xs text-green-700 mt-1">업로드 이미지</p>
              </div>
            </div>
            <p className="text-xs text-green-600 mt-2">
              💡 프롬프트에서 지정한 [PRODUCT COMPOSITING SCENE] 위치에 자동으로 합성됩니다.
            </p>
          </div>
        )}

        {/* 통계 정보 */}
        {(imagesDone > 0 || imagesFail > 0) && (
          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <h3 className="font-semibold mb-2">이미지 생성 통계</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <p><span className="font-medium text-blue-600">성공:</span> {imagesDone}개</p>
              <p><span className="font-medium text-red-600">실패:</span> {imagesFail}개</p>
            </div>
          </div>
        )}

        {/* 스타일 프리뷰 등 기존 로직 그대로 */}
        {styles && styles.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-3">생성된 컨셉 ({styles.length}개)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {styles.map((style, index) => (
                <div key={style.id || index} className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-medium text-sm mb-2">{style.conceptName || style.style}</h4>
                  <p className="text-xs text-gray-600 mb-2">{style.description}</p>
                  
                  {style.conceptHeadline && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2">
                      <p className="text-xs font-medium text-blue-800">컨셉 헤드라인</p>
                      <p className="text-sm text-blue-900">{style.conceptHeadline}</p>
                    </div>
                  )}
                  
                  <div className="text-xs">
                    <p>씬 수: {style.images?.length || style.imagePrompts?.length || 0}개</p>
                    {style.imagePrompts && style.imagePrompts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="font-medium text-gray-700">씬별 카피:</p>
                        {style.imagePrompts.slice(0, 3).map((prompt, promptIdx) => (
                          <div key={promptIdx} className="bg-yellow-50 border border-yellow-200 rounded p-1">
                            <p className="text-xs">
                              <span className="font-medium">S#{prompt.sceneNumber}:</span> 
                              <span className="ml-1 text-yellow-800">{prompt.copy || '카피 없음'}</span>
                            </p>
                          </div>
                        ))}
                        {style.imagePrompts.length > 3 && (
                          <p className="text-xs text-gray-500">...외 {style.imagePrompts.length - 3}개 씬</p>
                        )}
                      </div>
                    )}
                    {style.images && style.images.length > 0 && (
                      <div className="grid grid-cols-2 gap-1 mt-2">
                        {style.images.slice(0, 4).map((img, imgIdx) => (
                          <div key={imgIdx} className="relative">
                            <img 
                              src={img.thumbnail || img.url} 
                              alt={`Scene ${img.sceneNumber}`}
                              className="w-full h-16 object-cover rounded border"
                              loading="lazy"
                            />
                            {img.copy && (
                              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-1 rounded-b">
                                {img.copy}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-6 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isBusy}
            >
              이전 단계
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateStoryboard}
              disabled={isBusy}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              {getButtonText()}
            </button>
            {styles && styles.length > 0 && !isBusy && (
              <button
                onClick={onNext}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                다음 단계 (컨셉 선택)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

Step2.propTypes = {
  onNext: PropTypes.func,
  onPrev: PropTypes.func,
  formData: PropTypes.object,
  setStoryboard: PropTypes.func,
  setIsLoading: PropTypes.func,
  isLoading: PropTypes.bool,
};

export default Step2;

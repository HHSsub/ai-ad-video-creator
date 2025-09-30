import { useState } from 'react';
import PropTypes from 'prop-types';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const SpinnerOverlay = ({ title, percent, lines }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center">
    <div className="w-full max-w-2xl bg-gray-800/90 rounded-xl p-6 text-white border border-gray-700">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="text-sm text-blue-400">{percent}%</span>
      </div>
      <div className="w-full bg-gray-700 rounded h-2 mt-3 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-400 h-2 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <details className="mt-4 text-sm text-gray-300" open>
        <summary className="cursor-pointer select-none">진행 상황</summary>
        <div className="mt-2 h-40 overflow-auto bg-gray-900 rounded p-2 font-mono text-xs whitespace-pre-wrap text-gray-400">
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
  
  console.log('[getAspectRatioCode] 매칭 실패, 기본값: widescreen_16_9');
  return 'widescreen_16_9';
}

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
      log('🎬 AI 광고 영상 스토리보드 생성을 시작합니다');
      log(`📋 브랜드: ${formData.brandName} | 목적: ${formData.videoPurpose} | 길이: ${formData.videoLength}`);

      const promptFiles = getPromptFiles(formData.videoPurpose);
      log(`📝 선택된 프롬프트: ${promptFiles.step1} → ${promptFiles.step2}`);

      progressManager.startPhase('STEP1');
      log('아이디어를 구상하고 있습니다...');
      updateProgress('STEP1', 0.1);

      const step1ProgressInterval = setInterval(() => {
        const currentProgress = progressManager.phases.STEP1.current;
        if (currentProgress < 24) {
          updateProgress('STEP1', Math.min(0.9, (currentProgress) / 25 + 0.1));
        }
      }, 800);

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
          'x-username': user.username  // 🔥 이 한 줄만 추가
        },
        body: JSON.stringify(apiPayload),
      });

      clearInterval(step1ProgressInterval);

      if (!step1Response.ok) {
        const errorText = await step1Response.text().catch(() => '');
        throw new Error(`스토리보드 생성에 실패했습니다`);
      }

      let initData;
      try {
        const responseText = await step1Response.text();
        if (!responseText.trim()) {
          throw new Error('서버 응답을 받지 못했습니다');
        }
        initData = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error('서버 응답을 처리할 수 없습니다');
      }

      if (!initData.success) {
        throw new Error(initData.error || '스토리보드 생성 실패');
      }

      if (!initData.styles || !Array.isArray(initData.styles)) {
        throw new Error('스토리보드 데이터 형식이 올바르지 않습니다');
      }

      const { styles, metadata, compositingInfo } = initData;

      progressManager.completePhase('STEP1');
      setPercent(25);
      log('✅ 아이디어 구상 완료');

      progressManager.startPhase('STEP2');
      log('컨셉을 개발하고 있습니다...');
      updateProgress('STEP2', 0.1);

      await new Promise(resolve => setTimeout(resolve, 3000));

      progressManager.completePhase('STEP2');
      setPercent(50);
      log('✅ 컨셉 개발 완료');

      const finalStyles = styles;
      const finalCompositingInfo = compositingInfo;

      const imageInfo = getUnifiedImageData(formData);
      if (imageInfo.hasImage) {
        if (formData.videoPurpose === 'product' || formData.videoPurpose === 'conversion') {
          finalCompositingInfo.productImageData = imageInfo.imageData;
        } else {
          finalCompositingInfo.brandLogoData = imageInfo.imageData;
        }
      }

      const perStyle = finalStyles.length > 0 ? (finalStyles[0].imagePrompts?.length || 0) : 0;
      const totalImages = finalStyles.length * perStyle;
      if (totalImages > 0) {
        progressManager.startPhase('IMAGES');
        log('이미지를 생성하고 있습니다...');
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
                    log(`✅ Scene ${p.sceneNumber} 이미지 생성 완료`);
                  } else {
                    throw new Error(data.error || '이미지 생성 실패');
                  }
                } else {
                  const errorText = await res.text().catch(() => '');
                  throw new Error(`이미지 생성 오류`);
                }
              } catch (error) {
                failedImages++;
                setImagesFail(prev => prev + 1);
                log(`❌ Scene ${p.sceneNumber} 이미지 생성 실패`);
              }
            });
          });
        });

        await runSafeWorkerPool(imageTasks, 3, (completed, failed, total) => {
          const progress = (completed + failed) / total;
          updateProgress('IMAGES', progress);
        });

        finalStyles.forEach(style => {
          if (style.images) {
            style.images.sort((a, b) => a.sceneNumber - b.sceneNumber);
          }
        });

        progressManager.completePhase('IMAGES');
        setPercent(80);
        log(`🎨 이미지 생성 완료: 성공 ${successImages}개, 실패 ${failedImages}개`);

        const totalCompositingScenes = finalCompositingInfo?.totalCompositingScenes || 0;
        if (imageInfo.hasImage && totalCompositingScenes > 0) {
          progressManager.startPhase('COMPOSE');
          log('이미지 합성을 진행하고 있습니다...');
          updateProgress('COMPOSE', 0.1);

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

          for (let i = 0; i < allCompositingImages.length; i++) {
            const imageObj = allCompositingImages[i];

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
                log(`❌ Scene ${composedImage.sceneNumber} 합성 실패`);
              }

              const progress = (i + 1) / allCompositingImages.length;
              updateProgress('COMPOSE', progress);

              if (i < allCompositingImages.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            } catch (error) {
              compositingFailed++;
              log(`❌ Scene ${imageObj.sceneNumber} 합성 오류`);
            }

            updateProgress('COMPOSE', Math.min(0.9, (i + 1) / allCompositingImages.length));
          }
          log(`📊 이미지 합성 완료: 성공 ${compositingSuccess}개, 실패 ${compositingFailed}개`);
          progressManager.completePhase('COMPOSE');
        } else {
          progressManager.completePhase('COMPOSE');
        }

        setPercent(100);
        log(`✅ 모든 작업이 완료되었습니다!`);

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
      }

    } catch (e) {
      setError(e.message);
      setIsLoading?.(false);
      setPercent(0);
    }
  };

  const getButtonText = () => {
    const imageInfo = getUnifiedImageData(formData);
    return imageInfo.hasImage
      ? '스토리보드 생성 + 이미지 합성 시작'
      : '스토리보드 생성 시작';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black relative">
      {isBusy && <SpinnerOverlay title="스토리보드를 생성하고 있습니다..." percent={percent} lines={logs} />}

      <div className={`max-w-7xl mx-auto p-6 ${isBusy ? 'pointer-events-none opacity-50' : ''}`}>
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-8">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-white mb-2">
              스토리보드 생성
            </h2>
            <p className="text-gray-400">
              입력하신 정보를 바탕으로 6가지 광고 컨셉을 생성합니다
            </p>
          </div>

          {error && (
            <div className="mb-4 bg-red-900/30 border border-red-800 text-red-300 rounded-lg p-4">
              {error}
            </div>
          )}

          {formData.imageUpload?.url && (
            <div className="mb-4 bg-green-900/30 border border-green-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-green-300 mb-2">업로드된 이미지</h4>
              <div className="flex gap-4">
                <div className="text-center">
                  <img
                    src={formData.imageUpload.url}
                    alt="업로드 이미지"
                    className="w-16 h-16 object-cover rounded border border-green-700"
                  />
                  <p className="text-xs text-green-400 mt-1">합성용 이미지</p>
                </div>
              </div>
            </div>
          )}

          {(imagesDone > 0 || imagesFail > 0) && (
            <div className="bg-blue-900/30 border border-blue-800 p-4 rounded-lg mb-6">
              <h3 className="font-semibold mb-2 text-blue-300">이미지 생성 현황</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <p className="text-gray-300">
                  <span className="font-medium text-green-400">성공:</span> {imagesDone}개
                </p>
                <p className="text-gray-300">
                  <span className="font-medium text-red-400">실패:</span> {imagesFail}개
                </p>
              </div>
            </div>
          )}

          {styles && styles.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-3 text-white">생성된 컨셉 ({styles.length}개)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {styles.map((style, index) => (
                  <div key={style.id || index} className="border border-gray-700 rounded-lg p-4 bg-gray-900/50">
                    <h4 className="font-medium text-sm mb-2 text-white">{style.conceptName || style.style}</h4>
                    <p className="text-xs text-gray-400 mb-2">{style.description}</p>
                    
                    {style.conceptHeadline && (
                      <div className="bg-blue-900/30 border border-blue-800 rounded p-2 mb-2">
                        <p className="text-xs font-medium text-blue-300">컨셉 헤드라인</p>
                        <p className="text-sm text-blue-200">{style.conceptHeadline}</p>
                      </div>
                    )}
                    
                    <div className="text-xs text-gray-500">
                      <p>씬 수: {style.images?.length || style.imagePrompts?.length || 0}개</p>
                      {style.images && style.images.length > 0 && (
                        <div className="grid grid-cols-2 gap-1 mt-2">
                          {style.images.slice(0, 4).map((img, imgIdx) => (
                            <div key={imgIdx} className="relative">
                              <img 
                                src={img.thumbnail || img.url} 
                                alt={`Scene ${img.sceneNumber}`}
                                className="w-full h-16 object-cover rounded border border-gray-700"
                                loading="lazy"
                              />
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

          <div className="flex items-center justify-between pt-6 border-t border-gray-700">
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
              disabled={isBusy}
            >
              이전 단계
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerateStoryboard}
                disabled={isBusy}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {getButtonText()}
              </button>
              {styles && styles.length > 0 && !isBusy && (
                <button
                  onClick={onNext}
                  className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-medium"
                >
                  다음 단계
                </button>
              )}
            </div>
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
  user: PropTypes.object.isRequired,  // ← 이 줄만 추가
};

export default Step2;

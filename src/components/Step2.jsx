// src/components/Step2.jsx - 완전한 전체 코드 (생략 없음)
import { useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const SpinnerOverlay = ({ title, percent, lines }) => (
  <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999]">
    <div className="bg-gray-800 rounded-lg p-6 text-center border border-gray-700 max-w-md w-full">
      <div className="relative mb-4">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-bold">{Math.round(percent)}%</span>
        </div>
      </div>
      <p className="text-gray-300 mb-2">{title}</p>
      {lines && lines.length > 0 && (
        <div className="max-h-32 overflow-y-auto text-xs text-left bg-gray-900 p-2 rounded mt-2">
          {lines.slice(-10).map((line, idx) => (
            <div key={idx} className="text-green-400 font-mono">{line}</div>
          ))}
        </div>
      )}
    </div>
  </div>
);

SpinnerOverlay.propTypes = {
  title: PropTypes.string,
  percent: PropTypes.number,
  lines: PropTypes.array,
};

class ProgressManager {
  constructor() {
    this.phases = {
      STEP1: { weight: 0.15, progress: 0, completed: false },
      STEP2: { weight: 0.15, progress: 0, completed: false },
      RENDER: { weight: 0.45, progress: 0, completed: false },
      COMPOSE: { weight: 0.25, progress: 0, completed: false }
    };
  }

  startPhase(phaseName) {
    if (this.phases[phaseName]) {
      this.phases[phaseName].progress = 0;
      this.phases[phaseName].completed = false;
    }
  }

  updatePhase(phaseName, progress) {
    if (this.phases[phaseName]) {
      this.phases[phaseName].progress = Math.min(1, Math.max(0, progress));
    }
    return this.getTotalProgress();
  }

  completePhase(phaseName) {
    if (this.phases[phaseName]) {
      this.phases[phaseName].progress = 1;
      this.phases[phaseName].completed = true;
    }
    return this.getTotalProgress();
  }

  getTotalProgress() {
    let total = 0;
    for (const phase of Object.values(this.phases)) {
      total += phase.weight * phase.progress;
    }
    return Math.round(total * 100);
  }

  reset() {
    for (const phase of Object.values(this.phases)) {
      phase.progress = 0;
      phase.completed = false;
    }
  }

  getPhaseProgress(phaseName) {
    return this.phases[phaseName]?.progress || 0;
  }
}

function getPromptFiles(videoPurpose) {
  console.log('[getPromptFiles] videoPurpose:', videoPurpose);
  
  if (videoPurpose === 'product' || videoPurpose === 'conversion') {
    console.log('[getPromptFiles] → 제품/전환용 프롬프트');
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

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading, user }) => {
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
      return { ...imageObj, compositingSuccess: false };
    }

    try {
      const overlayImageData = getOverlayImageData(imageObj.compositingInfo);
      if (!overlayImageData) {
        log(`❌ Scene ${imageObj.sceneNumber}: 합성용 이미지 없음`);
        return { ...imageObj, compositingSuccess: false };
      }

      log(`🎨 Scene ${imageObj.sceneNumber} 이미지 합성 중... ${retryCount > 0 ? `(재시도 ${retryCount}/${maxRetries})` : ''}`);

      const composeResponse = await fetch(`${API_BASE}/api/nanobanana-compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseImageUrl: imageObj.url,
          overlayImageData: overlayImageData,
          compositingInfo: {
            videoPurpose: imageObj.compositingInfo.videoPurpose || 'product',
            sceneDescription: imageObj.title || `Scene ${imageObj.sceneNumber}`,
            compositingContext: imageObj.compositingContext || 'natural placement'
          }
        }),
      });

      if (!composeResponse.ok) {
        throw new Error(`HTTP ${composeResponse.status}`);
      }

      const composeResult = await composeResponse.json();

      if (composeResult.success && composeResult.imageUrl) {
        imageObj.url = composeResult.imageUrl;
        imageObj.compositingSuccess = true;
        return imageObj;
      } else {
        throw new Error(composeResult.error || '합성 실패');
      }

    } catch (error) {
      log(`❌ Scene ${imageObj.sceneNumber} 합성 오류: ${error.message}`);
      
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return await composeSingleImageSafely(imageObj, style, compositingInfo, retryCount + 1, maxRetries);
      }

      return { ...imageObj, compositingSuccess: false };
    }
  };

  const handleGenerateStoryboard = async () => {
    setIsLoading(true);
    setError('');
    setPercent(0);
    setLogs([]);
    setImagesDone(0);
    setImagesFail(0);
    setDebugInfo(null);
    setStyles([]);
  
    const startTime = Date.now();
  
    try {
      log('🚀 스토리보드 생성을 시작합니다...');
      log('⏱️ 대기시간은 약 10분 내외입니다'); 
      log('☕ 잠시만 기다려주세요...');
  
      const videoPurpose = formData.videoPurpose || 'product';
      const promptFiles = getPromptFiles(videoPurpose);
  
      progressManager.startPhase('STEP1');
      log('아이디어를 구상하고 있습니다...');
      updateProgress('STEP1', 0.05);
  
      const step1ProgressInterval = setInterval(() => {
        const currentProgress = progressManager.phases.STEP1.progress;
        if (currentProgress < 0.85 && !progressManager.phases.STEP1.completed) {
          updateProgress('STEP1', currentProgress + 0.02);
        }
      }, 2000);
  
      const apiPayload = {
        brandName: formData.brandName || '',
        industryCategory: formData.industryCategory || '',
        productServiceCategory: formData.productServiceCategory || '',
        productServiceName: formData.productServiceName || '',
        videoPurpose: videoPurpose,
        videoLength: formData.videoLength || '10초',
        coreTarget: formData.coreTarget || '',
        coreDifferentiation: formData.coreDifferentiation || '',
        aspectRatioCode: formData.aspectRatioCode || 'widescreen_16_9',
        imageUpload: formData.imageUpload ? {
          name: formData.imageUpload.name,
          size: formData.imageUpload.size,
          url: formData.imageUpload.url
        } : null,
        promptType: promptFiles.step1
      };
  
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        log('⚠️ 요청 타임아웃 (30분 초과)');
      }, 1800000);

      let step1Response;
      try {
        step1Response = await fetch(`${API_BASE}/api/storyboard-init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-username': user.username
          },
          body: JSON.stringify(apiPayload),
          signal: controller.signal,
          keepalive: true
        });
      } catch (fetchError) {
        clearInterval(step1ProgressInterval);
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          throw new Error('요청 시간이 너무 오래 걸렸습니다. 다시 시도해주세요.');
        }
        throw new Error('서버에 연결할 수 없습니다. 네트워크를 확인해주세요.');
      }
  
      clearTimeout(timeoutId);
      clearInterval(step1ProgressInterval);
  
      log(`📡 서버 응답 상태: ${step1Response.status} ${step1Response.statusText}`);
  
      if (!step1Response.ok) {
        let errorMessage = '스토리보드 생성에 실패했습니다';
        try {
          const errorData = await step1Response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
          log(`❌ 서버 오류: ${errorMessage}`);
        } catch (e) {
          log(`❌ HTTP ${step1Response.status}: ${step1Response.statusText}`);
        }
        throw new Error(errorMessage);
      }
  
      let initData;
      try {
        const contentLength = step1Response.headers.get('content-length');
        log(`📦 응답 크기: ${contentLength ? `${(contentLength / 1024).toFixed(2)} KB` : '알 수 없음'}`);
        
        const responseText = await step1Response.text();
        log(`✅ 응답 수신 완료: ${responseText.length} chars`);
        
        if (!responseText.trim()) {
          throw new Error('서버 응답이 비어있습니다');
        }
        
        initData = JSON.parse(responseText);
        log('✅ JSON 파싱 성공');
      } catch (parseError) {
        log(`❌ 파싱 오류: ${parseError.message}`);
        throw new Error('서버 응답을 처리할 수 없습니다');
      }
  
      if (!initData.success) {
        throw new Error(initData.error || '스토리보드 생성 실패');
      }
  
      if (!initData.styles || !Array.isArray(initData.styles)) {
        throw new Error('스토리보드 데이터 형식이 올바르지 않습니다');
      }
  
      const { styles, metadata, compositingInfo } = initData;
  
      console.log('📊 [DEBUG] initData 구조:', {
        stylesCount: styles.length,
        firstStyle: {
          concept_id: styles[0]?.concept_id,
          imagesLength: styles[0]?.images?.length,
          imagePromptsLength: styles[0]?.imagePrompts?.length
        }
      });

      setDebugInfo({
        totalConcepts: styles.length,
        imagesPerConcept: styles[0]?.images?.length || 0,
        imagePromptsPerConcept: styles[0]?.imagePrompts?.length || 0
      });

      progressManager.completePhase('STEP1');
      updateProgress('STEP1', 1.0);
      log('✅ 아이디어 구상 완료');
      
      progressManager.startPhase('STEP2');
      log('컨셉을 개발하고 있습니다...');
      updateProgress('STEP2', 0.1);

      await new Promise(resolve => setTimeout(resolve, 3000));

      progressManager.completePhase('STEP2');
      updateProgress('STEP2', 1.0);
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

      const perStyle = finalStyles.length > 0 && finalStyles[0].images?.length > 0 ? 
        finalStyles[0].images.length : 0;
      const totalImages = finalStyles.length * perStyle;

      log(`📊 총 ${totalImages}개 이미지 생성 예정`);

      if (totalImages > 0) {
        progressManager.startPhase('RENDER');
        log(`📸 이미지 생성 중... (총 ${totalImages}개)`);

        let successImages = 0;
        let failedImages = 0;

        for (let styleIdx = 0; styleIdx < finalStyles.length; styleIdx++) {
          const style = finalStyles[styleIdx];
          const images = style.images || [];

          log(`🎨 [컨셉 ${styleIdx + 1}/${finalStyles.length}] ${images.length}개 씬 처리 시작`);

          if (images.length === 0) {
            log(`⚠️ [컨셉 ${styleIdx + 1}] images 배열이 비어있습니다!`);
            continue;
          }

          for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
            const img = images[imgIdx];
            try {
              log(`🎨 [컨셉 ${styleIdx + 1}] 씬 ${img.sceneNumber} 이미지 생성 중...`);

              const imagePromptPayload = {
                prompt: img.prompt || img.image_prompt?.prompt || `Scene ${img.sceneNumber}`,
                negative_prompt: img.negative_prompt || img.image_prompt?.negative_prompt || "blurry, low quality",
                aspect_ratio: img.aspect_ratio || 'widescreen_16_9',
                guidance_scale: img.guidance_scale || 7.5,
                seed: img.seed || Math.floor(Math.random() * 1000000),
                styling: img.styling || {
                  style: 'photo',
                  color: 'color',
                  lighting: 'natural'
                }
              };

              const renderResponse = await fetch(`${API_BASE}/api/storyboard-render-image`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-username': user.username
                },
                body: JSON.stringify({
                  imagePrompt: imagePromptPayload,
                  sceneNumber: img.sceneNumber,
                  conceptId: styleIdx + 1,
                  aspectRatio: formData.aspectRatioCode || 'widescreen_16_9',
                  title: img.title
                }),
              });

              if (renderResponse.ok) {
                const result = await renderResponse.json();
                if (result.success && result.url) {
                  img.url = result.url;
                  successImages++;
                  setImagesDone(successImages);
                  log(`✅ 씬 ${img.sceneNumber} 이미지 생성 성공`);
                } else {
                  failedImages++;
                  setImagesFail(failedImages);
                  log(`❌ 씬 ${img.sceneNumber} 이미지 생성 실패`);
                }
              } else {
                failedImages++;
                setImagesFail(failedImages);
                log(`❌ 씬 ${img.sceneNumber} HTTP ${renderResponse.status} 오류`);
              }
            } catch (e) {
              failedImages++;
              setImagesFail(failedImages);
              log(`❌ 씬 ${img.sceneNumber} 이미지 생성 오류`);
            }

            const progress = (successImages + failedImages) / totalImages;
            updateProgress('RENDER', Math.min(0.95, progress));

            if (imgIdx < images.length - 1 || styleIdx < finalStyles.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        }

        progressManager.completePhase('RENDER');
        updateProgress('RENDER', 1.0);
        log(`✅ 이미지 생성 완료: 성공 ${successImages}개, 실패 ${failedImages}개`);

        const allCompositingImages = [];
        for (const style of finalStyles) {
          const images = style.images || [];
          for (const img of images) {
            if (img.isCompositingScene && img.compositingInfo) {
              allCompositingImages.push(img);
            }
          }
        }

        if (allCompositingImages.length > 0 && imageInfo.hasImage) {
          progressManager.startPhase('COMPOSE');
          log(`🎨 이미지 합성 중... (총 ${allCompositingImages.length}개)`);

          let compositingSuccess = 0;
          let compositingFailed = 0;

          for (let i = 0; i < allCompositingImages.length; i++) {
            const imageObj = allCompositingImages[i];

            if (imageObj.compositingInfo && (formData.videoPurpose === 'product' || formData.videoPurpose === 'conversion')) {
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
          }
          log(`📊 이미지 합성 완료: 성공 ${compositingSuccess}개, 실패 ${compositingFailed}개`);
          progressManager.completePhase('COMPOSE');
          updateProgress('COMPOSE', 1.0);
        } else {
          progressManager.completePhase('COMPOSE');
          updateProgress('COMPOSE', 1.0);
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
            processingTimeMs: Date.now() - startTime,
            createdAt: new Date().toISOString(),
          }
        };

        setStoryboard?.(finalStoryboard);
        setStyles(finalStyles);

        log('🚀 다음 단계로 자동 이동합니다...');
        
        setTimeout(() => {
          setIsLoading?.(false);
          if (onNext) {
            console.log('🎯 Step2 → Step3 자동 이동 실행');
            onNext();
          }
        }, 2000);

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

        log('🚀 다음 단계로 자동 이동합니다...');
        
        setTimeout(() => {
          setIsLoading?.(false);
          if (onNext) {
            console.log('🎯 Step2 → Step3 자동 이동 실행');
            onNext();
          }
        }, 2000);
      }

    } catch (e) {
      setError(e.message);
      setIsLoading?.(false);
      setPercent(0);
      log(`❌ 오류 발생: ${e.message}`);
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

          {debugInfo && (
            <details className="mb-6 bg-gray-900/50 rounded-lg p-4 border border-gray-700">
              <summary className="cursor-pointer text-gray-400 hover:text-white text-sm font-medium">
                디버그 정보 보기
              </summary>
              <pre className="mt-2 text-xs text-gray-400 overflow-auto max-h-64">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </details>
          )}

          {styles && styles.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white mb-4">생성된 컨셉 미리보기</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {styles.map((style, idx) => (
                  <div key={idx} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-white">컨셉 {idx + 1}</h4>
                      <span className="text-xs text-gray-500">ID: {style.concept_id}</span>
                    </div>
                    <p className="text-sm text-gray-400 mb-2">
                      {style.concept_title || '제목 없음'}
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                      {style.concept_description || '설명 없음'}
                    </p>
                    <div className="text-xs text-gray-600">
                      씬 수: {style.images?.length || 0}개
                    </div>
                    {style.images && style.images.length > 0 && (
                      <div className="mt-3">
                        <div className="grid grid-cols-2 gap-2">
                          {style.images.slice(0, 4).map((img, imgIdx) => (
                            <div key={imgIdx} className="relative">
                              <img
                                src={img.url || '/placeholder.png'}
                                alt={`Scene ${img.sceneNumber}`}
                                className="w-full h-20 object-cover rounded border border-gray-700"
                                onError={(e) => {
                                  e.target.src = '/placeholder.png';
                                }}
                                loading="lazy"
                              />
                              <span className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1 rounded">
                                S#{img.sceneNumber}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
  user: PropTypes.object.isRequired,
};

export default Step2;

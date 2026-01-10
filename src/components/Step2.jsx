// src/components/Step2.jsx - 완전한 전체 코드 (생략 없음)
import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { forceScrollTop } from '../forceScrollTop';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/nexxii';

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
      INIT: { weight: 0.30, progress: 0, completed: false },
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

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading, user, currentProject }) => {
  const [percent, setPercent] = useState(0);
  const [logs, setLogs] = useState([]);
  const [imagesDone, setImagesDone] = useState(0);
  const [imagesFail, setImagesFail] = useState(0);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [styles, setStyles] = useState([]);

  const isBusy = isLoading;
  const progressManager = new ProgressManager();

  useEffect(() => {
    forceScrollTop();
  }, []);

  // 🔥 세션 체크 중복 방지용 ref (컴포넌트 마운트 시 1회만 실행)
  const sessionCheckRef = useRef(false);

  useEffect(() => {
    const checkOngoingSession = async () => {
      // 이미 체크했으면 스킵 (리렌더링 방지)
      if (sessionCheckRef.current) {
        return;
      }
      sessionCheckRef.current = true;

      try {
        const response = await fetch(`${API_BASE}/api/session/check`, {
          headers: {
            'x-username': user?.username || 'anonymous'
          }
        });

        const data = await response.json();

        if (data.hasOngoingSession && data.session) {
          log('🔄 진행 중인 작업을 감지하여 자동으로 복구합니다...');

          // 🔥 진행률 표시 활성화 (자동 복구)
          setIsLoading(true);
          setPercent(data.session.progress?.percentage || 0);

          if (data.session.storyboard) {
            setStoryboard(data.session.storyboard);
            setStyles(data.session.storyboard.styles || []);
            setPercent(100);
            setIsLoading(false);
            log('✅ 작업이 이미 완료되어 있습니다.');
          } else {
            // 🔥 세션 복구 시 폴링 재개
            log(`📡 세션 ID: ${data.session.sessionId} 연결 중...`);
            pollAndGenerateImages(data.session.sessionId);
          }
        } else {
          // 진행 중인 세션이 없으면 아무것도 안 함 (또는 로그)
          console.log('[Step2] 진행 중인 세션 없음');
        }
      } catch (error) {
        console.error('세션 확인 실패:', error);
      }
    };

    if (user?.username) {
      checkOngoingSession();
    }
  }, [user?.username]); // eslint-disable-line react-hooks/exhaustive-deps

  // 자동 실행 로직
  useEffect(() => {
    const shouldAutoStart = sessionStorage.getItem('autoStartStep2');

    if (shouldAutoStart === 'true') {
      sessionStorage.removeItem('autoStartStep2');

      // 0.5초 후 자동 실행 (컴포넌트 마운트 대기)
      setTimeout(() => {
        if (formData.mode === 'admin') {
          // Admin 모드: Gemini 호출 생략, 직접 이미지 생성
          if (formData.geminiResponse) {
            handleManualSubmit(formData.geminiResponse);
          }
        } else {
          // Auto/Manual 모드: 일반 생성 시작
          handleGenerateStoryboard();
        }
      }, 500);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔥 [M] Person Selection 기능
  const [persons, setPersons] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState('');
  const [personConfigVisible, setPersonConfigVisible] = useState(false);

  useEffect(() => {
    const loadPersonConfig = async () => {
      try {
        const configRes = await fetch(`${API_BASE}/api/admin-field-config/field-config`);
        const configData = await configRes.json();

        if (configData.success && configData.config?.personSelection?.visible) {
          setPersonConfigVisible(true);

          const personsRes = await fetch(`${API_BASE}/api/persons`);
          const personsData = await personsRes.json();
          if (personsData.success) {
            setPersons(personsData.persons || []);
          }
        }
      } catch (error) {
        console.error('Person config load error:', error);
      }
    };
    loadPersonConfig();
  }, []);

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
          compositingInfo: imageObj.compositingInfo,
          sceneNumber: imageObj.sceneNumber,
          conceptId: style?.conceptId || style?.id || 1,
          title: imageObj.title,
          prompt: imageObj.prompt || imageObj.image_prompt?.prompt,
        }),
      });

      if (!composeResponse.ok) {
        const errorData = await composeResponse.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${composeResponse.status}`);
      }

      const composeResult = await composeResponse.json();

      if (composeResult.success && composeResult.composedImageUrl) {
        imageObj.url = composeResult.composedImageUrl;
        imageObj.compositingSuccess = true;
        log(`✅ Scene ${imageObj.sceneNumber} 합성 완료`);
        return imageObj;
      } else {
        throw new Error('합성 결과 없음');
      }
    } catch (error) {
      log(`❌ Scene ${imageObj.sceneNumber} 합성 실패: ${error.message}`);

      if (retryCount < maxRetries) {
        log(`🔄 Scene ${imageObj.sceneNumber} 재시도 중... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return composeSingleImageSafely(imageObj, style, compositingInfo, retryCount + 1, maxRetries);
      }

      imageObj.compositingSuccess = false;
      return imageObj;
    }
  };

  const generateImagesAndCompose = async (finalStyles, finalCompositingInfo) => {
    const startTime = Date.now();

    const imageInfo = getUnifiedImageData(formData);
    if (imageInfo.hasImage) {
      if (formData.videoPurpose === 'product') {
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

          if (imageObj.compositingInfo && formData.videoPurpose === 'product') {
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

      return {
        successImages,
        failedImages,
        processingTimeMs: Date.now() - startTime
      };
    }

    return { successImages: 0, failedImages: 0, processingTimeMs: 0 };
  };

  const pollAndGenerateImages = async (sessionId) => {
    setIsLoading(true);
    progressManager.startPhase('INIT');

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/session/status/${sessionId}`);
        const data = await response.json();

        // 🔥 수정: data.session.progress로 읽기
        if (data.success && data.session && data.session.progress) {
          const progress = data.session.progress;

          // 진행률 업데이트
          setPercent(progress.percentage || 0);
          log(`📊 ${progress.phase || ''} ${progress.percentage || 0}% - ${progress.currentStep || ''}`);
        }

        // 🔥 v4.1: imageSetMode 확인하여 완료 처리
        if (data.success && data.session && data.session.status === 'completed' && data.session.result) {
          clearInterval(pollInterval);
          progressManager.completePhase('INIT');

          const result = data.session.result;
          const { styles, metadata, imageSetMode } = result;

          // 🔥 v4.1: imageSetMode 확인
          if (imageSetMode) {
            log('✅ 이미지 세트 생성 완료!');

            setDebugInfo({
              totalConcepts: styles.length,
              imagesPerConcept: styles[0]?.images?.length || 0,
              mode: 'imageSetMode'
            });

            // 🔥 CRITICAL: 새 객체 생성하여 React가 변경 감지 (Step3 리렌더링 트리거)
            setStoryboard({ ...result });
            setStyles(styles);
            setPercent(100);
            setIsLoading(false);

            // 🔥 G-1: 프로젝트에 자동 저장
            if (currentProject?.id) {
              log('💾 프로젝트에 저장 중...');
              try {
                const saveResponse = await fetch(`${API_BASE}/api/projects/${currentProject.id}`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-username': user?.username || 'anonymous'
                  },
                  body: JSON.stringify({
                    storyboard: result,
                    formData: formData,
                    lastStep: 3,  // Step3으로 복구되도록
                    updatedAt: new Date().toISOString()
                  })
                });

                if (saveResponse.ok) {
                  log('✅ 프로젝트 저장 완료!');
                } else {
                  console.error('[Step2] 프로젝트 저장 실패:', saveResponse.status);
                  log('⚠️ 프로젝트 저장 실패 (작업은 계속됩니다)');
                }
              } catch (saveError) {
                console.error('[Step2] 프로젝트 저장 오류:', saveError);
                log('⚠️ 프로젝트 저장 오류 (작업은 계속됩니다)');
              }
            }

            log('🚀 Step3으로 이동합니다 (이미지 세트 선택)...');

            setTimeout(() => {
              if (onNext) {
                console.log('🎯 Step2 → Step3 자동 이동 (이미지 세트 모드)');
                onNext();
              }
            }, 2000);
          } else {
            // 구버전 호환 (finalVideos 있는 경우)
            log('✅ 전체 구조 생성 완료!');
            setStoryboard(result);
            setStyles(styles);
            setPercent(100);
            setIsLoading(false);

            setTimeout(() => {
              if (onNext) onNext();
            }, 2000);
          }


        } else if (data.success && data.session && data.session.status === 'error') {
          clearInterval(pollInterval);
          const errorMsg = data.session.error?.message || '알 수 없는 오류';
          setError(errorMsg);
          setIsLoading(false);
          log(`❌ 오류: ${errorMsg}`);
        }
      } catch (error) {
        console.error('세션 상태 확인 실패:', error);
      }
    }, 3000);  // 🔥 3초로 변경 (더 빠른 업데이트)

    setTimeout(() => {
      clearInterval(pollInterval);
      setIsLoading(false);
    }, 1800000);
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

    try {
      log('🚀 광고 영상 생성을 시작합니다...');
      log('⏱️ 대기시간은 약 10분 내외입니다');
      log('☕ 잠시만 기다려주세요...');

      const sessionId = `session_${Date.now()}_${user?.username || 'anonymous'}`;

      try {
        await fetch(`${API_BASE}/api/session/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-username': user?.username || 'anonymous'
          },
          body: JSON.stringify({
            sessionId,
            formData: formData,
            timestamp: new Date().toISOString()
          })
        });
        log('💾 세션이 저장되었습니다. 새로고침해도 안전합니다.');
      } catch (sessionError) {
        console.error('세션 저장 실패:', sessionError);
      }

      const apiPayload = {
        projectId: currentProject?.id,  // 🔥 추가: 프로젝트 ID 전달
        brandName: formData.brandName || '',
        industryCategory: formData.industryCategory || '',
        productServiceCategory: formData.productServiceCategory || '',
        productServiceName: formData.productServiceName || '',
        videoPurpose: formData.videoPurpose || 'product',
        videoLength: formData.videoLength || '10초',
        coreTarget: formData.coreTarget || '',
        coreDifferentiation: formData.coreDifferentiation || '',
        aspectRatioCode: formData.aspectRatioCode || 'widescreen_16_9',
        videoRequirements: formData.videoRequirements || '없음',
        mode: formData.mode || 'auto',
        userdescription: formData.userdescription || '',
        imageUpload: formData.imageUpload ? {
          name: formData.imageUpload.name,
          size: formData.imageUpload.size,
          url: formData.imageUpload.url
        } : null,
        sessionId: sessionId,
        personSelection: formData.personSelection // 🔥 인물 선택 (URL, Step1에서 전달받음)
      };

      let initResponse;
      try {
        initResponse = await fetch(`${API_BASE}/api/storyboard-init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-username': user.username
          },
          body: JSON.stringify(apiPayload)
        });
      } catch (fetchError) {
        throw new Error('서버에 연결할 수 없습니다. 네트워크를 확인해주세요.');
      }

      log(`📡 서버 응답 상태: ${initResponse.status} ${initResponse.statusText}`);

      if (initResponse.status === 202) {
        const data = await initResponse.json();
        log(`✅ 작업 시작됨. 세션 ID: ${data.sessionId}`);
        pollAndGenerateImages(data.sessionId);
        return;
      }

      throw new Error('예상치 못한 응답 형식입니다');

    } catch (e) {
      setError(e.message);
      setIsLoading(false);
      setPercent(0);
      log(`❌ 오류 발생: ${e.message}`);
    }
  };

  const handleManualSubmit = async (geminiResponse) => {
    try {
      const sessionId = `session_${Date.now()}_${user?.username || 'anonymous'}`;

      const response = await fetch(`${API_BASE}/api/storyboard-manual-inject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          manualGeminiResponse: geminiResponse,
          formData: {
            ...formData,
            projectId: currentProject?.id || null // 🔥 projectId 추가
          },
          sessionId: sessionId
        })
      });

      const data = await response.json();

      if (data.success) {
        setShowManualModal(false);
        // 기존 폴링 로직 재사용
        await pollAndGenerateImages(sessionId);
      } else {
        setError(data.error || '수동 입력 처리 실패');
      }
    } catch (error) {
      console.error('[handleManualSubmit] 오류:', error);
      setError(error.message);
    }
  };

  const getButtonText = () => {
    const imageInfo = getUnifiedImageData(formData);
    return imageInfo.hasImage
      ? '광고 영상 생성 시작'
      : '광고 영상 생성 시작';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black relative">
      {isBusy && <SpinnerOverlay title="광고 영상을 제작하고 있습니다..." percent={percent} lines={logs} />}

      <div className={`max-w-7xl mx-auto p-6 ${isBusy ? 'pointer-events-none opacity-50' : ''}`}>
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-8">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-white mb-2">
              광고 영상 생성
            </h2>
            <p className="text-gray-400">
              {formData.mode === 'manual'
                ? '자유롭게 입력하신 내용을 바탕으로 광고 컨셉을 생성합니다'
                : '입력하신 정보를 바탕으로 광고 컨셉을 생성합니다'
              }
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
              <h3 className="text-xl font-semibold text-white mb-4">생성된 이미지 세트 미리보기</h3>
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
  currentProject: PropTypes.object  // 🔥 추가
};

export default Step2;

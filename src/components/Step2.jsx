// src/components/Step2.jsx - 완전 수정본

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AlertCircle, Play, Download, ArrowLeft, ArrowRight, RefreshCw, CheckCircle, X, Loader2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

// 🔥 영상 비율 코드를 Seedream v4 aspect_ratio로 매핑
const getAspectRatioCode = (aspectRatioCode) => {
  const mapping = {
    'widescreen_16_9': 'widescreen_16_9',
    'square_1_1': 'square_1_1', 
    'vertical_9_16': 'vertical_9_16'
  };
  return mapping[aspectRatioCode] || 'widescreen_16_9';
};

// 비율별 해상도 매핑
const getWidthFromAspectRatio = (aspectRatioCode) => {
  const mapping = {
    'widescreen_16_9': 1920,
    'square_1_1': 1024,
    'vertical_9_16': 1080
  };
  return mapping[aspectRatioCode] || 1920;
};

const getHeightFromAspectRatio = (aspectRatioCode) => {
  const mapping = {
    'widescreen_16_9': 1080,
    'square_1_1': 1024,
    'vertical_9_16': 1920
  };
  return mapping[aspectRatioCode] || 1080;
};

// 프롬프트 파일 선택 함수
const getPromptFiles = (videoPurpose) => {
  if (videoPurpose === 'product') {
    return {
      step1: 'step1_product',
      step2: 'step2_product'
    };
  } else {
    return {
      step1: 'step1_service',
      step2: 'step2_service'
    };
  }
};

// 프로그레스 매니저
const createProgressManager = () => ({
  phases: {
    STEP1: { current: 0, weight: 25 },
    STEP2: { current: 0, weight: 25 },
    IMAGES: { current: 0, weight: 45 },
    FINAL: { current: 0, weight: 5 }
  },
  startPhase(phase) {
    this.phases[phase].current = Object.keys(this.phases)
      .filter(p => p !== phase && this.phases[p].current > 0)
      .reduce((sum, p) => sum + this.phases[p].weight, 0);
  },
  completePhase(phase) {
    this.phases[phase].current = Object.keys(this.phases)
      .filter(p => Object.keys(this.phases).indexOf(p) <= Object.keys(this.phases).indexOf(phase))
      .reduce((sum, p) => sum + this.phases[p].weight, 0);
  }
});

export default function Step2({ 
  formData = {}, 
  onBack, 
  onNext, 
  setPercent, 
  setIsLoading, 
  percent = 0,
  isLoading = false 
}) {
  // State 관리
  const [styles, setStyles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [imagesDone, setImagesDone] = useState(0);
  const [imagesFail, setImagesFail] = useState(0);
  const [error, setError] = useState('');
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [compositingInfo, setCompositingInfo] = useState(null);
  
  const progressManager = useRef(createProgressManager()).current;

  // 사용자 입력 비활성화 상태 계산
  const isBusy = useMemo(() => isLoading || isRegenerating, [isLoading, isRegenerating]);

  // 🔥 로그 추가 함수
  const log = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setLogs(prev => [...prev, logEntry]);
  };

  // 🔥 프로그레스 업데이트 함수
  const updateProgress = (phase, progress) => {
    progressManager.phases[phase].current = 
      Object.keys(progressManager.phases)
        .filter(p => Object.keys(progressManager.phases).indexOf(p) < Object.keys(progressManager.phases).indexOf(phase))
        .reduce((sum, p) => sum + progressManager.phases[p].weight, 0) + 
      (progressManager.phases[phase].weight * progress);
    
    const totalProgress = Math.min(100, Math.round(progressManager.phases[phase].current));
    setPercent(totalProgress);
  };

  // 🔥 단일 이미지 합성 함수 (기존 로직 유지)
  const composeSingleImageSafely = async (imageObj, style, compositingInfo, retryCount = 0, maxRetries = 2) => {
    const hasProductImageData = compositingInfo?.productImageData?.name && compositingInfo?.productImageData?.size > 0;
    const hasBrandLogoData = compositingInfo?.brandLogoData?.name && compositingInfo?.brandLogoData?.size > 0;
    
    if (!hasProductImageData && !hasBrandLogoData) {
      console.log(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber}: 합성할 오버레이 데이터 없음`);
      return { ...imageObj, isComposed: false, compositingSuccess: false };
    }

    const flags = { hasProductImageData, hasBrandLogoData };
    
    try {
      console.log(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} 합성 시작 (시도: ${retryCount + 1})`);

      const overlayImageData = getOverlayImageData(compositingInfo, flags);
      if (!overlayImageData) {
        console.error(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} 오버레이 데이터 없음`);
        return { ...imageObj, isComposed: false, compositingSuccess: false };
      }

      const compositionResponse = await fetch(`${API_BASE}/api/image-composition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backgroundImageUrl: imageObj.url,
          overlayImageData,
          sceneNumber: imageObj.sceneNumber,
          styleData: style,
          compositingMetadata: {
            explicit: imageObj.compositingInfo?.explicit || false,
            context: imageObj.compositingInfo?.context || '',
            videoPurpose: imageObj.compositingInfo?.videoPurpose || 'product'
          }
        })
      });

      if (!compositionResponse.ok) {
        throw new Error(`이미지 합성 HTTP 오류: ${compositionResponse.status}`);
      }

      const compositionResult = await compositionResponse.json();
      
      if (compositionResult.success && compositionResult.composedImageUrl) {
        console.log(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} 합성 완료`);
        return {
          ...imageObj,
          url: compositionResult.composedImageUrl,
          originalUrl: imageObj.url,
          isComposed: true,
          compositingSuccess: true,
          compositionMetadata: compositionResult.metadata
        };
      } else {
        throw new Error(compositionResult.error || '합성 결과 없음');
      }

    } catch (error) {
      console.error(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} 합성 실패 (시도 ${retryCount + 1}):`, error);
      
      if (retryCount < maxRetries) {
        const retryDelay = (retryCount + 1) * 5000;
        console.log(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} ${retryDelay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return composeSingleImageSafely(imageObj, style, compositingInfo, retryCount + 1, maxRetries);
      } else {
        console.error(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} 최종 실패, 원본 사용`);
        return {
          ...imageObj,
          isComposed: false,
          compositingSuccess: false,
          compositionError: error.message
        };
      }
    }
  };

  // 오버레이 이미지 데이터 추출
  const getOverlayImageData = (compositingInfo, flags) => {
    if (flags.hasProductImageData && compositingInfo.productImageData) {
      return compositingInfo.productImageData;
    }
    if (flags.hasBrandLogoData && compositingInfo.brandLogoData) {
      return compositingInfo.brandLogoData;
    }
    return null;
  };

  // 🔥 메인 스토리보드 생성 함수
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

      // 제품/서비스에 따른 프롬프트 선택
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

      console.log('[Step2] STEP1 API 호출 시작:', {
        promptType: promptFiles.step1,
        videoPurpose: formData.videoPurpose,
        brandName: formData.brandName
      });

      // formData에서 파일 객체를 제외하고 필요한 필드만 추출
      const apiPayload = {
        brandName: formData.brandName,
        industryCategory: formData.industryCategory,
        productServiceCategory: formData.productServiceCategory,
        productServiceName: formData.productServiceName,
        videoPurpose: formData.videoPurpose,
        videoLength: formData.videoLength,
        coreTarget: formData.coreTarget,
        coreDifferentiation: formData.coreDifferentiation,
        aspectRatioCode: formData.aspectRatioCode,
        brandLogo: formData.brandLogo ? {
          name: formData.brandLogo.name,
          size: formData.brandLogo.size
        } : null,
        productImage: formData.productImage ? {
          name: formData.productImage.name,
          size: formData.productImage.size
        } : null
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
        console.error('[Step2] STEP1 API 실패:', step1Response.status, errorText);
        throw new Error(`Step1 API 호출 실패: ${step1Response.status} - ${errorText.substring(0, 100)}`);
      }

      let initData;
      try {
        const step1ResponseText = await step1Response.text();
        console.log('[Step2] STEP1 응답 수신:', step1ResponseText.length, 'chars');
        initData = JSON.parse(step1ResponseText);
        console.log('[Step2] STEP1 파싱 성공:', initData);
      } catch (parseError) {
        console.error('[Step2] STEP1 JSON 파싱 실패:', parseError);
        log(`❌ Step1 JSON 파싱 실패: ${parseError.message}`);
        throw new Error('Step1 서버 응답 형식이 올바르지 않습니다. 서버 로그를 확인하세요.');
      }

      if (!initData.success) {
        console.error('[Step2] STEP1 실패:', initData.error);
        throw new Error(initData.error || 'Step1 스토리보드 생성 실패');
      }

      if (!initData.styles || !Array.isArray(initData.styles)) {
        console.error('[Step2] STEP1 데이터 형식 오류:', initData);
        throw new Error('Step1 스토리보드 데이터 형식이 올바르지 않습니다.');
      }

      const { styles, metadata, compositingInfo } = initData;

      // Gemini Step1 응답 저장
      try {
        await fetch(`${API_BASE}/api/prompts/save-response`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            promptKey: promptFiles.step1,
            step: 'step1',
            formData: formData,
            response: JSON.stringify(initData, null, 2),
            timestamp: Date.now()
          })
        });
        console.log('[Step2] STEP1 응답 저장 완료');
      } catch (saveError) {
        console.warn('[Step2] STEP1 응답 저장 실패:', saveError);
      }

      progressManager.completePhase('STEP1');
      setPercent(25);
      log('✅ STEP1 완료: 기본 스토리보드 구조 생성 성공');

      // STEP2: 상세 JSON 스토리보드는 이미 STEP1에서 처리됨
      progressManager.startPhase('STEP2');
      log('2/4 STEP2: JSON 데이터 처리 중...');
      
      // STEP2 진행률 시뮬레이션
      await new Promise(resolve => {
        let progress = 0;
        const step2Interval = setInterval(() => {
          progress += 0.1;
          updateProgress('STEP2', Math.min(0.9, progress));
          if (progress >= 0.9) {
            clearInterval(step2Interval);
            resolve();
          }
        }, 200);
      });

      progressManager.completePhase('STEP2');
      setPercent(50);
      log('✅ STEP2 완료: JSON 스토리보드 구조 검증 성공');

      // 합성 정보 설정
      setCompositingInfo(compositingInfo);

      const finalStyles = styles.map((style, index) => ({
        ...style,
        id: style.id || index + 1
      }));

      log(`🎯 생성된 컨셉: ${finalStyles.length}개`);
      log(`📊 평균 씬 수: ${finalStyles.length > 0 ? 
        Math.round(finalStyles.reduce((sum, s) => sum + (s.imagePrompts?.length || 0), 0) / finalStyles.length) : 0}개 씬`);

      const perStyle = finalStyles.length > 0 ? (finalStyles[0].imagePrompts?.length || 0) : 0;
      const totalImages = finalStyles.length * perStyle;

      log(`🎯 총 생성할 이미지: ${totalImages}개 (${finalStyles.length} 컨셉 × ${perStyle} 씬)`);

      // STEP3: 이미지 생성
      if (totalImages > 0) {
        progressManager.startPhase('IMAGES');
        log('3/4 IMAGES: 이미지 생성 시작');
        updateProgress('IMAGES', 0.1);

        let successImages = 0;
        let failedImages = 0;

        // 각 스타일에 images 배열 초기화
        finalStyles.forEach(style => {
          if (!style.images) style.images = [];
        });

        const imageTasks = [];
        finalStyles.forEach(style => {
          style.imagePrompts.forEach(p => {
            imageTasks.push(async () => {
              try {
                // 🔥 올바른 Seedream v4 imagePrompt 구조로 전송
                const promptToSend = p.prompt || p.image_prompt?.prompt || 'Professional commercial photo, 8K, high quality';
                
                console.log(`[Step2] 이미지 생성 요청: Style ${style.id}, Scene ${p.sceneNumber}`);
                console.log(`[Step2] 프롬프트: ${promptToSend.substring(0, 100)}...`);
                console.log(`[Step2] 영상 비율: ${formData.aspectRatioCode} → ${getAspectRatioCode(formData.aspectRatioCode)}`);

                const res = await fetch(`${API_BASE}/api/storyboard-render-image`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    // 🔥 올바른 imagePrompt 객체 구조
                    imagePrompt: {
                      prompt: promptToSend,
                      aspect_ratio: getAspectRatioCode(formData.aspectRatioCode),
                      guidance_scale: 2.5,
                      seed: Math.floor(10000 + Math.random() * 90000)
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
                      url: data.url,
                      thumbnail: data.url,
                      prompt: promptToSend,
                      duration: p.duration || 2,
                      sceneNumber: p.sceneNumber,
                      // 합성 정보 추가
                      isCompositingScene: p.isCompositingScene || false,
                      compositingInfo: p.compositingInfo || null
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
                console.error(`[Step2] 이미지 생성 실패: Style ${style.id}, Scene ${p.sceneNumber}:`, error);
                failedImages++;
                setImagesFail(prev => prev + 1);
                log(`❌ Scene ${p.sceneNumber} 이미지 생성 실패: ${error.message}`);
              }
            });
          });
        });

        // 이미지 생성 병렬 처리 (최대 3개씩)
        const CONCURRENT_LIMIT = 3;
        for (let i = 0; i < imageTasks.length; i += CONCURRENT_LIMIT) {
          const batch = imageTasks.slice(i, i + CONCURRENT_LIMIT);
          await Promise.all(batch.map(task => task()));
          
          const progress = Math.min(0.9, (i + CONCURRENT_LIMIT) / imageTasks.length);
          updateProgress('IMAGES', progress);
        }

        log(`📊 이미지 생성 완료: 성공 ${successImages}개, 실패 ${failedImages}개`);
      }

      progressManager.completePhase('IMAGES');
      updateProgress('IMAGES', 1.0);

      // STEP4: 이미지 합성 (PRODUCT COMPOSITING SCENE이 있는 경우)
      if (compositingInfo && (
        (compositingInfo.productImageData?.size > 0) || 
        (compositingInfo.brandLogoData?.size > 0)
      )) {
        progressManager.startPhase('FINAL');
        log('4/4 FINAL: 제품 합성 시작');
        updateProgress('FINAL', 0.2);

        let compositingSuccess = 0;
        let compositingFailed = 0;

        for (const style of finalStyles) {
          const compositingImages = style.images.filter(img => img.isCompositingScene);
          
          for (const imageObj of compositingImages) {
            try {
              const composedImage = await composeSingleImageSafely(imageObj, style, compositingInfo);
              
              // 원본 이미지를 합성된 이미지로 교체
              const imageIndex = style.images.findIndex(img => img.id === imageObj.id);
              if (imageIndex !== -1) {
                style.images[imageIndex] = composedImage;
              }

              if (composedImage.compositingSuccess) {
                compositingSuccess++;
                log(`✅ Scene ${imageObj.sceneNumber} 제품 합성 완료`);
              } else {
                compositingFailed++;
                log(`⚠️ Scene ${imageObj.sceneNumber} 제품 합성 실패 (원본 사용)`);
              }
            } catch (error) {
              compositingFailed++;
              log(`❌ Scene ${imageObj.sceneNumber} 제품 합성 오류: ${error.message}`);
            }
          }
        }

        log(`📊 제품 합성 완료: 성공 ${compositingSuccess}개, 실패 ${compositingFailed}개`);
        progressManager.completePhase('FINAL');
      }

      // 최종 결과 설정
      setStyles(finalStyles);
      setPercent(100);

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      log(`🎉 전체 스토리보드 생성 완료 (${totalTime}초)`);
      log(`📈 최종 결과: ${finalStyles.length}개 컨셉, ${finalStyles.reduce((sum, s) => sum + s.images.length, 0)}개 이미지`);

    } catch (error) {
      console.error('[Step2] 스토리보드 생성 실패:', error);
      setError(error.message || '알 수 없는 오류가 발생했습니다.');
      log(`❌ 생성 실패: ${error.message}`);
    } finally {
      setIsLoading?.(false);
    }
  };

  // 🔥 개별 이미지 재생성 함수
  const handleRegenerateImage = async (styleIndex, imageIndex) => {
    if (isBusy) return;

    const style = styles[styleIndex];
    const image = style.images[imageIndex];
    
    if (!style || !image) {
      console.error('[Step2] 재생성할 이미지를 찾을 수 없음:', { styleIndex, imageIndex });
      return;
    }

    setIsRegenerating(true);
    log(`🔄 Scene ${image.sceneNumber} 이미지 재생성 시작...`);

    try {
      const promptToSend = image.prompt || 'Professional commercial photo, 8K, high quality';
      
      console.log(`[Step2] 이미지 재생성: Style ${style.id}, Scene ${image.sceneNumber}`);

      const res = await fetch(`${API_BASE}/api/storyboard-render-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 🔥 올바른 imagePrompt 객체 구조
          imagePrompt: {
            prompt: promptToSend,
            aspect_ratio: getAspectRatioCode(formData.aspectRatioCode),
            guidance_scale: 2.5,
            seed: Math.floor(10000 + Math.random() * 90000)
          },
          sceneNumber: image.sceneNumber,
          conceptId: style.concept_id || style.id
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.url) {
          // 새 이미지로 교체
          const newImage = { ...image, url: data.url, thumbnail: data.url };
          
          // 합성이 필요한 경우 합성 수행
          let finalImage = newImage;
          if (image.isCompositingScene && compositingInfo) {
            try {
              finalImage = await composeSingleImageSafely(newImage, style, compositingInfo);
              log(`✅ Scene ${image.sceneNumber} 재생성 및 합성 완료`);
            } catch (compError) {
              console.warn('[Step2] 재생성 후 합성 실패:', compError);
              log(`⚠️ Scene ${image.sceneNumber} 재생성 완료, 합성 실패 (원본 사용)`);
            }
          }
          
          // 스타일의 이미지 배열 업데이트
          const newStyles = [...styles];
          newStyles[styleIndex].images[imageIndex] = finalImage;
          setStyles(newStyles);
          
          log(`✅ Scene ${image.sceneNumber} 이미지 재생성 완료`);
        } else {
          throw new Error(data.error || '이미지 URL 없음');
        }
      } else {
        const errorText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errorText.substring(0, 100)}`);
      }
    } catch (error) {
      console.error(`[Step2] 이미지 재생성 실패:`, error);
      log(`❌ Scene ${image.sceneNumber} 재생성 실패: ${error.message}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  // 컴포넌트 마운트 시 자동 생성 시작
  useEffect(() => {
    if (formData.brandName && !isLoading && styles.length === 0) {
      handleGenerateStoryboard();
    }
  }, [formData.brandName]);

  // 키보드 네비게이션
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (styles.length === 0 || isBusy) return;
      
      if (e.key === 'ArrowLeft' && currentPreviewIndex > 0) {
        setCurrentPreviewIndex(prev => prev - 1);
      } else if (e.key === 'ArrowRight' && currentPreviewIndex < styles.length - 1) {
        setCurrentPreviewIndex(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentPreviewIndex, styles.length, isBusy]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              disabled={isBusy}
              className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-white rounded-lg transition-colors duration-200 disabled:opacity-50"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">이전 단계</span>
            </button>
            <div className="text-sm text-gray-500">
              STEP 2/3: AI 스토리보드 생성
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* 통계 표시 */}
            {(imagesDone > 0 || imagesFail > 0) && (
              <div className="flex items-center space-x-3 text-sm">
                <div className="flex items-center space-x-1 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>{imagesDone}</span>
                </div>
                {imagesFail > 0 && (
                  <div className="flex items-center space-x-1 text-red-500">
                    <X className="w-4 h-4" />
                    <span>{imagesFail}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 프로그레스 바 */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>생성 진행률</span>
            <span>{Math.round(percent)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
        </div>

        {/* 에러 표시 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-red-800">생성 오류</h3>
                <p className="text-sm text-red-600 mt-1">{error}</p>
                <button
                  onClick={handleGenerateStoryboard}
                  disabled={isBusy}
                  className="mt-3 text-sm bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded-md transition-colors disabled:opacity-50"
                >
                  다시 시도
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 메인 컨텐츠 */}
        <div className="grid lg:grid-cols-3 gap-6">
          
          {/* 좌측: 스토리보드 결과 */}
          <div className="lg:col-span-2">
            {isLoading ? (
              <div className="bg-white rounded-xl shadow-sm border p-8">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-4" />
                  <h3 className="text-lg font-medium text-gray-800 mb-2">AI 스토리보드 생성 중...</h3>
                  <p className="text-gray-600 mb-6">잠시만 기다려주세요</p>
                </div>
              </div>
            ) : styles.length > 0 ? (
              <>
                {/* 컨셉 탭 */}
                <div className="bg-white rounded-xl shadow-sm border mb-4">
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800">생성된 컨셉들</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {styles.length}개 컨셉 · 총 {styles.reduce((sum, s) => sum + (s.images?.length || 0), 0)}개 씬
                    </p>
                  </div>
                  
                  {/* 탭 버튼들 */}
                  <div className="flex overflow-x-auto border-b border-gray-100">
                    {styles.map((style, index) => (
                      <button
                        key={style.id || index}
                        onClick={() => setCurrentPreviewIndex(index)}
                        className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                          currentPreviewIndex === index
                            ? 'border-blue-500 text-blue-600 bg-blue-50'
                            : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                        }`}
                      >
                        컨셉 {index + 1}
                        {style.images && style.images.length > 0 && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                            {style.images.length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 현재 선택된 컨셉 */}
                {styles[currentPreviewIndex] && (
                  <div className="bg-white rounded-xl shadow-sm border">
                    <div className="p-6 border-b border-gray-100">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-xl font-bold text-gray-800 mb-2">
                            {styles[currentPreviewIndex].conceptName || styles[currentPreviewIndex].style || `컨셉 ${currentPreviewIndex + 1}`}
                          </h4>
                          <p className="text-gray-600 text-sm">
                            {styles[currentPreviewIndex].style && styles[currentPreviewIndex].conceptName !== styles[currentPreviewIndex].style 
                              ? styles[currentPreviewIndex].style 
                              : '시각적 스타일'
                            }
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setCurrentPreviewIndex(Math.max(0, currentPreviewIndex - 1))}
                            disabled={currentPreviewIndex === 0}
                            className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ArrowLeft className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setCurrentPreviewIndex(Math.min(styles.length - 1, currentPreviewIndex + 1))}
                            disabled={currentPreviewIndex === styles.length - 1}
                            className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ArrowRight className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 이미지 그리드 */}
                    <div className="p-6">
                      {styles[currentPreviewIndex].images && styles[currentPreviewIndex].images.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {styles[currentPreviewIndex].images.map((image, imageIndex) => (
                            <div key={image.id || imageIndex} className="group relative">
                              <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                                <img 
                                  src={image.url || image.thumbnail}
                                  alt={image.title || `Scene ${image.sceneNumber || imageIndex + 1}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                
                                {/* 오버레이 */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors">
                                  <div className="absolute top-2 left-2">
                                    <span className="bg-black/70 text-white text-xs px-2 py-1 rounded">
                                      Scene {image.sceneNumber || imageIndex + 1}
                                    </span>
                                    {image.isComposed && (
                                      <span className="ml-1 bg-green-600 text-white text-xs px-2 py-1 rounded">
                                        합성
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* 재생성 버튼 */}
                                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleRegenerateImage(currentPreviewIndex, imageIndex)}
                                      disabled={isRegenerating}
                                      className="p-2 bg-white/90 hover:bg-white text-gray-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                                      title="이미지 재생성"
                                    >
                                      <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* 이미지 정보 */}
                              <div className="mt-2">
                                <h5 className="font-medium text-gray-800 text-sm">
                                  {image.title || `Scene ${image.sceneNumber || imageIndex + 1}`}
                                </h5>
                                {image.prompt && (
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                    {image.prompt.substring(0, 80)}...
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-gray-500">이 컨셉의 이미지가 아직 생성되지 않았습니다.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border p-8">
                <div className="text-center">
                  <Play className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-800 mb-2">스토리보드가 준비되지 않았습니다</h3>
                  <p className="text-gray-600 mb-6">AI가 브랜드 정보를 바탕으로 창의적인 광고 영상 스토리보드를 생성합니다.</p>
                  <button
                    onClick={handleGenerateStoryboard}
                    disabled={isBusy || !formData.brandName}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    스토리보드 생성 시작
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 우측: 로그 및 컨트롤 */}
          <div className="space-y-6">
            
            {/* 생성 로그 */}
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">생성 로그</h3>
              </div>
              <div className="p-4">
                <div className="h-80 overflow-y-auto space-y-1">
                  {logs.length > 0 ? logs.map((log, index) => (
                    <div key={index} className="text-xs font-mono text-gray-600 py-1">
                      {log}
                    </div>
                  )) : (
                    <div className="text-sm text-gray-500 text-center py-8">
                      로그가 표시됩니다...
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 컨트롤 패널 */}
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">컨트롤</h3>
              </div>
              <div className="p-4 space-y-4">
                
                {/* 재생성 버튼 */}
                <button
                  onClick={handleGenerateStoryboard}
                  disabled={isBusy}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? '생성 중...' : '다시 생성하기'}</span>
                </button>

                {/* 다음 단계 버튼 */}
                <button
                  onClick={onNext}
                  disabled={isBusy || styles.length === 0 || styles.every(s => !s.images || s.images.length === 0)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  <span>다음 단계</span>
                  <ArrowRight className="w-5 h-5" />
                </button>

                {/* 다운로드 버튼 */}
                {styles.length > 0 && (
                  <button
                    onClick={() => {
                      const dataStr = JSON.stringify(styles, null, 2);
                      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                      const exportFileDefaultName = `storyboard_${formData.brandName || 'export'}_${Date.now()}.json`;
                      const linkElement = document.createElement('a');
                      linkElement.setAttribute('href', dataUri);
                      linkElement.setAttribute('download', exportFileDefaultName);
                      linkElement.click();
                    }}
                    disabled={isBusy}
                    className="w-full border border-gray-300 hover:border-gray-400 text-gray-700 px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    <Download className="w-5 h-5" />
                    <span>스토리보드 다운로드</span>
                  </button>
                )}
              </div>
            </div>

            {/* 브랜드 정보 요약 */}
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">브랜드 정보</h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <div className="text-sm font-medium text-gray-600">브랜드명</div>
                  <div className="text-sm text-gray-800">{formData.brandName || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-600">영상 목적</div>
                  <div className="text-sm text-gray-800">
                    {formData.videoPurpose === 'product' ? '제품 광고' : '서비스 광고'}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-600">영상 길이</div>
                  <div className="text-sm text-gray-800">{formData.videoLength || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-600">영상 비율</div>
                  <div className="text-sm text-gray-800">
                    {formData.aspectRatioCode === 'widescreen_16_9' && '가로형 (16:9)'}
                    {formData.aspectRatioCode === 'square_1_1' && '정사각형 (1:1)'}
                    {formData.aspectRatioCode === 'vertical_9_16' && '세로형 (9:16)'}
                    {!formData.aspectRatioCode && '-'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

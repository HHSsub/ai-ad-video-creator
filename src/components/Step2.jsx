// src/components/Step2.jsx - 기존 코드에서 최소한만 수정

import { useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// 스피너 오버레이 컴포넌트 - 기존 그대로 유지
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

// 진척도 관리 클래스 - 기존 그대로 유지
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

// 🔥 Seedream v4 지원 영상 비율 매핑
function getAspectRatioCode(videoAspectRatio) {
  console.log(`[getAspectRatioCode] 입력: "${videoAspectRatio}"`);
  
  if (!videoAspectRatio || typeof videoAspectRatio !== 'string') {
    console.log('[getAspectRatioCode] 기본값 사용: widescreen_16_9');
    return 'widescreen_16_9';
  }
  
  const normalized = videoAspectRatio.toLowerCase().trim();
  
  // Seedream v4 공식 파라미터 매핑
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
  
  // 기본값
  console.log('[getAspectRatioCode] 매칭 실패, 기본값: widescreen_16_9');
  return 'widescreen_16_9';
}

// 이미지 수 계산 함수 - 기존 그대로 유지
function imagesPerStyle(videoLength, fallbackCountFromMeta) {
  if (typeof fallbackCountFromMeta === 'number' && fallbackCountFromMeta > 0) {
    return fallbackCountFromMeta;
  }
  const digits = String(videoLength || '').match(/\d+/);
  const sec = digits ? parseInt(digits[0], 10) : 10;
  
  if (sec <= 10) return 5;
  if (sec <= 20) return 10;  
  if (sec <= 30) return 15;
  return 5;
}

// 워커 풀 함수 - 기존 그대로 유지
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

// 🔥 제품/서비스에 따른 프롬프트 파일 결정
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
  
  // 기본값 (하위 호환성)
  console.log('[getPromptFiles] → 기본값 (제품용)');
  return {
    step1: 'step1_product',
    step2: 'step2_product'
  };
}

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [percent, setPercent] = useState(0);
  const [logs, setLogs] = useState([]);
  const [imagesDone, setImagesDone] = useState(0);
  const [imagesFail, setImagesFail] = useState(0);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);

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

  // 🔥 나노 바나나 합성 함수 - 기존 그대로 유지
  const composeSingleImageSafely = async (imageObj, style, compositingInfo, retryCount = 0, maxRetries = 2) => {
    if (!imageObj.isCompositingScene || !imageObj.compositingInfo) {
      console.log(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber}: 합성 대상이 아님`);
      return imageObj;
    }

    const overlayImageData = getOverlayImageData(compositingInfo, {
      hasProductImageData: !!compositingInfo.productImageData,
      hasBrandLogoData: !!compositingInfo.brandLogoData
    });
    
    if (!overlayImageData) {
      console.log(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber}: 오버레이 이미지 없음`);
      return imageObj;
    }

    try {
      console.log(`[composeSingleImageSafely] 🔥 Nano Banana 합성 시작: Scene ${imageObj.sceneNumber} (시도 ${retryCount + 1}/${maxRetries + 1})`);

      // Rate Limit 분산을 위한 딜레이
      const requestDelay = Math.random() * 3000 + 2000;
      await new Promise(resolve => setTimeout(resolve, requestDelay));

      // 🔥 실제 nanobanana-compose API 호출
      const response = await fetch(`${API_BASE}/api/nanobanana-compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseImageUrl: imageObj.url,
          overlayImageData: overlayImageData,
          compositingInfo: imageObj.compositingInfo,
          sceneNumber: imageObj.sceneNumber,
          conceptId: style.concept_id
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[composeSingleImageSafely] HTTP ${response.status}: ${errorText.substring(0, 100)}`);
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      }

      const result = await response.json();

      if (result.success && result.composedImageUrl) {
        console.log(`[composeSingleImageSafely] ✅ 합성 완료: Scene ${imageObj.sceneNumber} (${result.metadata?.method || 'unknown'})`);

        // 합성된 이미지로 교체
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
      console.error(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} 시도 ${retryCount + 1} 실패:`, error.message);

      // 재시도 로직 (429, 5xx 에러만)
      const retryableErrors = ['429', '500', '502', '503', '504', 'timeout'];
      const shouldRetry = retryableErrors.some(code => error.message.includes(code));

      if (retryCount < maxRetries && shouldRetry) {
        const retryDelay = (retryCount + 1) * 5000;
        console.log(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} ${retryDelay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return composeSingleImageSafely(imageObj, style, compositingInfo, retryCount + 1, maxRetries);
      } else {
        // 재시도 실패 - 원본 이미지 반환
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

  // 오버레이 이미지 데이터 추출 - 기존 그대로 유지
  const getOverlayImageData = (compositingInfo, flags) => {
    if (flags.hasProductImageData && compositingInfo.productImageData) {
      return compositingInfo.productImageData;
    }
    if (flags.hasBrandLogoData && compositingInfo.brandLogoData) {
      return compositingInfo.brandLogoData;
    }
    return null;
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

      // 🔥 제품/서비스에 따른 프롬프트 선택
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

      // 🔥 Step1 API 호출 (제품/서비스 분기) - 수정된 부분
      console.log('[Step2] STEP1 API 호출 시작:', {
        promptType: promptFiles.step1,
        videoPurpose: formData.videoPurpose,
        brandName: formData.brandName
      });

      // formData에서 필요한 필드만 추출 (file 객체 제외)
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
        } : null,
        promptType: promptFiles.step1 // step1_product 또는 step1_service
      };

      console.log('[Step2] API 페이로드:', apiPayload);

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
        const responseText = await step1Response.text();
        console.log('[Step2] STEP1 응답 수신:', responseText.length, 'chars');
        log('Step1 응답 수신 완료');
        
        if (!responseText.trim()) {
          throw new Error('서버에서 빈 응답을 받았습니다.');
        }

        initData = JSON.parse(responseText);
        console.log('[Step2] STEP1 파싱 성공:', initData);
      } catch (parseError) {
        console.error('[Step2] STEP1 JSON 파싱 실패:', parseError);
        log(`❌ JSON 파싱 실패: ${parseError.message}`);
        throw new Error('서버 응답 형식이 올바르지 않습니다. 서버 로그를 확인하세요.');
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

      // 🔥 Gemini Step1 응답 저장
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

      // STEP2: 상세 JSON 스토리보드 생성
      progressManager.startPhase('STEP2');
      log('2/4 STEP2: 상세 JSON 스토리보드 생성 시작');
      updateProgress('STEP2', 0.1);

      const step2ProgressInterval = setInterval(() => {
        const currentProgress = progressManager.phases.STEP2.current;
        if (currentProgress < 49) {
          updateProgress('STEP2', Math.min(0.9, (currentProgress - 25) / 25 + 0.1));
        }
      }, 1000);

      await new Promise(resolve => setTimeout(resolve, 3000));

      // 🔥 Step2는 이미 Step1에서 처리됨 (storyboard-init API에서 두 단계 다 처리)
      // 별도 Step2 API 호출 제거

      clearInterval(step2ProgressInterval);

      progressManager.completePhase('STEP2');
      setPercent(50);
      log('✅ STEP2 완료: 상세 JSON 스토리보드 생성 성공');

      // styles를 그대로 사용
      const finalStyles = styles;
      const finalCompositingInfo = compositingInfo;

      log(`📊 스토리보드 요약: ${finalStyles.length}개 컨셉, 스타일당 평균 ${finalStyles.length > 0 ? Math.round(finalStyles.reduce((sum, s) => sum + (s.imagePrompts?.length || 0), 0) / finalStyles.length) : 0}개 씬`);

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
                // 🔥 올바른 Seedream v4 imagePrompt 구조로 전송 - 여기만 수정!
                const promptToSend = p.prompt || p.image_prompt?.prompt || 'Professional commercial photo, 8K, high quality';
                
                console.log(`[Step2] 이미지 생성 요청: Style ${style.id}, Scene ${p.sceneNumber}`);
                console.log(`[Step2] 프롬프트: ${promptToSend.substring(0, 100)}...`);
                console.log(`[Step2] 영상 비율: ${formData.aspectRatioCode} → ${getAspectRatioCode(formData.aspectRatioCode)}`);

                const res = await fetch(`${API_BASE}/api/storyboard-render-image`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    // 🔥 수정: imagePrompt 객체로 올바르게 전송
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
                      // 🔥 합성 정보 추가
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

        await runSafeWorkerPool(imageTasks, 3, (completed, failed, total) => {
          const progress = (completed + failed) / total;
          updateProgress('IMAGES', progress);
          log(`이미지 생성: ${completed + failed}/${total} 완료`);
        });

        // 이미지 정렬 (씬 순서)
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
        
        if ((formData.productImage || formData.brandLogo) && totalCompositingScenes > 0) {
          progressManager.startPhase('COMPOSE');
          log('4/4 COMPOSE: Nano Banana 이미지 합성 시작');
          updateProgress('COMPOSE', 0.1);

          // 🔥 Base64를 ProductImageData/BrandLogoData로 변환
          if (formData.productImage?.url && !finalCompositingInfo.productImageData) {
            log('🔥 제품 이미지 Base64 → ProductImageData 변환');
            finalCompositingInfo.productImageData = {
              base64: formData.productImage.url,
              originalName: formData.productImage.name,
              size: formData.productImage.size
            };
          }

          if (formData.brandLogo?.url && !finalCompositingInfo.brandLogoData) {
            log('🔥 브랜드 로고 Base64 → BrandLogoData 변환');
            finalCompositingInfo.brandLogoData = {
              base64: formData.brandLogo.url,
              originalName: formData.brandLogo.name,
              size: formData.brandLogo.size
            };
          }

          // 디버깅 정보 출력
          if (finalCompositingInfo.productImageData) {
            const dataType = finalCompositingInfo.productImageData.url ? 'URL' : 'Base64';
            const dataSize = finalCompositingInfo.productImageData.url ? 
              finalCompositingInfo.productImageData.url.length : 
              JSON.stringify(finalCompositingInfo.productImageData).length;
            log(`제품이미지 데이터 확인: ${dataType}, 크기: ${Math.round(dataSize/1024)}KB`);
          }

          const compositionTasks = [];
          finalStyles.forEach((style) => {
            if (style.images && Array.isArray(style.images)) {
              style.images.forEach((img) => {
                if (img.isCompositingScene && img.compositingInfo) {
                  compositionTasks.push(async () => {
                    const composedImage = await composeSingleImageSafely(img, style, finalCompositingInfo);
                    // 합성 결과로 원본 이미지 교체
                    Object.assign(img, composedImage);
                    return {
                      success: true,
                      sceneNumber: img.sceneNumber
                    };
                  });
                }
              });
            };
          });

          if (compositionTasks.length > 0) {
            log(`🔥 총 ${compositionTasks.length}개 이미지 Nano Banana 합성 시작 (병렬 처리 + 개별 에러 격리)`);

            let composedCount = 0;
            let composeFailed = 0;

            await runSafeWorkerPool(compositionTasks, 2, (completed, failed, total) => {
              composedCount = completed;
              composeFailed = failed;
              const progress = (completed + failed) / total;
              updateProgress('COMPOSE', progress);
              log(`합성 진행: ${completed}/${total} 완료 (실패: ${failed})`);
            });

            log(`🎉 이미지 합성 완료: 성공 ${composedCount} / 실패 ${composeFailed} / 총 ${compositionTasks.length}`);
          } else {
            log(`⚠️ 합성 대상 이미지 없음 (감지된 합성 씬: ${totalCompositingScenes}개, 실제 이미지: ${finalStyles.reduce((sum, style) => sum + (style.images || []).length, 0)}개)`);
          }

          progressManager.completePhase('COMPOSE');
        } else {
          log('4/4 이미지 합성 스킵 (업로드된 이미지 없음)');
          progressManager.completePhase('COMPOSE');
        }

        setPercent(100);
        log(`전체 처리 완료: 성공 ${successImages} / 실패 ${failedImages} / 총 ${totalImages}`);
      } else {
        log('이미지 생성 건너뜀: styles 또는 perStyle=0');
        setPercent(100);
      }

      // 최종 스토리보드 구성
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

      console.log('[Step2] 최종 스토리보드:', finalStoryboard);
      setStoryboard?.(finalStoryboard);
      setIsLoading?.(false);

      const totalTime = Math.round((Date.now() - startTime) / 1000);
      log(`🎉 전체 프로세스 완료! (${totalTime}초 소요)`);

      if (successImages > 0) {
        setTimeout(() => {
          onNext?.();
        }, 2000);
      } else {
        log('성공 이미지 0 → 자동 이동 중단 (프롬프트/파싱 확인 필요)');
      }

    } catch (e) {
      console.error('[Step2] 전체 오류:', e);
      log(`❌ 전체 오류: ${e.message}`);
      setError(e.message);
      setIsLoading?.(false);
      setPercent(0);

      if (e.message.includes('연결할 수 없습니다')) {
        log('💡 해결방법: 관리자에게 서버 상태 확인을 요청하세요.');
      } else if (e.message.includes('타임아웃')) {
        log('💡 해결방법: 잠시 후 다시 시도하거나, 업로드한 이미지 크기를 줄여보세요.');
      } else if (e.message.includes('헤더가 너무 큽니다')) {
        log('💡 해결방법: 업로드한 이미지 파일 크기를 2MB 이하로 줄여주세요.');
      }
    }
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

        {debugInfo && (
          <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 rounded p-3 text-sm">
            스타일 수: {debugInfo.stylesCount} · 스타일당 장면 수: {debugInfo.perStyleScenes} · 전체 이미지: {debugInfo.expectedTotal}
            <br />
            진행(실시간): 성공 {imagesDone} · 실패 {imagesFail}
            {debugInfo.compositingEnabled && (
              <>
                <br />
                🔥 <strong>이미지 합성 활성화:</strong> 업로드된 이미지를 합성 대상 씬에 자동으로 합성합니다
              </>
            )}
          </div>
        )}

        {(formData.productImage || formData.brandLogo) && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded p-3">
            <h4 className="text-sm font-semibold text-green-800 mb-2">합성용 이미지 (Nano Banana로 자동 합성)</h4>
            <div className="flex gap-4">
              {formData.productImage && (
                <div className="text-center">
                  <img
                    src={formData.productImage.url}
                    alt="제품 이미지"
                    className="w-16 h-16 object-cover rounded border"
                  />
                  <p className="text-xs text-green-700 mt-1">제품 이미지</p>
                </div>
              )}
              {formData.brandLogo && (
                <div className="text-center">
                  <img
                    src={formData.brandLogo.url}
                    alt="브랜드 로고"
                    className="w-16 h-16 object-cover rounded border"
                  />
                  <p className="text-xs text-green-700 mt-1">브랜드 로고</p>
                </div>
              )}
            </div>
            <p className="text-xs text-green-600 mt-2">
              💡 프롬프트에서 지정한 [PRODUCT COMPOSITING SCENE] 위치에 자동으로 합성됩니다.
            </p>
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

          <button
            onClick={handleGenerateStoryboard}
            disabled={isBusy}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            {(formData.productImage || formData.brandLogo)
              ? '스토리보드 생성 + Nano Banana 이미지 합성 시작'
              : '스토리보드 생성 시작'
            }
          </button>
        </div>
      </div>
    </div>
  );
};

// 🔥 Seedream v4 해상도 매핑 함수들
function getWidthFromAspectRatio(aspectRatio) {
  const code = getAspectRatioCode(aspectRatio);
  const resolutions = {
    'widescreen_16_9': 1344,
    'vertical_9_16': 768,
    'square_1_1': 1024,
    'portrait_4_5': 1024
  };
  return resolutions[code] || 1344;
}

function getHeightFromAspectRatio(aspectRatio) {
  const code = getAspectRatioCode(aspectRatio);
  const resolutions = {
    'widescreen_16_9': 768,
    'vertical_9_16': 1344,
    'square_1_1': 1024,
    'portrait_4_5': 1280
  };
  return resolutions[code] || 768;
}

Step2.propTypes = {
  onNext: PropTypes.func,
  onPrev: PropTypes.func,
  formData: PropTypes.object,
  setStoryboard: PropTypes.func,
  setIsLoading: PropTypes.func,
  isLoading: PropTypes.bool,
};

export default Step2;

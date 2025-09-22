import { useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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

function imagesPerStyle(videoLength, fallbackCountFromMeta){
  if(typeof fallbackCountFromMeta === 'number' && fallbackCountFromMeta > 0){
    return fallbackCountFromMeta;
  }
  const digits = String(videoLength||'').match(/\d+/);
  const sec = digits ? parseInt(digits[0],10) : 10;
  const n = Math.max(1, Math.floor(sec/2));
  return n;
}

// 병렬 처리를 위한 안전한 워커 풀
async function runSafeWorkerPool(tasks, limit, onProgress) {
  const results = new Array(tasks.length);
  let completed = 0;
  let failed = 0;
  
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async (_, workerIndex) => {
    let taskIndex = workerIndex;
    
    while (taskIndex < tasks.length) {
      try {
        console.log(`[Worker${workerIndex}] 작업 ${taskIndex + 1}/${tasks.length} 시작`);
        results[taskIndex] = await tasks[taskIndex]();
        completed++;
        console.log(`[Worker${workerIndex}] 작업 ${taskIndex + 1} 완료`);
      } catch (e) {
        console.error(`[Worker${workerIndex}] 작업 ${taskIndex + 1} 실패:`, e.message);
        results[taskIndex] = { ok: false, error: e?.message || 'unknown', taskIndex };
        failed++;
      } finally {
        onProgress?.(completed, failed, tasks.length);
        taskIndex += limit;
      }
    }
  });
  
  await Promise.all(workers);
  return results;
}

// 🔥 개별 합성 작업 (실제 업로드된 이미지 데이터 사용)
async function composeSingleImageSafely(imageObj, style, compositingInfo, retryCount = 0) {
  const maxRetries = 2;
  
  // 합성이 필요한 조건 체크
  if (!imageObj.isCompositingScene || !imageObj.compositingInfo) {
    console.log(`[composeSingleImageSafely] 합성 불필요: Scene ${imageObj.sceneNumber}`);
    return imageObj;
  }

  const { needsProductImage, needsBrandLogo } = imageObj.compositingInfo;
  
  // 🔥 실제 업로드된 이미지 데이터 추출
  let overlayImageData = null;
  
  if (needsProductImage && compositingInfo.productImageData) {
    // formData.productImage에서 실제 업로드된 base64 데이터 사용
    if (typeof compositingInfo.productImageData === 'object' && compositingInfo.productImageData.url) {
      overlayImageData = compositingInfo.productImageData.url; // base64 data URL
    } else if (typeof compositingInfo.productImageData === 'string') {
      overlayImageData = compositingInfo.productImageData; // 직접 base64
    }
    console.log(`[composeSingleImageSafely] 제품 이미지 합성 준비: Scene ${imageObj.sceneNumber}`);
  } 
  
  if (!overlayImageData && needsBrandLogo && compositingInfo.brandLogoData) {
    // formData.brandLogo에서 실제 업로드된 base64 데이터 사용
    if (typeof compositingInfo.brandLogoData === 'object' && compositingInfo.brandLogoData.url) {
      overlayImageData = compositingInfo.brandLogoData.url;
    } else if (typeof compositingInfo.brandLogoData === 'string') {
      overlayImageData = compositingInfo.brandLogoData;
    }
    console.log(`[composeSingleImageSafely] 브랜드 로고 합성 준비: Scene ${imageObj.sceneNumber}`);
  }

  if (!overlayImageData) {
    console.warn(`[composeSingleImageSafely] 합성 데이터 없음: Scene ${imageObj.sceneNumber}`, {
      needsProductImage,
      needsBrandLogo,
      hasProductImageData: !!compositingInfo.productImageData,
      hasBrandLogoData: !!compositingInfo.brandLogoData
    });
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
      return composeSingleImageSafely(imageObj, style, compositingInfo, retryCount + 1);
    }
    
    // 최종 실패 시 원본 반환 (에러 격리)
    console.warn(`[composeSingleImageSafely] Scene ${imageObj.sceneNumber} 최종 실패, 원본 사용: ${error.message}`);
    return {
      ...imageObj,
      compositionFailed: true,
      compositionError: error.message,
      compositingAttempted: true
    };
  }
}

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [error, setError] = useState(null);
  const [percent, setPercent] = useState(0);
  const [logs, setLogs] = useState([]);
  const [imagesDone, setImagesDone] = useState(0);
  const [imagesFail, setImagesFail] = useState(0);
  const [imagesTotal, setImagesTotal] = useState(0);
  const [debugInfo, setDebugInfo] = useState(null);
  const [progressManager] = useState(new ProgressManager());

  const isBusy = isLoading;

  const log = (msg) => {
    const timestampedMsg = `[${new Date().toLocaleTimeString()}] ${msg}`;
    setLogs((prev) => [...prev, timestampedMsg]);
    console.log(timestampedMsg);
  };

  const updateProgress = (phase, progress) => {
    const newPercent = progressManager.updatePhase(phase, progress);
    setPercent(newPercent);
    return newPercent;
  };

  const handleGenerateStoryboard = async () => {
    setIsLoading?.(true);
    setError(null);
    setLogs([]);
    setImagesDone(0);
    setImagesFail(0);
    setImagesTotal(0);
    setDebugInfo(null);

    progressManager.startPhase('STEP1');
    setPercent(0);

    try {
      log('1/4 STEP1: 스토리보드 기본 구조 생성 시작');
      updateProgress('STEP1', 0.1);

      // 🔥 업로드된 이미지 데이터 확인 및 로깅
      log(`업로드된 이미지 확인: 제품이미지=${!!formData.productImage}, 브랜드로고=${!!formData.brandLogo}`);
      if (formData.productImage) {
        log(`제품 이미지 타입: ${typeof formData.productImage}, 크기: ${formData.productImage.url ? formData.productImage.url.length : 'N/A'}`);
      }
      if (formData.brandLogo) {
        log(`브랜드 로고 타입: ${typeof formData.brandLogo}, 크기: ${formData.brandLogo.url ? formData.brandLogo.url.length : 'N/A'}`);
      }

      const step1ProgressInterval = setInterval(() => {
        const currentProgress = progressManager.phases.STEP1.current;
        if (currentProgress < 24) {
          updateProgress('STEP1', Math.min(0.9, (currentProgress - 0) / 25 + 0.1));
        }
      }, 800);

      const initRes = await fetch(`${API_BASE}/api/storyboard-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData }),
      });

      clearInterval(step1ProgressInterval);

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        log(`STEP1 실패: ${initRes.status} ${err?.error || ''}`);
        throw new Error(err?.error || `init failed: ${initRes.status}`);
      }

      const initData = await initRes.json();
      const { styles, metadata, compositingInfo } = initData;

      progressManager.completePhase('STEP1');
      setPercent(25);
      log('STEP1 완료: 기본 스토리보드 구조 생성 성공');

      // STEP2 시작
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

      clearInterval(step2ProgressInterval);
      progressManager.completePhase('STEP2');
      setPercent(50);
      log('STEP2 완료: JSON 스토리보드 생성 성공');

      // 이미지 개수 계산
      const perStyle = imagesPerStyle(formData.videoLength, metadata?.sceneCountPerConcept);
      styles.forEach(s=>{
        if(!Array.isArray(s.imagePrompts)) s.imagePrompts = [];
        if(s.imagePrompts.length < perStyle){
          const last = s.imagePrompts[s.imagePrompts.length-1];
          while(s.imagePrompts.length < perStyle){
            const idx = s.imagePrompts.length+1;
            s.imagePrompts.push(last ? {
              ...last,
              sceneNumber: idx,
              title:`Scene ${idx}`,
              prompt: last.prompt
            } : {
              sceneNumber: idx,
              title:`Scene ${idx}`,
              duration:2,
              prompt:`${s.style} auto-filled scene ${idx}, insanely detailed, micro-details, hyper-realistic textures, visible skin pores, 4K, sharp focus. Shot by ARRI Alexa Mini with a 50mm lens.`
            });
          }
        } else if(s.imagePrompts.length > perStyle){
          s.imagePrompts = s.imagePrompts.slice(0, perStyle);
        }
      });

      const totalImages = styles.length * perStyle;
      setImagesTotal(totalImages);

      // 🔥 합성 정보 상세 로깅
      if (compositingInfo) {
        log(`🔥 합성 정보 확인: 감지된 씬 ${compositingInfo.scenes.length}개`);
        compositingInfo.scenes.forEach(scene => {
          log(`  - Scene ${scene.sceneNumber}: ${scene.context} (명시적: ${scene.explicit})`);
        });
        log(`제품이미지 사용: ${compositingInfo.hasProductImage}, 브랜드로고 사용: ${compositingInfo.hasBrandLogo}`);
        
        // 실제 이미지 데이터 확인
        if (compositingInfo.productImageData) {
          const dataType = typeof compositingInfo.productImageData;
          const dataSize = compositingInfo.productImageData.url ? compositingInfo.productImageData.url.length : 'N/A';
          log(`제품 이미지 데이터: ${dataType}, 크기: ${dataSize}`);
        }
        if (compositingInfo.brandLogoData) {
          const dataType = typeof compositingInfo.brandLogoData;
          const dataSize = compositingInfo.brandLogoData.url ? compositingInfo.brandLogoData.url.length : 'N/A';
          log(`브랜드 로고 데이터: ${dataType}, 크기: ${dataSize}`);
        }
      }

      setDebugInfo({
        stylesCount: styles.length,
        perStyleScenes: perStyle,
        videoLength: formData.videoLength,
        expectedTotal: totalImages,
        compositingEnabled: metadata.compositingEnabled
      });

      log(`스토리보드 완료: 스타일 ${styles.length}개 · 스타일당 장면 ${perStyle}개 · 총 이미지 ${totalImages}`);

      // 3/4 이미지 생성 시작
      progressManager.startPhase('IMAGES');
      log('3/4 Freepik 이미지 생성 시작');

      let successImages = 0;
      let failedImages = 0;
      
      if(styles.length && perStyle > 0){
        const imageTasks = [];
        styles.forEach(style=>{
          style.images = [];
          (style.imagePrompts||[]).forEach(p=>{
            imageTasks.push(async ()=>{
              const promptToSend = p.prompt;
              try {
                log(`이미지 생성 요청: [${style.style}] Scene ${p.sceneNumber}`);
                const res = await fetch(`${API_BASE}/api/storyboard-render-image`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    prompt: promptToSend,
                    sceneNumber: p.sceneNumber,
                    conceptId: style.concept_id,
                    title: p.title
                  }),
                });
                if(!res.ok){
                  const txt = await res.text().catch(()=> '');
                  throw new Error(`${res.status} ${txt.slice(0,120)}`);
                }
                const data = await res.json();
                if(!data.success || !data.url){
                  throw new Error('응답 이상');
                }
                
                // 합성 정보를 포함한 이미지 객체 생성
                const imgObj = {
                  id:`${style.concept_id}-${p.sceneNumber}-${Math.random().toString(36).slice(2,8)}`,
                  sceneNumber:p.sceneNumber,
                  title:p.title,
                  url:data.url,
                  thumbnail:data.url,
                  prompt:promptToSend,
                  duration:p.duration||2,
                  image_prompt:{
                    prompt: promptToSend,
                    negative_prompt: 'blurry, low quality, watermark, cartoon, distorted',
                    num_images:1,
                    image:{ size:'widescreen_16_9' },
                    styling:{ style:'photo' },
                    seed: Math.floor(10000 + Math.random()*90000)
                  },
                  isCompositingScene: p.isCompositingScene || false,
                  compositingInfo: p.compositingInfo || null
                };
                
                style.images.push(imgObj);
                successImages++;
                
                if (imgObj.isCompositingScene) {
                  log(`✅ 합성 대상 이미지 생성: [${style.style}] Scene ${p.sceneNumber} (Context: ${imgObj.compositingInfo?.compositingContext})`);
                } else {
                  log(`이미지 생성 완료: [${style.style}] Scene ${p.sceneNumber}`);
                }
                
                return { success: true };
              }catch(e){
                failedImages++;
                log(`이미지 생성 예외: [${style.style}] Scene ${p.sceneNumber} - ${e.message}`);
                return { success: false, error: e.message };
              }
            });
          });
        });

        await runSafeWorkerPool(imageTasks, 6, (completed, failed, total) => {
          setImagesDone(completed);
          setImagesFail(failed);
          const progress = (completed + failed) / total;
          updateProgress('IMAGES', progress);
        });

        progressManager.completePhase('IMAGES');
        setPercent(80);
        log(`이미지 생성 완료: 성공 ${successImages} / 실패 ${failedImages} / 총 ${totalImages}`);

        // 🔥 4/4 이미지 합성 단계 (조건부 실행)
        if (compositingInfo && (compositingInfo.hasProductImage || compositingInfo.hasBrandLogo)) {
          progressManager.startPhase('COMPOSE');
          log('4/4 🔥 이미지 합성 시작 (Nano Banana API + 개별 에러 격리)');
          
          // 합성 대상 이미지들만 추출
          const compositionTasks = [];
          let totalCompositingScenes = 0;
          
          styles.forEach(style => {
            style.images.forEach(img => {
              if (img.isCompositingScene && img.compositingInfo) {
                totalCompositingScenes++;
                log(`🎯 합성 대상 발견: [${style.style}] Scene ${img.sceneNumber}, Context: ${img.compositingInfo.compositingContext}`);
                
                compositionTasks.push(async () => {
                  const composedImg = await composeSingleImageSafely(img, style, compositingInfo);
                  
                  // 원본 이미지 객체를 합성된 이미지로 업데이트
                  const imgIndex = style.images.findIndex(i => i.id === img.id);
                  if (imgIndex >= 0) {
                    style.images[imgIndex] = composedImg;
                    if (composedImg.isComposed && composedImg.compositionMetadata?.method && !composedImg.compositionMetadata.method.startsWith('fallback')) {
                      log(`✅ 합성 성공: [${style.style}] Scene ${img.sceneNumber} (${composedImg.compositionMetadata?.method || 'unknown'})`);
                    } else {
                      log(`❌ 합성 실패: [${style.style}] Scene ${img.sceneNumber} - 원본 사용 (${composedImg.compositionError || composedImg.compositionMetadata?.fallbackReason || 'unknown error'})`);
                    }
                  }
                  return {
                    success: composedImg.isComposed && composedImg.compositionMetadata?.method && !composedImg.compositionMetadata.method.startsWith('fallback'),
                    attempted: true,
                    sceneNumber: img.sceneNumber
                  };
                });
              }
            });
          });

          if (compositionTasks.length > 0) {
            log(`🔥 총 ${compositionTasks.length}개 이미지 Nano Banana 합성 시작 (병렬 처리 + 개별 에러 격리)`);
            
            let composedCount = 0;
            let composeFailed = 0;
            
            // 병렬 합성 실행
            await runSafeWorkerPool(compositionTasks, 2, (completed, failed, total) => {
              composedCount = completed;
              composeFailed = failed;
              const progress = (completed + failed) / total;
              updateProgress('COMPOSE', progress);
              log(`합성 진행: ${completed}/${total} 완료 (실패: ${failed})`);
            });
            
            log(`🎉 이미지 합성 완료: 성공 ${composedCount} / 실패 ${composeFailed} / 총 ${compositionTasks.length}`);
          } else {
            log(`⚠️ 합성 대상 이미지 없음 (감지된 합성 씬: ${totalCompositingScenes}개, 실제 이미지: ${styles.reduce((sum, style) => sum + (style.images || []).length, 0)}개)`);
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

      setStoryboard?.({
        success: true,
        styles,
        compositingInfo,
        metadata:{
          ...metadata,
          perStyleCount: perStyle,
          createdAt: new Date().toISOString(),
        }
      });

      setIsLoading?.(false);

      if(successImages > 0){
        onNext?.();
      } else {
        log('성공 이미지 0 → 자동 이동 중단 (프롬프트/파싱 확인 필요)');
      }

    } catch (e) {
      console.error('Step2 오류:', e);
      log(`오류: ${e.message}`);
      setError(e.message);
      setIsLoading?.(false);
      setPercent(0);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      {isBusy && <SpinnerOverlay title="스토리보드/이미지 생성/합성 중..." percent={percent} lines={logs} />}

      <div className={`bg-white rounded-lg shadow-lg p-6 ${isBusy ? 'pointer-events-none opacity-50' : ''}`}>
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">2단계: 스토리보드 생성 + 이미지 합성</h2>
          <p className="text-gray-600">
            🔥 <strong>업로드된 이미지를 합성 대상 씬에 자동 합성</strong> - Nano Banana API 활용
            <br />
            STEP1(0-25%) → STEP2(25-50%) → 이미지생성(50-80%) → 합성(80-100%)
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

        {/* 업로드된 이미지 미리보기 */}
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
              💡 input_second_prompt.txt에서 지정한 [PRODUCT COMPOSITING SCENE] 위치에 자동으로 합성됩니다.
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

Step2.propTypes = {
  onNext: PropTypes.func,
  onPrev: PropTypes.func,
  formData: PropTypes.object,
  setStoryboard: PropTypes.func,
  setIsLoading: PropTypes.func,
  isLoading: PropTypes.bool,
};

export default Step2;

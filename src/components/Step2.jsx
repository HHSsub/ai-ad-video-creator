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

// 문자열 "10초", "10 s" 등 대응
function imagesPerStyle(videoLength, fallbackCountFromMeta){
  if(typeof fallbackCountFromMeta === 'number' && fallbackCountFromMeta > 0){
    return fallbackCountFromMeta;
  }
  const digits = String(videoLength||'').match(/\d+/);
  const sec = digits ? parseInt(digits[0],10) : 10;
  const n = Math.max(1, Math.floor(sec/2));
  return n;
}

async function runWithConcurrency(tasks, limit, onStep) {
  let i = 0;
  let done = 0;
  const results = new Array(tasks.length);
  const workers = new Array(Math.min(limit, tasks.length)).fill(0).map(async () => {
    while (true) {
      const cur = i++;
      if (cur >= tasks.length) break;
      try {
        results[cur] = await tasks[cur]();
      } catch (e) {
        results[cur] = { ok: false, error: e?.message || 'unknown' };
      } finally {
        done++;
        onStep?.(done, tasks.length);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// 🔥 NEW: 이미지 합성 함수
async function composeImageIfNeeded(imageObj, style, compositingInfo) {
  // 합성이 필요한 조건 체크
  if (!imageObj.isCompositingScene || !imageObj.compositingInfo) {
    return imageObj; // 합성 불필요
  }

  const { needsProductImage, needsBrandLogo } = imageObj.compositingInfo;
  
  // 합성할 이미지 데이터 결정
  let overlayImageData = null;
  if (needsProductImage && compositingInfo.productImageData) {
    overlayImageData = compositingInfo.productImageData.url || compositingInfo.productImageData;
  } else if (needsBrandLogo && compositingInfo.brandLogoData) {
    overlayImageData = compositingInfo.brandLogoData.url || compositingInfo.brandLogoData;
  }

  if (!overlayImageData) {
    console.log(`[composeImageIfNeeded] 합성 데이터 없음: Scene ${imageObj.sceneNumber}`);
    return imageObj; // 합성 데이터 없음
  }

  try {
    console.log(`[composeImageIfNeeded] 합성 시작: Scene ${imageObj.sceneNumber}`);
    
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
      console.error(`[composeImageIfNeeded] 합성 실패: ${response.status} ${errorText}`);
      return imageObj; // 실패 시 원본 반환
    }

    const result = await response.json();
    
    if (result.success && result.composedImageUrl) {
      console.log(`[composeImageIfNeeded] 합성 완료: Scene ${imageObj.sceneNumber}`);
      
      // 합성된 이미지로 교체
      return {
        ...imageObj,
        url: result.composedImageUrl,
        thumbnail: result.composedImageUrl,
        isComposed: true,
        compositionMetadata: result.metadata,
        originalUrl: imageObj.url // 원본 URL 보존
      };
    } else {
      console.warn(`[composeImageIfNeeded] 합성 결과 이상: Scene ${imageObj.sceneNumber}`);
      return imageObj; // 실패 시 원본 반환
    }

  } catch (error) {
    console.error(`[composeImageIfNeeded] 합성 예외: Scene ${imageObj.sceneNumber}`, error);
    return imageObj; // 예외 시 원본 반환
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

  const isBusy = isLoading;

  const log = (msg) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleGenerateStoryboard = async () => {
    setIsLoading?.(true);
    setError(null);
    setLogs([]);
    setPercent(0);
    setImagesDone(0);
    setImagesFail(0);
    setImagesTotal(0);
    setDebugInfo(null);

    try {
      log('1/3 스토리보드(2-STEP 체인) 요청 시작');
      setPercent(5);

      const initRes = await fetch(`${API_BASE}/api/storyboard-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData }),
      });

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        log(`스토리보드 실패: ${initRes.status} ${err?.error || ''}`);
        throw new Error(err?.error || `init failed: ${initRes.status}`);
      }

      const initData = await initRes.json();
      const { styles, metadata, compositingInfo } = initData; // 🔥 NEW: compositingInfo 추가

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

      // 🔥 NEW: 합성 정보 로깅
      if (compositingInfo) {
        log(`합성 정보: 씬 ${compositingInfo.scenes.length}개, 제품이미지=${compositingInfo.hasProductImage}, 로고=${compositingInfo.hasBrandLogo}`);
      }

      setDebugInfo({
        stylesCount: styles.length,
        perStyleScenes: perStyle,
        videoLength: formData.videoLength,
        expectedTotal: totalImages,
        compositingEnabled: metadata.compositingEnabled // 🔥 NEW
      });

      log(`스토리보드 완료: 스타일 ${styles.length}개 · 스타일당 장면 ${perStyle}개 · 총 이미지 ${totalImages}`);
      setPercent(15);

      let successImages=0;
      if(styles.length && perStyle>0){
        log('2/3 Freepik 이미지 생성 시작');

        const tasks = [];
        styles.forEach(style=>{
          style.images = []; // 초기화
          (style.imagePrompts||[]).forEach(p=>{
            tasks.push(async ()=>{
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
                  setImagesFail(f=>f+1);
                  log(`이미지 생성 실패: [${style.style}] Scene ${p.sceneNumber} - ${res.status} ${txt.slice(0,120)}`);
                  return;
                }
                const data = await res.json();
                if(!data.success || !data.url){
                  setImagesFail(f=>f+1);
                  log(`이미지 생성 응답 이상: [${style.style}] Scene ${p.sceneNumber}`);
                  return;
                }
                
                // 🔥 NEW: 합성 정보를 포함한 이미지 객체 생성
                const imgObj = {
                  id:`${style.concept_id}-${p.sceneNumber}-${Math.random().toString(36).slice(2,8)}`,
                  sceneNumber:p.sceneNumber,
                  title:p.title,
                  url:data.url,
                  thumbnail:data.url,
                  prompt:promptToSend,
                  duration:p.duration||2,
                  // image_prompt 객체 저장 (Step3 재사용 대비)
                  image_prompt:{
                    prompt: promptToSend,
                    negative_prompt: 'blurry, low quality, watermark, cartoon, distorted',
                    num_images:1,
                    image:{ size:'widescreen_16_9' },
                    styling:{ style:'photo' },
                    seed: Math.floor(10000 + Math.random()*90000)
                  },
                  // 🔥 NEW: 합성 관련 정보 추가
                  isCompositingScene: p.isCompositingScene || false,
                  compositingInfo: p.compositingInfo || null
                };
                
                style.images.push(imgObj);
                setImagesDone(d=>d+1);
                successImages++;
                log(`이미지 생성 완료: [${style.style}] Scene ${p.sceneNumber}${imgObj.isCompositingScene ? ' (합성 대상)' : ''}`);
              }catch(e){
                setImagesFail(f=>f+1);
                log(`이미지 생성 예외: [${style.style}] Scene ${p.sceneNumber} - ${e.message}`);
              }finally{
                const doneCountRef = successImages + imagesFail;
                setPercent(cur=>{
                  const base = 15 + Math.round(((doneCountRef)/(totalImages))*60); // 15~75%
                  return base>75?75:base;
                });
              }
            });
          });
        });

        await runWithConcurrency(tasks, 8, ()=>{});
        setPercent(75);
        log(`이미지 생성 완료: 성공 ${imagesDone + successImages} / 실패 ${imagesFail} / 총 ${totalImages}`);

        // 🔥 NEW: 3/3 이미지 합성 단계 (조건부 실행)
        if (compositingInfo && (compositingInfo.hasProductImage || compositingInfo.hasBrandLogo)) {
          log('3/3 이미지 합성 시작 (Nano Banana)');
          
          let compositionTasks = [];
          styles.forEach(style => {
            style.images.forEach(img => {
              if (img.isCompositingScene && img.compositingInfo) {
                compositionTasks.push(async () => {
                  try {
                    log(`합성 요청: [${style.style}] Scene ${img.sceneNumber}`);
                    const composedImg = await composeImageIfNeeded(img, style, compositingInfo);
                    
                    // 원본 이미지 객체를 합성된 이미지로 업데이트
                    const imgIndex = style.images.findIndex(i => i.id === img.id);
                    if (imgIndex >= 0) {
                      style.images[imgIndex] = composedImg;
                      if (composedImg.isComposed) {
                        log(`합성 완료: [${style.style}] Scene ${img.sceneNumber}`);
                      } else {
                        log(`합성 스킵: [${style.style}] Scene ${img.sceneNumber}`);
                      }
                    }
                  } catch (e) {
                    log(`합성 오류: [${style.style}] Scene ${img.sceneNumber} - ${e.message}`);
                  }
                });
              }
            });
          });

          if (compositionTasks.length > 0) {
            log(`총 ${compositionTasks.length}개 이미지 합성 시작`);
            let composedCount = 0;
            
            await runWithConcurrency(compositionTasks, 4, (done, total) => {
              composedCount = done;
              const compositionPercent = 75 + Math.round((done / total) * 25); // 75~100%
              setPercent(compositionPercent);
            });
            
            log(`이미지 합성 완료: ${composedCount}/${compositionTasks.length}`);
          } else {
            log('합성 대상 이미지 없음');
          }
        } else {
          log('3/3 이미지 합성 스킵 (합성 데이터 없음)');
        }
        
        setPercent(100);
        log(`전체 처리 완료: 성공 ${imagesDone + successImages} / 실패 ${imagesFail} / 총 ${totalImages}`);
      } else {
        log('이미지 생성 건너뜀: styles 또는 perStyle=0');
        setPercent(100);
      }

      setStoryboard?.({
        success: true,
        styles,
        // 🔥 NEW: 합성 정보도 스토리보드에 포함
        compositingInfo,
        metadata:{
          ...metadata,
          perStyleCount: perStyle,
          createdAt: new Date().toISOString(),
        }
      });

      setIsLoading?.(false);

      if(successImages>0){
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
            input_second_prompt.txt → final_prompt.txt 두 번만 Gemini 호출. 
            장면 수 = (영상길이 ÷ 2초). 6개 컨셉 × 장면 수 = 전체 이미지.
            <br />
            🔥 <strong>NEW:</strong> PRODUCT COMPOSITING SCENE 자동 감지 → Nano Banana 이미지 합성
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
                🔥 <strong>이미지 합성 활성화:</strong> 제품/로고 이미지가 자동으로 합성됩니다.
              </>
            )}
          </div>
        )}

        {/* 🔥 NEW: 업로드된 이미지 미리보기 */}
        {(formData.productImage || formData.brandLogo) && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded p-3">
            <h4 className="text-sm font-semibold text-green-800 mb-2">합성용 이미지</h4>
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
              ? '스토리보드 생성 + 이미지 합성 시작' 
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

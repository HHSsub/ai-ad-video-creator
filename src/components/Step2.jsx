// src/components/Step2.jsx - 이미지 렌더링 로직 완벽 수정
import { useState } from 'react';
import PropTypes from 'prop-types';
import SpinnerOverlay from './ui/SpinnerOverlay';
import { progressManager } from '../utils/progressManager';
import { getUnifiedImageData } from '../utils/imageHelpers';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading, user }) => {
  const [logs, setLogs] = useState([]);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [styles, setStyles] = useState(null);
  const [imagesDone, setImagesDone] = useState(0);
  const [imagesFail, setImagesFail] = useState(0);
  const [debugInfo, setDebugInfo] = useState(null);

  const log = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMsg = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev, logMsg]);
    console.log(logMsg);
  };

  const updateProgress = (phase, progress) => {
    const totalProgress = progressManager.getTotalProgress();
    setPercent(Math.min(100, Math.round(totalProgress * 100)));
  };

  const handleGenerateStoryboard = async () => {
    try {
      setError(null);
      setIsBusy(true);
      setIsLoading?.(true);
      setLogs([]);
      setPercent(0);
      setImagesDone(0);
      setImagesFail(0);

      progressManager.reset();
      progressManager.startPhase('STEP1');
      
      log('🚀 스토리보드 생성을 시작합니다...');
      updateProgress('STEP1', 0.1);

      const step1ProgressInterval = setInterval(() => {
        const currentProgress = progressManager.getPhaseProgress('STEP1');
        if (currentProgress < 0.9) {
          updateProgress('STEP1', Math.min(0.9, currentProgress + 0.1));
        }
      }, 2000);

      const timeoutDuration = 180000;
      const timeoutId = setTimeout(() => {
        clearInterval(step1ProgressInterval);
        throw new Error('서버 응답 시간이 초과되었습니다. 다시 시도해주세요.');
      }, timeoutDuration);

      log('📡 서버에 스토리보드 생성 요청 중...');
      
      const step1Response = await fetch(`${API_BASE}/api/storyboard-init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify(formData),
      });

      if (!step1Response) {
        clearTimeout(timeoutId);
        clearInterval(step1ProgressInterval);
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
          imagePromptsLength: styles[0]?.imagePrompts?.length,
          firstImage: styles[0]?.images?.[0]
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

      log(`📊 [DEBUG] 이미지 생성 정보: ${finalStyles.length}개 컨셉 × ${perStyle}개 씬 = ${totalImages}개 이미지`);

      if (totalImages > 0) {
        progressManager.startPhase('RENDER');
        log(`📸 이미지 생성 중... (총 ${totalImages}개)`);

        let successImages = 0;
        let failedImages = 0;

        for (let styleIdx = 0; styleIdx < finalStyles.length; styleIdx++) {
          const style = finalStyles[styleIdx];
          
          const images = style.images || [];

          log(`🎨 [컨셉 ${styleIdx + 1}/${finalStyles.length}: ${style.concept_title}] ${images.length}개 씬 처리 시작`);

          if (images.length === 0) {
            log(`⚠️ [컨셉 ${styleIdx + 1}] images 배열이 비어있습니다!`);
            console.error('❌ [DEBUG] style 구조:', style);
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

              console.log(`📤 [DEBUG] 이미지 렌더링 요청:`, {
                sceneNumber: img.sceneNumber,
                conceptId: styleIdx + 1,
                promptPreview: imagePromptPayload.prompt.substring(0, 50) + '...'
              });

              const renderResponse = await fetch(`${API_BASE}/api/storyboard-render-image`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-username': user?.username || 'anonymous'
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
                console.log(`📥 [DEBUG] 이미지 렌더링 응답:`, result);
                
                if (result.success && result.url) {
                  img.url = result.url;
                  img.status = 'completed';
                  successImages++;
                  setImagesDone(successImages);
                  log(`✅ [컨셉 ${styleIdx + 1}] 씬 ${img.sceneNumber} 이미지 생성 성공`);
                } else {
                  img.status = 'failed';
                  failedImages++;
                  setImagesFail(failedImages);
                  log(`❌ [컨셉 ${styleIdx + 1}] 씬 ${img.sceneNumber} 이미지 생성 실패: ${result.error || '알 수 없는 오류'}`);
                }
              } else {
                const errorText = await renderResponse.text();
                console.error(`❌ [DEBUG] HTTP 오류:`, errorText);
                img.status = 'failed';
                failedImages++;
                setImagesFail(failedImages);
                log(`❌ [컨셉 ${styleIdx + 1}] 씬 ${img.sceneNumber} HTTP ${renderResponse.status} 오류`);
              }

            } catch (imgError) {
              console.error(`❌ [DEBUG] 이미지 생성 예외:`, imgError);
              img.status = 'error';
              failedImages++;
              setImagesFail(failedImages);
              log(`❌ [컨셉 ${styleIdx + 1}] 씬 ${img.sceneNumber} 예외 발생: ${imgError.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        progressManager.completePhase('RENDER');
        updateProgress('RENDER', 1.0);
        log(`✅ 이미지 생성 완료: ${successImages}개 성공, ${failedImages}개 실패`);
      } else {
        log('⚠️ 생성할 이미지가 없습니다');
      }

      const finalStoryboard = {
        styles: finalStyles,
        compositingInfo: finalCompositingInfo,
        metadata: {
          ...metadata,
          totalImages,
          successImages: successImages || 0,
          failedImages: failedImages || 0,
          imageGenerationCompleted: true
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

    } catch (e) {
      console.error('❌ [DEBUG] 전체 오류:', e);
      setError(e.message);
      setIsLoading?.(false);
      setPercent(0);
      log(`❌ 오류 발생: ${e.message}`);
    } finally {
      setIsBusy(false);
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

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading, user }) => {
  const [logs, setLogs] = useState([]);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [styles, setStyles] = useState(null);
  const [imagesDone, setImagesDone] = useState(0);
  const [imagesFail, setImagesFail] = useState(0);
  const [debugInfo, setDebugInfo] = useState(null);

  const log = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMsg = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev, logMsg]);
    console.log(logMsg);
  };

  const updateProgress = (phase, progress) => {
    const totalProgress = progressManager.getTotalProgress();
    setPercent(Math.min(100, Math.round(totalProgress * 100)));
  };

  const handleGenerateStoryboard = async () => {
    try {
      setError(null);
      setIsBusy(true);
      setIsLoading?.(true);
      setLogs([]);
      setPercent(0);
      setImagesDone(0);
      setImagesFail(0);

      progressManager.reset();
      progressManager.startPhase('STEP1');
      
      log('🚀 스토리보드 생성을 시작합니다...');
      updateProgress('STEP1', 0.1);

      const step1ProgressInterval = setInterval(() => {
        const currentProgress = progressManager.getPhaseProgress('STEP1');
        if (currentProgress < 0.9) {
          updateProgress('STEP1', Math.min(0.9, currentProgress + 0.1));
        }
      }, 2000);

      const timeoutDuration = 180000;
      const timeoutId = setTimeout(() => {
        clearInterval(step1ProgressInterval);
        throw new Error('서버 응답 시간이 초과되었습니다. 다시 시도해주세요.');
      }, timeoutDuration);

      log('📡 서버에 스토리보드 생성 요청 중...');
      
      const step1Response = await fetch(`${API_BASE}/api/storyboard-init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify(formData),
      });

      if (!step1Response) {
        clearTimeout(timeoutId);
        clearInterval(step1ProgressInterval);
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

      // 🔥🔥🔥 디버그 정보 출력
      console.log('📊 [DEBUG] initData 구조:', {
        stylesCount: styles.length,
        firstStyle: {
          concept_id: styles[0]?.concept_id,
          imagesLength: styles[0]?.images?.length,
          imagePromptsLength: styles[0]?.imagePrompts?.length,
          firstImage: styles[0]?.images?.[0]
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

      // 🔥🔥🔥 핵심 수정: images 배열 검증 및 사용
      const perStyle = finalStyles.length > 0 && finalStyles[0].images?.length > 0 ? 
        finalStyles[0].images.length : 0;
      const totalImages = finalStyles.length * perStyle;

      log(`📊 [DEBUG] 이미지 생성 정보: ${finalStyles.length}개 컨셉 × ${perStyle}개 씬 = ${totalImages}개 이미지`);

      if (totalImages > 0) {
        progressManager.startPhase('RENDER');
        log(`📸 이미지 생성 중... (총 ${totalImages}개)`);

        let successImages = 0;
        let failedImages = 0;

        for (let styleIdx = 0; styleIdx < finalStyles.length; styleIdx++) {
          const style = finalStyles[styleIdx];
          
          // 🔥🔥🔥 핵심 수정: images 배열 사용 (이제 제대로 초기화되어 있음)
          const images = style.images || [];

          log(`🎨 [컨셉 ${styleIdx + 1}/${finalStyles.length}: ${style.concept_title}] ${images.length}개 씬 처리 시작`);

          if (images.length === 0) {
            log(`⚠️ [컨셉 ${styleIdx + 1}] images 배열이 비어있습니다!`);
            console.error('❌ [DEBUG] style 구조:', style);
            continue;
          }

          for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
            const img = images[imgIdx];
            
            try {
              log(`🎨 [컨셉 ${styleIdx + 1}] 씬 ${img.sceneNumber} 이미지 생성 중...`);

              // 🔥🔥🔥 중요: imagePrompt 구조 정규화
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

              console.log(`📤 [DEBUG] 이미지 렌더링 요청:`, {
                sceneNumber: img.sceneNumber,
                conceptId: styleIdx + 1,
                promptPreview: imagePromptPayload.prompt.substring(0, 50) + '...'
              });

              const renderResponse = await fetch(`${API_BASE}/api/storyboard-render-image`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-username': user?.username || 'anonymous'
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
                console.log(`📥 [DEBUG] 이미지 렌더링 응답:`, result);
                
                if (result.success && result.url) {
                  img.url = result.url;
                  img.status = 'completed';
                  successImages++;
                  setImagesDone(successImages);
                  log(`✅ [컨셉 ${styleIdx + 1}] 씬 ${img.sceneNumber} 이미지 생성 성공`);
                } else {
                  img.status = 'failed';
                  failedImages++;
                  setImagesFail(failedImages);
                  log(`❌ [컨셉 ${styleIdx + 1}] 씬 ${img.sceneNumber} 이미지 생성 실패: ${result.error || '알 수 없는 오류'}`);
                }
              } else {
                const errorText = await renderResponse.text();
                console.error(`❌ [DEBUG] HTTP 오류:`, errorText);
                img.status = 'failed';
                failedImages++;
                setImagesFail(failedImages);
                log(`❌ [컨셉 ${styleIdx + 1}] 씬 ${img.sceneNumber} HTTP ${renderResponse.status} 오류`);
              }

            } catch (imgError) {
              console.error(`❌ [DEBUG] 이미지 생성 예외:`, imgError);
              img.status = 'error';
              failedImages++;
              setImagesFail(failedImages);
              log(`❌ [컨셉 ${styleIdx + 1}] 씬 ${img.sceneNumber} 예외 발생: ${imgError.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        progressManager.completePhase('RENDER');
        updateProgress('RENDER', 1.0);
        log(`✅ 이미지 생성 완료: ${successImages}개 성공, ${failedImages}개 실패`);
      } else {
        log('⚠️ 생성할 이미지가 없습니다');
      }

      const finalStoryboard = {
        styles: finalStyles,
        compositingInfo: finalCompositingInfo,
        metadata: {
          ...metadata,
          totalImages,
          successImages: successImages || 0,
          failedImages: failedImages || 0,
          imageGenerationCompleted: true
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

    } catch (e) {
      console.error('❌ [DEBUG] 전체 오류:', e);
      setError(e.message);
      setIsLoading?.(false);
      setPercent(0);
      log(`❌ 오류 발생: ${e.message}`);
    } finally {
      setIsBusy(false);
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

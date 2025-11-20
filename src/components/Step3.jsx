// src/components/Step3.jsx 전체코드
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const Step3 = ({
  storyboard,
  selectedConceptId,
  setSelectedConceptId,
  onPrev,
  onNext,
  isLoading,
  setIsLoading
}) => {
  const styles = storyboard?.styles || [];
  const [logs, setLogs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [polling, setPolling] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState(null);
  const [taskRetries, setTaskRetries] = useState(new Map());

  const selected = styles.find(s => s.concept_id === selectedConceptId) || null;
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5000;
  const MAX_TOTAL_TIME = 600000;

  const log = (m) => {
    const timestampedMsg = `[${new Date().toLocaleTimeString()}] ${m}`;
    setLogs(prev => [...prev, timestampedMsg]);
    console.log(timestampedMsg);
  };

  const createVideoTask = async (img, retryCount = 0) => {
    const maxRetries = MAX_RETRIES;
    
    try {
      const videoPrompt = img.motion_prompt || img.prompt || img.image_prompt?.prompt;
      if (!videoPrompt) {
        log(`❌ Scene ${img.sceneNumber}: 프롬프트 없음 - 정적 이미지로 대체`);
        return {
          success: false,
          useStaticImage: true,
          sceneNumber: img.sceneNumber,
          error: 'No video prompt available'
        };
      }

      log(`🎬 Scene ${img.sceneNumber} 영상을 생성하고 있습니다${retryCount > 0 ? ` (재시도 ${retryCount}/${maxRetries})` : ''}...`);
      
      const response = await fetch(`${API_BASE}/api/image-to-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: img.url,
          prompt: videoPrompt,
          duration: img.duration || 6,
          sceneNumber: img.sceneNumber,
          conceptId: selected.concept_id,
          title: img.title,
          formData: storyboard?.metadata ? {
            brandName: storyboard.metadata.brandName,
            productServiceName: storyboard.metadata.productServiceName,
            productServiceCategory: storyboard.metadata.productServiceCategory,
            videoPurpose: storyboard.metadata.videoPurpose,
            videoAspectRatio: storyboard.metadata.aspectRatio || '16:9',
            coreTarget: storyboard.metadata.coreTarget,
            coreDifferentiation: storyboard.metadata.coreDifferentiation,
            brandLogo: storyboard.metadata.brandLogoProvided,
            productImage: storyboard.metadata.productImageProvided
          } : {}
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const errorMsg = `HTTP ${response.status}: ${errorText.slice(0, 100)}`;
        
        const retryableErrors = [429, 500, 502, 503, 504];
        const isRetryable = retryableErrors.includes(response.status) || 
                           errorText.toLowerCase().includes('timeout') ||
                           errorText.toLowerCase().includes('overload');
        
        if (isRetryable && retryCount < maxRetries) {
          log(`⚠️ Scene ${img.sceneNumber}: 잠시 후 다시 시도합니다`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return createVideoTask(img, retryCount + 1);
        } else {
          log(`❌ Scene ${img.sceneNumber}: 정적 이미지로 대체됩니다`);
          return {
            success: false,
            useStaticImage: true,
            sceneNumber: img.sceneNumber,
            error: errorMsg
          };
        }
      }

      const result = await response.json();
      if (result.success && result.task?.taskId) {
        log(`✅ Scene ${img.sceneNumber}: 영상 생성 작업 시작`);
        return {
          success: true,
          taskId: result.task.taskId,
          sceneNumber: img.sceneNumber,
          duration: img.duration || 2,
          title: img.title
        };
      } else {
        if (retryCount < maxRetries) {
          log(`⚠️ Scene ${img.sceneNumber}: 응답 오류 - 재시도 중`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return createVideoTask(img, retryCount + 1);
        } else {
          log(`❌ Scene ${img.sceneNumber}: 생성 실패 - 정적 이미지로 대체`);
          return {
            success: false,
            useStaticImage: true,
            sceneNumber: img.sceneNumber,
            error: 'Invalid task response'
          };
        }
      }
    } catch (error) {
      const errorMsg = error.message || 'Unknown error';
      
      if (retryCount < maxRetries) {
        log(`⚠️ Scene ${img.sceneNumber}: ${errorMsg} - 재시도 중`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return createVideoTask(img, retryCount + 1);
      } else {
        log(`❌ Scene ${img.sceneNumber}: ${errorMsg} - 정적 이미지로 대체`);
        return {
          success: false,
          useStaticImage: true,
          sceneNumber: img.sceneNumber,
          error: errorMsg
        };
      }
    }
  };

  const startGeneration = async () => {
    if (!selected) {
      setError('먼저 컨셉을 선택해주세요');
      return;
    }
    if (isLoading) return;
    if (!Array.isArray(selected.images) || selected.images.length === 0) {
      setError('선택된 컨셉에 생성된 이미지가 없습니다');
      return;
    }

    setError(null);
    setIsLoading(true);
    setPercent(0);
    setTasks([]);
    setPolling(false);
    setTaskRetries(new Map());
    
    const startTime = Date.now();
    log(`🚀 영상 클립 생성을 시작합니다: ${selected.style || selected.conceptName}`);

    try {
      const sortedImages = [...selected.images].sort((a, b) => a.sceneNumber - b.sceneNumber);
      log(`📋 총 ${sortedImages.length}개 씬 처리 예정`);

      const newTasks = [];
      let successfulTasks = 0;
      let staticImageCount = 0;

      for (let i = 0; i < sortedImages.length; i++) {
        const img = sortedImages[i];
        
        try {
          const taskResult = await createVideoTask(img);
          
          if (taskResult.success) {
            newTasks.push(taskResult);
            successfulTasks++;
          } else if (taskResult.useStaticImage) {
            const targetImg = selected.images.find(si => si.sceneNumber === img.sceneNumber);
            if (targetImg) {
              targetImg.videoUrl = targetImg.url;
              targetImg.isStaticVideo = true;
              targetImg.failureReason = taskResult.error;
              log(`📷 Scene ${img.sceneNumber}: 정적 이미지로 설정 완료`);
            }
            staticImageCount++;
          }
          
          const progress = Math.round(((i + 1) / sortedImages.length) * 50);
          setPercent(progress);
          
        } catch (error) {
          log(`❌ Scene ${img.sceneNumber}: 예외 발생 - ${error.message}`);
        }

        if (i < sortedImages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (successfulTasks === 0 && staticImageCount === 0) {
        throw new Error('모든 영상 클립 생성에 실패했습니다');
      }

      setTasks(newTasks);
      
      if (newTasks.length > 0) {
        setPolling(true);
        log(`📊 ${newTasks.length}개 작업 진행 중 (정적: ${staticImageCount}개)`);
        setPercent(50);
      } else {
        log(`📊 모든 씬이 정적 이미지로 처리됨 (${staticImageCount}개)`);
        setIsLoading(false);
        setPercent(100);
      }

    } catch (e) {
      const processingTime = Date.now() - startTime;
      setError(e.message);
      setIsLoading(false);
      log(`❌ 생성 실패 (${processingTime}ms): ${e.message}`);
    }
  };

  useEffect(() => {
    if (!polling || tasks.length === 0) return;
    
    let cancelled = false;
    let startTime = Date.now();
    let pollCount = 0;
    const maxPollTime = MAX_TOTAL_TIME;
    const pollInterval = 5000;

    const poll = async () => {
      if (cancelled) return;
      
      pollCount++;
      const elapsedTime = Date.now() - startTime;
      
      if (elapsedTime > maxPollTime) {
        log(`⏰ 최대 처리 시간 초과 (${Math.round(maxPollTime/1000)}초) - 미완료 씬을 정적 이미지로 처리`);
        
        const unfinished = tasks.filter(t => {
          const img = selected?.images?.find(im => im.sceneNumber === t.sceneNumber);
          return !(img && img.videoUrl);
        });
        
        unfinished.forEach(task => {
          const img = selected?.images?.find(im => im.sceneNumber === task.sceneNumber);
          if (img && !img.videoUrl) {
            img.videoUrl = img.url;
            img.isStaticVideo = true;
            img.failureReason = 'Video generation timeout - exceeded maximum wait time';
            log(`⏰ Scene ${img.sceneNumber}: 타임아웃 - 정적 이미지로 대체`);
          }
        });
        
        setPolling(false);
        setIsLoading(false);
        setPercent(100);
        return;
      }

      try {
        const unfinished = tasks.filter(t => {
          const img = selected?.images?.find(im => im.sceneNumber === t.sceneNumber);
          return !(img && img.videoUrl && !img.isStaticVideo);
        });

        if (unfinished.length === 0) {
          log('🎉 모든 영상 클립 생성 완료!');
          setPolling(false);
          setIsLoading(false);
          setPercent(100);
          return;
        }

        log(`📊 진행 중: ${unfinished.length}개 대기 (${Math.round(elapsedTime/1000)}초 경과)`);

        const response = await fetch(`${API_BASE}/api/video-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tasks: unfinished.map(u => ({
              taskId: u.taskId,
              sceneNumber: u.sceneNumber,
              duration: u.duration,
              title: u.title
            }))
          })
        });

        if (!response.ok) {
          log(`⚠️ 상태 확인 실패: HTTP ${response.status}`);
          return;
        }

        const result = await response.json();
        if (!result.success) {
          log(`⚠️ 상태 확인 오류: ${result.error}`);
          return;
        }

        let newCompletions = 0;
        for (const seg of (result.segments || [])) {
          if (seg.status === 'completed' && seg.videoUrl) {
            const target = selected.images.find(img => img.sceneNumber === seg.sceneNumber);
            if (target && !target.videoUrl) {
              target.videoUrl = seg.videoUrl;
              target.isStaticVideo = false;
              newCompletions++;
              log(`✅ Scene ${seg.sceneNumber}: 영상 클립 완료`);
            }
          } else if (seg.status === 'failed') {
            const target = selected.images.find(img => img.sceneNumber === seg.sceneNumber);
            if (target && !target.videoUrl) {
              target.videoUrl = target.url;
              target.isStaticVideo = true;
              target.failureReason = seg.error || 'Video generation failed';
              log(`❌ Scene ${seg.sceneNumber}: 실패 - 정적 이미지로 대체`);
            }
          }
        }

        const completedTasks = tasks.filter(t => {
          const img = selected.images.find(i => i.sceneNumber === t.sceneNumber);
          return !!img?.videoUrl;
        }).length;
        
        const pollProgress = 50 + Math.round((completedTasks / tasks.length) * 50);
        setPercent(pollProgress);

        if (newCompletions > 0) {
          log(`📈 새로 완료: ${newCompletions}개 (전체: ${completedTasks}/${tasks.length})`);
        }

        if (completedTasks === tasks.length) {
          log('🎉 모든 작업 완료!');
          setPolling(false);
          setIsLoading(false);
          setPercent(100);
        }

      } catch (e) {
        log(`⚠️ 폴링 예외: ${e.message}`);
      }
    };

    poll();
    const interval = setInterval(poll, pollInterval);
    
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [polling, tasks, selected, setIsLoading]);

  const allDone = tasks.length > 0 && selected?.images?.every(img => !!img.videoUrl);
  const completedCount = selected?.images?.filter(img => !!img.videoUrl).length || 0;
  const staticCount = selected?.images?.filter(img => img.isStaticVideo).length || 0;

  const sortedImages = selected?.images ? 
    [...selected.images].sort((a, b) => a.sceneNumber - b.sceneNumber) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black">
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-8">
          <h2 className="text-3xl font-bold mb-2 text-white">영상 클립 생성</h2>
          <p className="text-gray-400 mb-6">원하는 컨셉을 선택하고 영상을 생성하세요</p>
          
          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-300 p-4 mb-6 rounded-lg">
              <div className="font-semibold">오류가 발생했습니다</div>
              <div className="text-sm mt-1">{error}</div>
            </div>
          )}

          {isLoading && (
            <div className="mb-6 bg-blue-900/30 border border-blue-800 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-blue-300">영상 클립을 생성하고 있습니다...</span>
                <span className="text-blue-400">{percent}%</span>
              </div>
              <div className="w-full bg-gray-700 h-2 rounded overflow-hidden">
                <div
                  className="h-2 bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="text-xs text-blue-400 mt-2">
                완료: {completedCount}/{selected?.images?.length || 0} 
                {staticCount > 0 && ` (정적: ${staticCount}개)`}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {styles.map(s => (
              <div
                key={s.concept_id}
                onClick={() => !isLoading && setSelectedConceptId(s.concept_id)}
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all bg-gray-900/50 ${
                  selectedConceptId === s.concept_id
                    ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                    : 'border-gray-700 hover:border-gray-600'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="font-semibold mb-1 text-white">{s.style || s.conceptName}</div>
                <div className="text-xs text-gray-400 mb-2 line-clamp-2">
                  {s.big_idea || s.summary || s.description}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  씬: {s.images?.length || 0}개
                </div>
                {selectedConceptId === s.concept_id && (
                  <div className="mt-2 text-xs text-blue-400 font-medium">✓ 선택됨</div>
                )}
              </div>
            ))}
          </div>

          {selected && (
            <div className="mb-6 bg-gray-900/50 rounded-lg p-4">
              <h3 className="font-semibold mb-3 text-white">
                {selected.style || selected.conceptName} - 씬 진행 상황 ({completedCount}/{selected.images.length})
              </h3>
              <div className="grid md:grid-cols-5 gap-3">
                {sortedImages.map(img => {
                  const hasVideo = !!img.videoUrl;
                  const isStatic = img.isStaticVideo;
                  
                  return (
                    <div
                      key={img.id || img.sceneNumber}
                      className={`border rounded-lg p-2 text-xs transition-all ${
                        hasVideo 
                          ? (isStatic ? 'bg-yellow-900/30 border-yellow-700' : 'bg-green-900/30 border-green-700')
                          : 'bg-gray-800 border-gray-700'
                      }`}
                    >
                      <img
                        src={img.thumbnail || img.url}
                        alt={`Scene ${img.sceneNumber}`}
                        className="w-full h-20 object-cover rounded mb-1"
                      />
                      <div className="font-medium text-gray-300 mb-1">
                        Scene {img.sceneNumber}
                        {img.timecode && (
                          <span className="text-gray-500 ml-1 text-[9px]">
                            ({img.timecode})
                          </span>
                        )}
                      </div>
                      
                      {img.copy && (
                        <div className="bg-gray-800/50 rounded p-1 mb-1">
                          <div className="text-[9px] text-gray-400 line-clamp-2">
                            💬 {img.copy}
                          </div>
                        </div>
                      )}
                      
                      {img.visual_description && (
                        <details className="mb-1">
                          <summary className="text-[9px] text-gray-500 cursor-pointer hover:text-gray-400">
                            설명 보기
                          </summary>
                          <div className="text-[8px] text-gray-500 mt-1 max-h-20 overflow-y-auto">
                            {img.visual_description}
                          </div>
                        </details>
                      )}
                      
                      <div className={`text-[10px] mt-1 font-medium ${
                        hasVideo 
                          ? (isStatic ? 'text-yellow-400' : 'text-green-400')
                          : 'text-gray-500'
                      }`}>
                        {hasVideo 
                          ? (isStatic ? '🖼️ 정적 이미지' : '🎬 영상 완료')
                          : '⏳ 처리 중'
                        }
                      </div>
                      
                      {img.videoUrl && (
                        <video
                          src={img.videoUrl}
                          className="w-full mt-1 rounded bg-black"
                          controls
                          muted
                          poster={isStatic ? img.url : undefined}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-6 border-t border-gray-700">
            <button 
              onClick={onPrev} 
              className="px-6 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors" 
              disabled={isLoading}
            >
              이전 단계
            </button>
            
            {!allDone ? (
              <button
                onClick={startGeneration}
                disabled={!selected || isLoading}
                className="px-8 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
              >
                {selected
                  ? isLoading
                    ? `생성 중... (${percent}%)`
                    : '🎬 클립 생성 시작'
                  : '컨셉을 선택하세요'}
              </button>
            ) : (
              <button
                onClick={onNext}
                className="px-8 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors font-medium"
              >
                다음 단계로 →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

Step3.propTypes = {
  storyboard: PropTypes.object,
  selectedConceptId: PropTypes.number,
  setSelectedConceptId: PropTypes.func,
  onPrev: PropTypes.func,
  onNext: PropTypes.func,
  isLoading: PropTypes.bool,
  setIsLoading: PropTypes.func
};

export default Step3;

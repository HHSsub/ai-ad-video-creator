import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import styles from './Step3_module.css'; 
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/*
  🔥 주요 수정사항:
  1. 비디오 생성 실패 시 3회 재시도 로직 추가
  2. 개별 실패가 전체 프로세스 중단하지 않도록 개선
  3. 실패한 이미지는 정적 이미지로 대체 처리
  4. 상세한 에러 로깅 및 진행률 표시 개선
  5. 무한 로딩 방지를 위한 타임아웃 및 강제 완료 로직
  6. 🔥 NEW: 씬 순서 정렬 강화 (sceneNumber 기준)
*/

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
  const [tasks, setTasks] = useState([]); // [{sceneNumber, taskId, duration, title, retryCount}]
  const [polling, setPolling] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState(null);
  const [taskRetries, setTaskRetries] = useState(new Map()); // sceneNumber -> retryCount

  const selected = styles.find(s => s.concept_id === selectedConceptId) || null;
  const MAX_RETRIES = 3; // 🔥 최대 재시도 횟수
  const RETRY_DELAY = 5000; // 🔥 재시도 간격 (5초)
  const MAX_TOTAL_TIME = 300000; // 🔥 최대 총 처리 시간 (5분)

  const log = (m) => {
    const timestampedMsg = `[${new Date().toLocaleTimeString()}] ${m}`;
    setLogs(prev => [...prev, timestampedMsg]);
    console.log(timestampedMsg);
  };

  // 🔥 개별 비디오 태스크 생성 (재시도 로직 포함)
  const createVideoTask = async (img, retryCount = 0) => {
    const maxRetries = MAX_RETRIES;
    
    try {
      const videoPrompt = img.prompt || img.image_prompt?.prompt;
      if (!videoPrompt) {
        log(`❌ Scene ${img.sceneNumber}: 프롬프트 없음 - 정적 이미지로 대체`);
        return {
          success: false,
          useStaticImage: true,
          sceneNumber: img.sceneNumber,
          error: 'No video prompt available'
        };
      }

      log(`🎬 Scene ${img.sceneNumber} 비디오 태스크 생성 중${retryCount > 0 ? ` (재시도 ${retryCount}/${maxRetries})` : ''}...`);
      
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
        
        // 🔥 재시도 가능한 에러인지 판단
        const retryableErrors = [429, 500, 502, 503, 504];
        const isRetryable = retryableErrors.includes(response.status) || 
                           errorText.toLowerCase().includes('timeout') ||
                           errorText.toLowerCase().includes('overload');
        
        if (isRetryable && retryCount < maxRetries) {
          log(`⚠️ Scene ${img.sceneNumber}: ${errorMsg} - ${RETRY_DELAY/1000}초 후 재시도`);
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

      const result = await response.json();
      if (result.success && result.task?.taskId) {
        log(`✅ Scene ${img.sceneNumber}: 태스크 생성 성공 (${result.task.taskId})`);
        return {
          success: true,
          taskId: result.task.taskId,
          sceneNumber: img.sceneNumber,
          duration: img.duration || 2,
          title: img.title
        };
      } else {
        if (retryCount < maxRetries) {
          log(`⚠️ Scene ${img.sceneNumber}: 응답 이상 - ${RETRY_DELAY/1000}초 후 재시도`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return createVideoTask(img, retryCount + 1);
        } else {
          log(`❌ Scene ${img.sceneNumber}: 태스크 생성 실패 - 정적 이미지로 대체`);
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
        log(`⚠️ Scene ${img.sceneNumber}: ${errorMsg} - ${RETRY_DELAY/1000}초 후 재시도`);
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
      setError('컨셉을 먼저 선택하세요');
      return;
    }
    if (isLoading) return;
    if (!Array.isArray(selected.images) || selected.images.length === 0) {
      setError('선택된 컨셉에 생성된 이미지가 없습니다 (Step2 확인)');
      return;
    }

    setError(null);
    setIsLoading(true);
    setPercent(0);
    setTasks([]);
    setPolling(false);
    setTaskRetries(new Map());
    
    const startTime = Date.now();
    log(`🚀 영상 태스크 생성 시작: ${selected.style} (이미지 ${selected.images.length}개)`);

    try {
      // 🔥 NEW: 이미지를 sceneNumber 순으로 정렬
      const sortedImages = [...selected.images].sort((a, b) => a.sceneNumber - b.sceneNumber);
      log(`🔄 이미지 정렬 완료: Scene ${sortedImages.map(img => img.sceneNumber).join(', ')}`);

      const newTasks = [];
      let successfulTasks = 0;
      let staticImageCount = 0;

      // 🔥 모든 이미지에 대해 태스크 생성 (실패해도 계속 진행)
      for (let i = 0; i < sortedImages.length; i++) {
        const img = sortedImages[i];
        
        try {
          const taskResult = await createVideoTask(img);
          
          if (taskResult.success) {
            newTasks.push(taskResult);
            successfulTasks++;
          } else if (taskResult.useStaticImage) {
            // 🔥 정적 이미지로 대체 - 비디오 URL을 이미지 URL로 설정
            const targetImg = selected.images.find(si => si.sceneNumber === img.sceneNumber);
            if (targetImg) {
              targetImg.videoUrl = targetImg.url; // 정적 이미지 사용
              targetImg.isStaticVideo = true;
              targetImg.failureReason = taskResult.error;
              log(`📷 Scene ${img.sceneNumber}: 정적 이미지로 설정 완료`);
            }
            staticImageCount++;
          }
          
          // 진행률 업데이트
          const progress = Math.round(((i + 1) / sortedImages.length) * 50);
          setPercent(progress);
          
        } catch (error) {
          log(`❌ Scene ${img.sceneNumber}: 예외 발생 - ${error.message}`);
          // 개별 실패는 무시하고 계속 진행
        }

        // API 부하 방지를 위한 짧은 딜레이
        if (i < sortedImages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (successfulTasks === 0 && staticImageCount === 0) {
        throw new Error('모든 비디오 태스크 생성 실패');
      }

      setTasks(newTasks);
      
      if (newTasks.length > 0) {
        setPolling(true);
        log(`📋 총 ${newTasks.length}개 태스크 폴링 시작 (정적 이미지: ${staticImageCount}개)`);
        setPercent(50);
      } else {
        // 모든 이미지가 정적 이미지로 대체된 경우
        log(`📋 모든 이미지가 정적 이미지로 처리됨 (${staticImageCount}개)`);
        setIsLoading(false);
        setPercent(100);
      }

    } catch (e) {
      const processingTime = Date.now() - startTime;
      setError(e.message);
      setIsLoading(false);
      log(`❌ 전체 생성 실패 (${processingTime}ms): ${e.message}`);
    }
  };

  // 🔥 개선된 폴링 로직 (타임아웃 및 강제 완료 포함)
  useEffect(() => {
    if (!polling || tasks.length === 0) return;
    
    let cancelled = false;
    let startTime = Date.now();
    let pollCount = 0;
    const maxPollTime = MAX_TOTAL_TIME; // 5분 최대
    const pollInterval = 5000; // 5초마다 폴링

    const poll = async () => {
      if (cancelled) return;
      
      pollCount++;
      const elapsedTime = Date.now() - startTime;
      
      // 🔥 최대 시간 초과 체크
      if (elapsedTime > maxPollTime) {
        log(`⏰ 최대 처리 시간 초과 (${Math.round(maxPollTime/1000)}초) - 현재 상태로 완료`);
        setPolling(false);
        setIsLoading(false);
        setPercent(100);
        return;
      }

      try {
        // 🔥 완료되지 않은 태스크만 확인
        const unfinished = tasks.filter(t => {
          const img = selected?.images?.find(im => im.sceneNumber === t.sceneNumber);
          return !(img && img.videoUrl && !img.isStaticVideo);
        });

        if (unfinished.length === 0) {
          log('🎉 모든 비디오 완료!');
          setPolling(false);
          setIsLoading(false);
          setPercent(100);
          return;
        }

        log(`📊 폴링 ${pollCount}회차: 대기 중인 태스크 ${unfinished.length}개 (경과: ${Math.round(elapsedTime/1000)}초)`);

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
          log(`⚠️ 상태 확인 에러: ${result.error}`);
          return;
        }

        // 🔥 완료된 세그먼트 처리
        let newCompletions = 0;
        for (const seg of (result.segments || [])) {
          if (seg.status === 'completed' && seg.videoUrl) {
            const target = selected.images.find(img => img.sceneNumber === seg.sceneNumber);
            if (target && !target.videoUrl) {
              target.videoUrl = seg.videoUrl;
              target.isStaticVideo = false;
              newCompletions++;
              log(`✅ Scene ${seg.sceneNumber}: 비디오 완료`);
            }
          } else if (seg.status === 'failed') {
            // 🔥 실패한 태스크는 정적 이미지로 대체
            const target = selected.images.find(img => img.sceneNumber === seg.sceneNumber);
            if (target && !target.videoUrl) {
              target.videoUrl = target.url; // 정적 이미지로 대체
              target.isStaticVideo = true;
              target.failureReason = seg.error || 'Video generation failed';
              log(`❌ Scene ${seg.sceneNumber}: 비디오 실패 - 정적 이미지로 대체`);
            }
          }
        }

        // 🔥 진행률 업데이트
        const completedTasks = tasks.filter(t => {
          const img = selected.images.find(i => i.sceneNumber === t.sceneNumber);
          return !!img?.videoUrl;
        }).length;
        
        const pollProgress = 50 + Math.round((completedTasks / tasks.length) * 50);
        setPercent(pollProgress);

        if (newCompletions > 0) {
          log(`📈 새로 완료된 비디오: ${newCompletions}개 (전체: ${completedTasks}/${tasks.length})`);
        }

        // 🔥 모든 태스크 완료 체크
        if (completedTasks === tasks.length) {
          log('🎉 모든 비디오 태스크 완료!');
          setPolling(false);
          setIsLoading(false);
          setPercent(100);
        }

      } catch (e) {
        log(`⚠️ 폴링 예외: ${e.message}`);
      }
    };

    // 즉시 첫 폴링 실행
    poll();
    
    // 정기적 폴링 설정
    const interval = setInterval(poll, pollInterval);
    
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [polling, tasks, selected, setIsLoading]);

  // 🔥 완료 상태 체크 (정적 이미지 포함)
  const allDone = tasks.length > 0 && selected?.images?.every(img => !!img.videoUrl);
  const completedCount = selected?.images?.filter(img => !!img.videoUrl).length || 0;
  const staticCount = selected?.images?.filter(img => img.isStaticVideo).length || 0;

  // 🔥 NEW: 이미지를 sceneNumber 순으로 정렬하여 표시
  const sortedImages = selected?.images ? 
    [...selected.images].sort((a, b) => a.sceneNumber - b.sceneNumber) : [];

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">3단계: 컨셉 선택 & 영상 클립 생성</h2>
      
      {error && (
        <div className="bg-red-100 text-red-700 p-3 mb-4 rounded border">
          <div className="font-semibold">❌ 오류</div>
          <div className="text-sm">{error}</div>
        </div>
      )}

      {/* 🔥 진행 상황 표시 개선 */}
      {isLoading && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-blue-800">🎬 영상 클립 생성 중...</span>
            <span className="text-blue-600">{percent}%</span>
          </div>
          <div className="w-full bg-blue-200 h-2 rounded overflow-hidden">
            <div
              className="h-2 bg-gradient-to-r from-indigo-500 to-pink-600 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="text-xs text-blue-600 mt-2">
            완료: {completedCount}/{selected?.images?.length || 0} 
            {staticCount > 0 && ` (정적 이미지: ${staticCount}개)`}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-5 mb-6">
        {styles.map(s => (
          <div
            key={s.concept_id}
            onClick={() => !isLoading && setSelectedConceptId(s.concept_id)}
            className={`border rounded p-3 cursor-pointer transition-all ${
              selectedConceptId === s.concept_id
                ? 'ring-2 ring-blue-500 bg-blue-50'
                : 'hover:border-blue-300 hover:bg-gray-50'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="font-semibold mb-1">{s.style}</div>
            <div className="text-xs text-gray-500 mb-2 line-clamp-3">
              {s.summary}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(s.images || []).slice(0, 6).map(img => (
                <img
                  key={img.id}
                  src={img.thumbnail || img.url}
                  alt={`Scene ${img.sceneNumber}`}
                  className="w-full h-20 object-cover rounded"
                />
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-600">
              Scenes: {s.imagePrompts?.length || 0} / Images: {(s.images || []).length}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="mb-6">
          <h3 className="font-semibold mb-2">
            {selected.style} - Scene 상태 ({completedCount}/{selected.images.length} 완료)
          </h3>
          {/* 🔥 NEW: 정렬된 이미지로 표시 */}
          <div className="grid md:grid-cols-5 gap-3">
            {sortedImages.map(img => {
              const hasVideo = !!img.videoUrl;
              const isStatic = img.isStaticVideo;
              
              return (
                <div
                  key={img.id}
                  className={`border rounded p-2 text-xs transition-all ${
                    hasVideo 
                      ? (isStatic ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200')
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <img
                    src={img.thumbnail || img.url}
                    alt={`Scene ${img.sceneNumber}`}
                    className="w-full h-24 object-cover rounded mb-1"
                  />
                  <div className="font-medium">Scene {img.sceneNumber}</div>
                  <div className={`text-[10px] ${
                    hasVideo 
                      ? (isStatic ? 'text-yellow-600' : 'text-green-600')
                      : 'text-gray-500'
                  }`}>
                    {hasVideo 
                      ? (isStatic ? '🖼️ 정적 이미지' : '🎬 비디오 완료')
                      : '⏳ 처리 중'
                    }
                  </div>
                  
                  {/* 🔥 실패 사유 표시 */}
                  {img.failureReason && (
                    <div className="text-[9px] text-red-500 mt-1" title={img.failureReason}>
                      ❌ {img.failureReason.substring(0, 20)}...
                    </div>
                  )}
                  
                  {img.videoUrl && (
                    <video
                      src={img.videoUrl}
                      className="w-full mt-1 rounded"
                      controls
                      muted
                      poster={isStatic ? img.url : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>
          
          {/* 🔥 상태 요약 */}
          {completedCount > 0 && (
            <div className="mt-3 p-2 bg-gray-100 rounded text-sm text-gray-700">
              📊 완료 상태: 비디오 {completedCount - staticCount}개, 정적 이미지 {staticCount}개
              {staticCount > 0 && (
                <span className="text-yellow-600 ml-2">
                  ℹ️ 일부 비디오 생성이 실패하여 정적 이미지로 대체되었습니다
                </span>
              )}
              <div className="text-xs text-gray-500 mt-1">
                📋 씬 순서: {sortedImages.map(img => `Scene${img.sceneNumber}`).join(' → ')}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between pt-4 border-t">
        <button 
          onClick={onPrev} 
          className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors" 
          disabled={isLoading}
        >
          이전
        </button>
        
        {!allDone ? (
          <button
            onClick={startGeneration}
            disabled={!selected || isLoading}
            className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-700 hover:to-pink-700 transition-colors"
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
            className="px-6 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            📹 합치기 단계로 이동
          </button>
        )}
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
          📋 상세 로그 보기 ({logs.length}개)
        </summary>
        <div className="mt-2 h-48 overflow-auto bg-gray-900 text-green-300 p-3 text-xs font-mono whitespace-pre-wrap rounded border">
          {logs.slice(-400).join('\n')}
        </div>
      </details>
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

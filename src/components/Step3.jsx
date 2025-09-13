import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/*
  수정 사항 (핵심):
  1) 이미지 재생성 로직 제거 (기존: storyboard-render-image 재호출) → 기존 생성된 images 사용
  2) startGeneration 에서 selected.images 검증 후 바로 image-to-video 태스크 생성
  3) 각 image 객체의 prompt / image_prompt 그대로 사용 (Step2에서 image_prompt 저장하도록 수정)
  4) 성공/진행률 로직 유지
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
  const [tasks, setTasks] = useState([]); // [{sceneNumber, taskId, duration, title}]
  const [polling, setPolling] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState(null);

  const selected = styles.find(s => s.concept_id === selectedConceptId) || null;

  const log = (m) =>
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${m}`]);

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
    log(`영상 task 생성 시작: ${selected.style} (이미지 ${selected.images.length}개)`);

    try {
      const newTasks = [];
      let done = 0;

      for (const img of selected.images) {
        try {
          const videoPrompt = img.prompt || img.image_prompt?.prompt;
          if (!videoPrompt) {
            log(`프롬프트 없음 scene=${img.sceneNumber} → 스킵`);
            continue;
          }
          log(`Video Task 요청 scene=${img.sceneNumber}`);
          const r = await fetch(`${API_BASE}/api/image-to-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: img.url,
              prompt: videoPrompt,
              duration: img.duration || 6, // 이미지 장면 1개당 2초지만 Freepik 비디오 duration 세그 생성 규칙에 맞게 필요 시 정책 수정
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
          if (!r.ok) {
            const txt = await r.text().catch(() => '');
            log(`Task 실패 scene=${img.sceneNumber} ${r.status} ${txt.slice(0,100)}`);
          } else {
            const j = await r.json();
            if (j.success && j.task?.taskId) {
              newTasks.push({
                taskId: j.task.taskId,
                sceneNumber: img.sceneNumber,
                duration: img.duration || 2,
                title: img.title
              });
              log(`Task 생성 성공 scene=${img.sceneNumber} task=${j.task.taskId}`);
            } else {
              log(`Task 응답 이상 scene=${img.sceneNumber}`);
            }
          }
        } catch (e) {
          log(`Task 예외 scene=${img.sceneNumber} ${e.message}`);
        } finally {
          done++;
          setPercent(Math.min(50, Math.round((done / selected.images.length) * 50)));
        }
      }

      if (!newTasks.length) throw new Error('생성된 video task 없음');
      setTasks(newTasks);
      setPolling(true);
      log(`총 ${newTasks.length}개 태스크 폴링 시작`);
      // 폴링 시작 시 percent 50% 기준으로 이후 완료율 반영
      setPercent(50);
    } catch (e) {
      setError(e.message);
      setIsLoading(false);
      log(`전체 생성 실패: ${e.message}`);
    }
  };

  useEffect(() => {
    if (!polling || tasks.length === 0) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const unfinished = tasks.filter(t => {
          const img = selected?.images?.find(im => im.sceneNumber === t.sceneNumber);
          return !(img && img.videoUrl);
        });
        if (!unfinished.length) {
          setPolling(false);
          setIsLoading(false);
          setPercent(100);
          log('모든 영상 완료');
          return;
        }
        const r = await fetch(`${API_BASE}/api/video-status`, {
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
        if (!r.ok) {
          log(`status 실패 ${r.status}`);
          return;
        }
        const j = await r.json();
        if (!j.success) {
          log(`status error: ${j.error}`);
          return;
        }
        for (const seg of (j.segments || [])) {
          if (seg.status === 'completed' && seg.videoUrl) {
            const target = selected.images.find(img => img.sceneNumber === seg.sceneNumber);
            if (target && !target.videoUrl) {
              target.videoUrl = seg.videoUrl;
              log(`완료 scene=${seg.sceneNumber} videoUrl 획득`);
            }
          }
        }
        const completedCount = tasks.filter(t => {
          const img = selected.images.find(i => i.sceneNumber === t.sceneNumber);
          return !!img?.videoUrl;
        }).length;
        const pollPercent = 50 + Math.round((completedCount / tasks.length) * 50);
        setPercent(pollPercent);
        if (completedCount === tasks.length) {
          setPolling(false);
          setIsLoading(false);
          setPercent(100);
          log('100% 완료');
        }
      } catch (e) {
        log(`status 예외: ${e.message}`);
      }
    };

    poll();
    const intv = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(intv);
    };
  }, [polling, tasks, selected, isLoading, setIsLoading]);

  const allDone =
    tasks.length > 0 &&
    tasks.every(t => selected?.images?.find(i => i.sceneNumber === t.sceneNumber && i.videoUrl));

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">3단계: 컨셉 선택 & 영상 클립 생성</h2>
      {error && (
        <div className="bg-red-100 text-red-700 p-3 mb-4 rounded">{error}</div>
      )}

      <div className="grid md:grid-cols-3 gap-5 mb-6">
        {styles.map(s => (
          <div
            key={s.concept_id}
            onClick={() => !isLoading && setSelectedConceptId(s.concept_id)}
            className={`border rounded p-3 cursor-pointer ${
              selectedConceptId === s.concept_id
                ? 'ring-2 ring-blue-500'
                : 'hover:border-blue-300'
            }`}
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
                  className="w-full h-20 object-cover rounded"
                />
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-600">
              Scenes: {s.imagePrompts?.length} / Images: {(s.images || []).length}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="mb-6">
          <h3 className="font-semibold mb-2">{selected.style} - Scene 상태</h3>
            <div className="grid md:grid-cols-5 gap-3">
            {(selected.images || []).map(img => {
              const done = !!img.videoUrl;
              return (
                <div
                  key={img.id}
                  className={`border rounded p-2 text-xs ${done ? 'bg-green-50' : ''}`}
                >
                  <img
                    src={img.thumbnail || img.url}
                    className="w-full h-24 object-cover rounded mb-1"
                  />
                  <div>Scene {img.sceneNumber}</div>
                  <div className="text-[10px] text-gray-500">
                    {done ? 'completed' : 'pending'}
                  </div>
                  {img.videoUrl && (
                    <video
                      src={img.videoUrl}
                      className="w-full mt-1 rounded"
                      controls
                      muted
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 h-2 rounded overflow-hidden">
            <div
              className="h-2 bg-gradient-to-r from-indigo-500 to-pink-600 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="text-xs text-gray-600 mt-1">{percent}%</div>
        </div>
      )}

      <div className="flex justify-between pt-4 border-t">
        <button onClick={onPrev} className="px-5 py-2 border rounded" disabled={isLoading}>
          이전
        </button>
        {!allDone ? (
          <button
            onClick={startGeneration}
            disabled={!selected || isLoading}
            className="px-6 py-2 rounded bg-gradient-to-r from-purple-600 to-pink-600 text-white disabled:opacity-50"
          >
            {selected
              ? isLoading
                ? '생성 중...'
                : '클립 생성 시작'
              : '컨셉 선택'}
          </button>
        ) : (
          <button
            onClick={onNext}
            className="px-6 py-2 rounded bg-green-600 text-white"
          >
            합치기 단계로 이동
          </button>
        )}
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer font-semibold">로그</summary>
        <div className="mt-2 h-48 overflow-auto bg-gray-900 text-green-300 p-3 text-xs font-mono whitespace-pre-wrap rounded">
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

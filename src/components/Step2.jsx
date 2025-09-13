import { useState, useCallback } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function imagesTotalFromStyles(styles) {
  return (styles || []).reduce((acc, s) => acc + (s.imagePrompts?.length || 0), 0);
}

async function runConcurrent(tasks, limit, onProgress) {
  let i = 0, done = 0;
  const results = new Array(tasks.length);
  const workers = new Array(Math.min(limit, tasks.length)).fill(0).map(async () => {
    while (true) {
      const cur = i++;
      if (cur >= tasks.length) break;
      try {
        results[cur] = await tasks[cur]();
      } catch (e) {
        results[cur] = { error: e.message };
      } finally {
        done++;
        onProgress?.(done, tasks.length);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [percent, setPercent] = useState(0);
  const [styles, setStyles] = useState([]);
  const [imgDone, setImgDone] = useState(0);
  const [imgFail, setImgFail] = useState(0);
  const [imgTotal, setImgTotal] = useState(0);
  const [canProceed, setCanProceed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const log = useCallback((m) =>
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${m}`]),
    []
  );

  const recomputeProceed = useCallback((currentStyles) => {
    if (!currentStyles?.length) {
      setCanProceed(false);
      return;
    }
    const allFull = currentStyles.every(s =>
      (s.images?.length || 0) === (s.imagePrompts?.length || 0)
    );
    setCanProceed(allFull);
  }, []);

  const handleGenerate = async () => {
    if (isLoading) return;
    setIsLoading?.(true);
    setError(null);
    setLogs([]);
    setPercent(0);
    setImgDone(0);
    setImgFail(0);
    setImgTotal(0);
    setStyles([]);
    setCanProceed(false);

    try {
      log('1/2 스토리보드(6 컨셉) 생성 시작');
      setPercent(5);
      const r = await fetch(`${API_BASE}/api/storyboard-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData })
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`storyboard-init 실패 ${r.status} ${txt}`);
      }
      const data = await r.json();
      if (!data.success) throw new Error(data.error || '스토리보드 실패');

      const fetchedStyles = (data.styles || []).map(s => ({
        ...s,
        images: [],
        failedPrompts: []
      }));

      // 기대 총 이미지 수 계산
      const totalImages = imagesTotalFromStyles(fetchedStyles);
      setImgTotal(totalImages);
      setStyles(fetchedStyles);
      log(`스토리보드 완료: 컨셉 6개, 컨셉당 씬=${fetchedStyles[0]?.imagePrompts?.length || 0}, 전체 이미지=${totalImages}`);
      setPercent(15);

      // 2) 이미지 생성
      log('2/2 Freepik 이미지 생성 시작');
      const tasks = [];
      fetchedStyles.forEach(style => {
        (style.imagePrompts || []).forEach(promptObj => {
          tasks.push(() => generateOne(fetchedStyles, style, promptObj));
        });
      });

      const concurrency = 6;
      await runConcurrent(tasks, concurrency, (done, total) => {
        const prog = 15 + Math.round((done / total) * 80);
        setPercent(Math.min(99, prog));
      });

      setPercent(100);
      log(`이미지 생성 완료 성공=${imgDone + 0 /* state lag safeguard */} 실패=${imgFail} / 전체=${imgTotal}`);

      setStoryboard?.({
        styles: fetchedStyles,
        metadata: data.metadata
      });

      recomputeProceed(fetchedStyles);

      if (!fetchedStyles.every(s => s.images.length === s.imagePrompts.length)) {
        log('일부 씬 이미지 생성 실패 → 재시도 가능');
      } else {
        log('모든 컨셉 모든 씬 완료. 다음 단계로 진행 가능');
      }

      setIsLoading?.(false);
      // 자동 이동 제거 (사용자 확인 후 이동)
    } catch (e) {
      console.error('Step2 오류:', e);
      log(`오류: ${e.message}`);
      setError(e.message);
      setIsLoading?.(false);
      setPercent(0);
      setCanProceed(false);
    }
  };

  const generateOne = async (stylesRef, style, promptObj, isRetry = false) => {
    try {
      log(`생성: [${style.style}] Scene ${promptObj.sceneNumber}${isRetry ? ' (재시도)' : ''}`);
      const r = await fetch(`${API_BASE}/api/storyboard-render-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptObj.prompt,
          sceneNumber: promptObj.sceneNumber,
          conceptId: style.concept_id,
          style: style.style
        })
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        log(`실패: [${style.style}] Scene ${promptObj.sceneNumber} ${r.status}`);
        style.failedPrompts.push(promptObj);
        setImgFail(f => f + 1);
        return;
      }
      const json = await r.json();
      let url = json.url;
      if (url && !/^https?:\/\//.test(url)) {
        url = `${API_BASE}${url}`;
      }
      style.images.push({
        id: `${style.concept_id}-${promptObj.sceneNumber}-${Math.random().toString(36).slice(2, 8)}`,
        sceneNumber: promptObj.sceneNumber,
        title: promptObj.title,
        duration: promptObj.duration,
        url,
        thumbnail: url,
        prompt: promptObj.prompt
      });
      // 실패 목록에서 제거
      style.failedPrompts = style.failedPrompts.filter(p => p.sceneNumber !== promptObj.sceneNumber);
      setImgDone(d => d + 1);
      log(`완료: [${style.style}] Scene ${promptObj.sceneNumber}`);
    } catch (e) {
      style.failedPrompts.push(promptObj);
      setImgFail(f => f + 1);
      log(`예외: [${style.style}] Scene ${promptObj.sceneNumber} - ${e.message}`);
    } finally {
      // 렌더 갱신
      setStyles(s => [...s]);
      recomputeProceed(stylesRef);
    }
  };

  const retryFailed = async () => {
    if (retrying) return;
    const target = [];
    styles.forEach(s => {
      (s.failedPrompts || []).forEach(p => target.push({ style: s, promptObj: p }));
    });
    if (!target.length) {
      log('재시도 대상 없음');
      return;
    }
    log(`실패한 씬 재시도 시작 (총 ${target.length}건)`);
    setRetrying(true);
    try {
      await runConcurrent(
        target.map(t => () => generateOne(styles, t.style, t.promptObj, true)),
        4,
        null
      );
      log('재시도 완료');
    } finally {
      setRetrying(false);
    }
  };

  const allFailedCount = styles.reduce((acc, s) => acc + (s.failedPrompts?.length || 0), 0);
  const expectedPerConcept = styles[0]?.imagePrompts?.length || 0;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {(isLoading || retrying) && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center">
          <div className="bg-white/10 backdrop-blur p-6 rounded text-white w-full max-w-xl">
            <h3 className="text-lg font-semibold">{retrying ? '재시도 중...' : '생성 중...'}</h3>
            {!retrying && (
              <>
                <div className="mt-3 w-full bg-white/25 h-2 rounded overflow-hidden">
                  <div className="bg-white h-2 transition-all" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 text-sm">
                  진행률 {percent}% · 성공 {imgDone} 실패 {imgFail} / {imgTotal}
                </div>
              </>
            )}
            <details className="mt-4" open>
              <summary className="cursor-pointer">로그</summary>
              <div className="mt-2 h-56 overflow-auto text-xs font-mono whitespace-pre-wrap">
                {logs.slice(-400).join('\n')}
              </div>
            </details>
          </div>
        </div>
      )}

      <div className={`bg-white rounded shadow p-6 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
        <h2 className="text-2xl font-bold mb-4">2단계: 6개 컨셉 스토리보드 & 이미지 생성</h2>
        {error && <div className="mb-4 bg-red-100 text-red-700 p-3 rounded">{error}</div>}
        <p className="text-gray-600 mb-6">
          Gemini 체인으로 6개 컨셉 + 멀티 스토리보드를 만든 뒤 각 씬 이미지를 Freepik으로 생성합니다.
          (컨셉 6개 고정 / 컨셉당 씬 수 = 영상길이(초)/2 )
        </p>
        <div className="flex flex-wrap gap-3">
          <button onClick={onPrev} className="px-5 py-2 border rounded">이전</button>
          <button
            onClick={handleGenerate}
            className="px-6 py-2 rounded bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow hover:from-purple-700 hover:to-pink-700 disabled:opacity-40"
            disabled={isLoading}
          >
            {styles.length ? '다시 생성' : '생성 시작'}
          </button>
          <button
            onClick={retryFailed}
            className="px-5 py-2 border rounded disabled:opacity-30"
            disabled={retrying || !allFailedCount}
          >
            실패 재시도 ({allFailedCount})
          </button>
          <button
            onClick={() => onNext?.()}
            className="px-6 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            disabled={!canProceed}
            title={canProceed ? '' : '모든 컨셉의 씬 이미지가 아직 완료되지 않았습니다.'}
          >
            다음 단계로
          </button>
        </div>
        {styles.length > 0 && (
          <div className="mt-4 text-sm text-gray-700">
            컨셉 6개 / 컨셉당 기대 씬 {expectedPerConcept}개 · 완료 여부: {canProceed ? '모두 완료' : '진행 중'}
          </div>
        )}
      </div>

      {styles.length > 0 && (
        <div className="mt-8 grid md:grid-cols-3 gap-5">
          {styles.map(s => {
            const doneCount = s.images?.length || 0;
            const need = s.imagePrompts?.length || 0;
            const failCount = s.failedPrompts?.length || 0;
            return (
              <div key={s.concept_id} className="border rounded p-3 bg-white">
                <div className="font-semibold mb-1">{s.style}</div>
                <div className="text-xs text-gray-500 mb-2 line-clamp-3">{s.summary}</div>
                <div className="grid grid-cols-3 gap-2">
                  {(s.images || []).map(img => (
                    <img
                      key={img.id}
                      src={img.thumbnail || img.url}
                      className="w-full h-20 object-cover rounded border"
                      title={`Scene ${img.sceneNumber}`}
                    />
                  ))}
                  {/* placeholders */}
                  {Array.from({ length: Math.max(0, need - doneCount) }).map((_, idx) => (
                    <div
                      key={`ph-${s.concept_id}-${idx}`}
                      className="w-full h-20 rounded bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 border border-dashed"
                    >
                      대기
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  완료 {doneCount}/{need} {failCount ? `· 실패 ${failCount}` : ''}
                </div>
                {failCount > 0 && (
                  <div className="mt-1 text-[10px] text-red-600">
                    실패 씬: {s.failedPrompts.map(p => p.sceneNumber).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

Step2.propTypes = {
  onNext: PropTypes.func,
  onPrev: PropTypes.func,
  formData: PropTypes.object,
  setStoryboard: PropTypes.func,
  setIsLoading: PropTypes.func,
  isLoading: PropTypes.bool
};

export default Step2;

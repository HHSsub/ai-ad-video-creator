import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const SpinnerOverlay = ({ percent, completedByStatus, ready, total, lines }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center">
    <div className="w-full max-w-2xl bg-white/10 rounded p-6 text-white">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">영상 제작 중입니다...</h3>
        <span className="text-sm text-white/80">{percent}%</span>
      </div>
      <div className="w-full bg-white/20 rounded h-2 mt-3 overflow-hidden">
        <div className="bg-white h-2 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 text-sm text-white/90">
        상태 완료: {completedByStatus}/{total} · URL 준비: {ready}/{total}
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
  percent: PropTypes.number,
  completedByStatus: PropTypes.number,
  ready: PropTypes.number,
  total: PropTypes.number,
  lines: PropTypes.arrayOf(PropTypes.string),
};

const Step3 = ({ formData, storyboard, onPrev, setIsLoading, isLoading }) => {
  const styles = Array.isArray(storyboard) ? storyboard : (storyboard?.storyboard ?? []);

  const [selectedStyle, setSelectedStyle] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  const [total, setTotal] = useState(0);
  const [completedByStatus, setCompletedByStatus] = useState(0);
  const [readyWithUrl, setReadyWithUrl] = useState(0);
  const [percent, setPercent] = useState(0);
  const [progressMap, setProgressMap] = useState({});
  const [completedAt, setCompletedAt] = useState(null);
  const [logs, setLogs] = useState([]);

  const isBusy = isGenerating || isLoading;
  const noData = !Array.isArray(styles) || styles.length === 0;

  const log = (msg) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  useEffect(() => {
    if (selectedStyle && selectedStyle.images) {
      setSelectedImages(selectedStyle.images);
    }
  }, [selectedStyle]);

  const handleStyleSelect = (styleData) => {
    if (isGenerating) return;
    setSelectedStyle(styleData);
    setSelectedImages(styleData.images || []);
  };

  const handleImageToggle = (imageId) => {
    if (isGenerating) return;
    setSelectedImages((prev) => {
      if (prev.some((img) => img.id === imageId)) {
        return prev.filter((img) => img.id !== imageId);
      } else {
        const imageToAdd = (selectedStyle?.images || []).find((img) => img.id === imageId);
        return imageToAdd ? [...prev, imageToAdd] : prev;
      }
    });
  };

  const start = async () => {
    if (!selectedStyle) return alert('스타일을 먼저 선택하세요.');
    if (selectedImages.length === 0) return alert('최소 1개의 이미지를 선택하세요.');

    setIsGenerating(true);
    setIsLoading?.(true);
    setError(null);
    setPercent(0);
    setCompletedByStatus(0);
    setReadyWithUrl(0);
    setCompletedAt(null);
    setProgressMap({});
    setLogs([]);

    try {
      log(`영상 생성 요청 시작: 스타일=${selectedStyle.style || selectedStyle.name}, 이미지 ${selectedImages.length}개`);

      const resp = await fetch(`${API_BASE}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedStyle: selectedStyle.style || selectedStyle.name, selectedImages, formData }),
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        log(`generate-video 실패: ${resp.status} ${txt}`);
        throw new Error(`영상 생성 실패: ${resp.status}`);
      }

      const data = await resp.json();
      const tasks = (data.tasks || []).map((t) => ({ taskId: t.taskId, sceneNumber: t.sceneNumber, title: t.title, duration: t.duration }));
      setTotal(tasks.length);
      log(`요청 완료. 생성 세그먼트 ${tasks.length}개. 폴링 시작`);

      let poll;
      const tick = async () => {
        const pending = tasks.filter((t) => progressMap[t.sceneNumber] !== 'completed');
        if (pending.length === 0) {
          clearInterval(poll);
          setIsGenerating(false);
          setIsLoading?.(false);
          log('모든 세그먼트 상태 완료. URL 대기 없이 종료');
          return;
        }

        try {
          const r = await fetch(`${API_BASE}/api/video-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: pending }),
          });

          if (!r.ok) {
            const txt = await r.text().catch(() => '');
            log(`status 실패: ${r.status} ${txt}`);
            return;
          }

          const result = await r.json();
          const segs = Array.isArray(result?.segments) ? result.segments : [];
          const map = { ...progressMap };

          let byStatus = 0;
          let withUrl = 0;
          for (const s of segs) {
            const st = String(s.status || '').toLowerCase();
            map[s.sceneNumber] = st;
            if (st === 'completed') {
              byStatus++;
              if (s.videoUrl) withUrl++;
            }
          }

          setProgressMap(map);
          const totalNow = result?.summary?.total ?? tasks.length;
          setCompletedByStatus(byStatus);
          setReadyWithUrl(withUrl);
          setPercent(Math.round((byStatus / totalNow) * 100));

          log(`상태: 완료 ${byStatus}/${totalNow}, URL ${withUrl}/${totalNow}`);

          if (byStatus === totalNow && !completedAt) setCompletedAt(Date.now());

          const grace = 90_000;
          if (byStatus === totalNow && (withUrl === totalNow || (completedAt && Date.now() - completedAt >= grace))) {
            clearInterval(poll);
            setIsGenerating(false);
            setIsLoading?.(false);
            log('모든 세그먼트 완료 및 URL 준비(또는 유예 만료). 종료');
          }
        } catch (e) {
          log(`폴링 예외: ${e?.message || e}`);
        }
      };

      await tick();
      poll = setInterval(tick, 5000);

      setTimeout(() => {
        if (poll) clearInterval(poll);
        setIsGenerating(false);
        setIsLoading?.(false);
        log('폴링 타임아웃(10분)');
      }, 10 * 60 * 1000);
    } catch (e) {
      console.error('영상 생성 오류:', e);
      setError(e.message);
      setIsGenerating(false);
      setIsLoading?.(false);
      log(`에러: ${e.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      {isBusy && (
        <SpinnerOverlay
          percent={percent}
          completedByStatus={completedByStatus}
          ready={readyWithUrl}
          total={total}
          lines={logs}
        />
      )}

      <div className={`bg-white rounded-lg shadow-lg p-6 ${isBusy ? 'pointer-events-none opacity-50' : ''}`}>
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">3단계: 스타일 선택 및 영상 생성</h2>
          <p className="text-gray-600">
            스토리보드의 스타일을 선택하고, 해당 스타일의 이미지들을 영상으로 변환합니다.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded p-3">
            {error}
          </div>
        )}

        {noData ? (
          <div className="p-6 text-center text-gray-600 border rounded">
            스토리보드가 아직 준비되지 않았습니다. 이전 단계에서 스토리보드를 먼저 생성하세요.
          </div>
        ) : (
          <>
            {/* 스타일 리스트 (기존 레이아웃 유지) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {styles.map((style) => (
                <div
                  key={style.style || style.name}
                  className={`border rounded p-3 cursor-pointer ${selectedStyle?.style === style.style || selectedStyle?.name === style.name ? 'ring-2 ring-blue-500' : 'hover:border-gray-400'}`}
                  onClick={() => (isBusy ? null : setSelectedStyle(style))}
                >
                  <div className="font-semibold mb-2">{style.style || style.name}</div>
                  <div className="text-xs text-gray-500 mb-3">{style.description}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(style.images || []).slice(0, 6).map((img) => (
                      <img
                        key={img.id}
                        src={img.thumbnail || img.url}
                        alt={img.title}
                        className="w-full h-20 object-cover rounded"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 이미지 선택 (기존 레이아웃 유지) */}
            {selectedStyle && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">
                  {selectedStyle.style || selectedStyle.name} - 이미지 선택
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(selectedStyle.images || []).map((img) => {
                    const checked = selectedImages.some((s) => s.id === img.id);
                    return (
                      <label
                        key={img.id}
                        className={`relative block border rounded overflow-hidden ${checked ? 'ring-2 ring-blue-500' : 'hover:border-gray-400'}`}
                      >
                        <img src={img.thumbnail || img.url} alt={img.title} className="w-full h-32 object-cover" />
                        <input
                          type="checkbox"
                          className="absolute top-2 left-2"
                          checked={checked}
                          onChange={() => handleImageToggle(img.id)}
                        />
                        <div className="p-2 text-xs text-gray-600">{img.title}</div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 액션 바 (기존 유지) */}
            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  새로 시작
                </button>

                <button
                  onClick={onPrev}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  이전 단계
                </button>
              </div>

              <button
                onClick={start}
                disabled={!selectedStyle || selectedImages.length === 0 || isBusy}
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                🎬 영상 제작 시작 ({selectedImages.length || 0}개)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

Step3.propTypes = {
  formData: PropTypes.object,
  storyboard: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  onPrev: PropTypes.func,
  setIsLoading: PropTypes.func,
  isLoading: PropTypes.bool,
};

export default Step3;

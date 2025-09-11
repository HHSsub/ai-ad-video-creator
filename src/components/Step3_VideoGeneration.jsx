import { useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function Step3_VideoGeneration({
  formData,
  selectedStyle,
  selectedImages,
  onPrev,
  onNext
}) {
  const [proj, setProj] = useState(null);
  const [segments, setSegments] = useState([]);
  const [polling, setPolling] = useState(false);
  const [compiledUrl, setCompiledUrl] = useState(null);
  const [bgmList, setBgmList] = useState([]);
  const [selectedBgm, setSelectedBgm] = useState(null);
  const [finalUrl, setFinalUrl] = useState(null);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const totalSeconds = useMemo(() => parseInt(formData?.videoLength || 30), [formData]);
  const perSegment = useMemo(() => {
    const n = Math.max(1, selectedImages?.length || 1);
    return Math.max(2, Math.floor(totalSeconds / n));
  }, [totalSeconds, selectedImages]);

  // 1) 시작 시 영상 생성 요청
  useEffect(() => {
    let ignore = false;

    async function start() {
      setError(null);
      setCompiledUrl(null);
      setFinalUrl(null);

      const body = {
        selectedStyle: selectedStyle?.name || selectedStyle,
        selectedImages,
        formData,
        targetTotalDuration: totalSeconds
      };

      const r = await fetch(`${API_BASE}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const t = await r.text();
      const data = (() => { try { return JSON.parse(t); } catch { return null; } })();

      if (!r.ok || !data?.success) {
        setError(data?.error || t || `HTTP ${r.status}`);
        return;
      }

      if (ignore) return;

      setProj(data.videoProject);
      setSegments(data.videoSegments || []);
      setPolling(true);
    }

    start().catch(e => setError(e?.message || 'failed'));

    return () => { ignore = true; };
  }, [API_BASE]); // eslint-disable-line

  // 2) 폴링으로 세그먼트 완료 여부 확인
  useEffect(() => {
    if (!polling || !segments?.length) return;

    async function tick() {
      const taskIds = segments.map(s => s.taskId).filter(Boolean);
      if (!taskIds.length) return;

      const r = await fetch(`${API_BASE}/api/video-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds })
      });
      const data = await r.json();

      if (!data?.success) {
        setError(data?.error || 'status failed');
        return;
      }

      const byId = Object.fromEntries((data.statusResults || []).map(s => [s.taskId, s]));
      setSegments(prev => prev.map(seg => {
        const st = byId[seg.taskId];
        if (!st) return seg;
        return {
          ...seg,
          status: st.status,
          videoUrl: st.videoUrl || seg.videoUrl,
          duration: st.duration || seg.duration,
          progress: st.progress
        };
      }));

      const allDone = (data.statusResults || []).every(s => s.status === 'COMPLETED');
      if (allDone) setPolling(false);
    }

    timerRef.current = setInterval(tick, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [polling, segments?.length]); // eslint-disable-line

  // 3) 합치기
  async function handleCompile() {
    try {
      setError(null);
      const completed = segments.filter(s => s.videoUrl);
      if (!completed.length) {
        setError('완료된 세그먼트가 없습니다.');
        return;
      }

      const r = await fetch(`${API_BASE}/api/compile-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videos: completed.map(s => ({ url: s.videoUrl, duration: s.duration || perSegment }))
        })
      });
      const data = await r.json();
      if (!r.ok || !data?.success) throw new Error(data?.error || 'compile failed');

      // compile-videos가 반환하는 최종 URL 명칭에 맞춰 조정
      setCompiledUrl(data.finalUrl || data.url || data.resultUrl || null);
    } catch (e) {
      setError(e.message);
    }
  }

  // 4) BGM 목록
  async function loadBgm() {
    try {
      const r = await fetch(`${API_BASE}/api/load-bgm-list`);
      const data = await r.json();
      if (!r.ok || !data?.success) throw new Error(data?.error || 'bgm load failed');
      setBgmList(data.bgmList || data.items || []);
    } catch (e) {
      setError(e.message);
    }
  }

  // 5) BGM 합치기
  async function handleApplyBgm() {
    try {
      setError(null);
      if (!compiledUrl) throw new Error('먼저 영상을 합치세요.');
      if (!selectedBgm) throw new Error('BGM을 선택하세요.');

      const r = await fetch(`${API_BASE}/api/apply-bgm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: compiledUrl,
          bgm: selectedBgm, // 엔드포인트 형식에 맞춰 필요시 {id} 또는 {url}
          volume: 0.6
        })
      });
      const data = await r.json();
      if (!r.ok || !data?.success) throw new Error(data?.error || 'apply bgm failed');

      setFinalUrl(data.finalUrl || data.url || null);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-4">3단계: 비디오 생성 및 합치기</h2>

      {error && <div className="p-3 mb-4 bg-red-50 text-red-700 rounded">{error}</div>}

      <div className="mb-4 text-gray-700">
        총 길이: <b>{totalSeconds}초</b>, 세그먼트 수: <b>{selectedImages.length}</b>, 세그먼트 길이: <b>{perSegment}초</b>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {segments.map((s, i) => (
          <div key={s.segmentId || i} className="border rounded p-3">
            <div className="text-sm text-gray-600 mb-2">
              세그먼트 {i + 1} — 상태: {s.status || '대기'} {typeof s.progress === 'number' ? `(${s.progress}%)` : ''}
              <span className="ml-2 text-gray-500">길이: {s.duration || perSegment}초</span>
            </div>
            {s.videoUrl ? (
              <video src={s.videoUrl} controls className="w-full rounded" />
            ) : (
              <div className="w-full h-40 bg-gray-100 rounded flex items-center justify-center text-gray-500">
                대기 중...
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-3">
        <button onClick={onPrev} className="px-4 py-2 rounded bg-gray-500 text-white">이전</button>
        <button onClick={handleCompile} disabled={!segments.some(s => s.videoUrl)} className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50">
          완료된 세그먼트 합치기
        </button>
        <button onClick={loadBgm} className="px-4 py-2 rounded bg-emerald-600 text-white">BGM 불러오기</button>
      </div>

      {compiledUrl && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">합쳐진 영상</h3>
          <video src={compiledUrl} controls className="w-full rounded" />
        </div>
      )}

      {bgmList.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">BGM 선택</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {bgmList.map((b, i) => (
              <label key={b.id || i} className="border rounded p-3 flex items-center gap-2">
                <input type="radio" name="bgm" onChange={() => setSelectedBgm(b)} />
                <span className="text-sm">{b.title || b.name || `BGM ${i + 1}`}</span>
              </label>
            ))}
          </div>
          <div className="mt-3">
            <button onClick={handleApplyBgm} disabled={!compiledUrl || !selectedBgm} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">
              BGM 적용하기
            </button>
          </div>
        </div>
      )}

      {finalUrl && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">최종 영상</h3>
          <video src={finalUrl} controls className="w-full rounded" />
          <div className="mt-3">
            <button onClick={onNext} className="px-4 py-2 rounded bg-purple-600 text-white">다음 단계</button>
          </div>
        </div>
      )}
    </div>
  );
}

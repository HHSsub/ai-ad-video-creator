// 진행률=상태 완료 기준으로 즉시 반영 → URL 준비되면 자동 컴파일(2초 컷)까지
import { useEffect, useState } from 'react';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function Step3({ formData, storyboard, onPrev, setIsLoading, isLoading }) {
  const styles = Array.isArray(storyboard) ? storyboard : (storyboard?.storyboard ?? []);
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);

  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [summary, setSummary] = useState({ total: 0, completedByStatus: 0, ready: 0 });
  const [progressMap, setProgressMap] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (selectedStyle?.images) {
      // 기본선택: 전부 선택(= 영상길이/2 장)
      setSelectedImages(selectedStyle.images.slice());
    }
  }, [selectedStyle]);

  const start = async () => {
    if (!selectedStyle || selectedImages.length === 0) return;
    setBusy(true); setIsLoading?.(true); setError(null); setPercent(0);
    setSummary({ total: selectedImages.length, completedByStatus: 0, ready: 0 }); setProgressMap({});

    const r = await fetch(`${API_BASE}/api/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedStyle: selectedStyle.style || selectedStyle.name, selectedImages, formData })
    });
    if (!r.ok) { setError(`생성 실패 ${r.status}`); setBusy(false); setIsLoading?.(false); return; }

    const data = await r.json();
    let tasks = (data.tasks || []).map(t => ({ taskId: t.taskId, sceneNumber: t.sceneNumber, title: t.title, duration: t.duration }));
    const total = tasks.length;

    let timer = null; let completedAt = null;

    const tick = async () => {
      const pending = tasks.filter(t => progressMap[t.sceneNumber] !== 'completed');
      if (pending.length === 0) {
        clearInterval(timer);
        await compile(); // 모두 완료되면 컴파일 시도
        return;
      }

      const s = await fetch(`${API_BASE}/api/video-status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: pending })
      }).then(r => r.json()).catch(()=>null);
      if (!s?.success) return;

      const map = { ...progressMap };
      let byStatus = 0, ready = 0;
      for (const seg of s.segments) {
        const st = String(seg.status || '').toLowerCase();
        map[seg.sceneNumber] = st;
        if (st === 'completed') {
          byStatus++;
          if (seg.videoUrl) ready++;
        }
      }
      const totalNow = s.summary?.total ?? total;
      setProgressMap(map);
      setSummary({ total: totalNow, completedByStatus: byStatus, ready });
      setPercent(Math.round((byStatus / totalNow) * 100));

      if (byStatus === totalNow && !completedAt) completedAt = Date.now();
      // 모두 상태완료되면 90초 안에 URL 모이면 즉시 컴파일
      if (byStatus === totalNow && (ready === totalNow || (Date.now() - completedAt) >= 90_000)) {
        clearInterval(timer);
        await compile();
      }
    };

    const compile = async () => {
      try {
        // 최신 상태 재조회 후 videoUrl 수집
        const s2 = await fetch(`${API_BASE}/api/video-status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasks })
        }).then(r => r.json());
        const withUrls = s2.segments?.filter(x => x.videoUrl).sort((a,b)=>a.sceneNumber-b.sceneNumber) || [];
        if (!withUrls.length) throw new Error('컴파일할 영상이 없습니다.');
        // 2초로 컷 & 머지
        const resp = await fetch(`${API_BASE}/api/compile-videos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segments: withUrls, clipDurationSec: 2 })
        });
        if (!resp.ok) throw new Error(`컴파일 실패 ${resp.status}`);

        // 서버가 파일 바이너리로 반환하는 경우: blob → ObjectURL
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${(selectedStyle.style||'video').replace(/\s+/g,'_')}.mp4`;
        a.click(); URL.revokeObjectURL(url);

        setBusy(false); setIsLoading?.(false);
      } catch (e) {
        setError(e.message);
        setBusy(false); setIsLoading?.(false);
      }
    };

    await tick();
    timer = setInterval(tick, 5000);
    // 안전 타임아웃
    setTimeout(() => { if (timer) clearInterval(timer); setBusy(false); setIsLoading?.(false); }, 10 * 60 * 1000);
  };

  return (
    <div>
      {/* 네 기존 UI 유지하고 버튼만 연결 */}
      <button onClick={start} disabled={busy || isLoading || !selectedStyle || selectedImages.length===0}>
        🎬 영상 제작 시작 ({selectedImages.length})
      </button>
      {busy && (
        <div>
          <div>진행률: {percent}%</div>
          <div>상태 완료: {summary.completedByStatus}/{summary.total} · URL 준비: {summary.ready}/{summary.total}</div>
        </div>
      )}
      {error && <div className="text-red-600">{error}</div>}
    </div>
  );
}

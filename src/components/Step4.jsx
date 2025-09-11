import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const Step4 = ({ storyboard, selectedConceptId, onPrev }) => {
  const styles = storyboard?.styles || [];
  const selected = styles.find(s=>s.concept_id===selectedConceptId);
  const [logs, setLogs] = useState([]);
  const [mergedUrl, setMergedUrl] = useState(null);
  const [finalUrl, setFinalUrl] = useState(null);
  const [bgms, setBgms] = useState([]);
  const [bgmId, setBgmId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,setError] = useState(null);

  const log = (m)=> setLogs(prev=> [...prev, `[${new Date().toLocaleTimeString()}] ${m}`]);

  useEffect(()=>{
    (async ()=>{
      try {
        const r = await fetch(`${API_BASE}/api/list-bgm`);
        if (r.ok) {
          const j = await r.json();
          if (j.success) setBgms(j.bgms);
        }
      } catch{}
    })();
  },[]);

  const handleMerge = async () => {
    if (!selected) return alert('선택된 컨셉 없음');
    setError(null);
    setLoading(true);
    try {
      log('클립 합치기 시작');
      // progressMap 안에서 videoUrl 가져오지 못하면 여기선 selected.images[].videoUrl 가정
      const segments = (selected.images||[]).map(img=> ({
        sceneNumber: img.sceneNumber,
        videoUrl: img.videoUrl || `/videos/task_${img.sceneNumber}.mp4` // 실제로는 Step3 status 결과에서 저장 필요
      }));
      const r = await fetch(`${API_BASE}/api/merge-video`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ segments })
      });
      if (!r.ok) throw new Error(`merge 실패 ${r.status}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setMergedUrl(j.mergedVideoUrl);
      log('합치기 완료');
    } catch(e) {
      setError(e.message);
      log(`오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMux = async () => {
    if (!mergedUrl) return alert('먼저 합친 영상이 필요');
    if (!bgmId) return alert('BGM 선택 필요');
    const bgm = bgms.find(b=>b.id===bgmId);
    if (!bgm) return;
    setLoading(true);
    setError(null);
    try {
      log('BGM 합성 시작');
      const r = await fetch(`${API_BASE}/api/mux-bgm`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ mergedVideoUrl: mergedUrl, bgmUrl: bgm.url })
      });
      if (!r.ok) throw new Error(`mux 실패 ${r.status}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setFinalUrl(j.finalVideoUrl);
      log('BGM 합성 완료');
    } catch(e) {
      setError(e.message);
      log(`오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">4단계: 합치기 & BGM</h2>
      {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
      {!mergedUrl && (
        <button
          onClick={handleMerge}
          disabled={loading}
          className="px-6 py-2 rounded bg-gradient-to-r from-purple-600 to-pink-600 text-white"
        >
          {loading ? '합치는 중...' : '클립 합치기'}
        </button>
      )}
      {mergedUrl && !finalUrl && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">BGM 선택</h3>
            <select
              className="border rounded p-2 mb-3"
              value={bgmId||''}
              onChange={e=>setBgmId(e.target.value)}
            >
              <option value="">-- 선택 --</option>
              {bgms.map(b=> <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          <div>
            <button
              onClick={handleMux}
              disabled={!bgmId || loading}
              className="px-6 py-2 rounded bg-green-600 text-white"
            >
              {loading ? '합성 중...' : 'BGM 합성'}
            </button>
          </div>
        </div>
      )}
      {mergedUrl && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Merged Video</h3>
          <video src={mergedUrl} controls className="w-full rounded" />
        </div>
      )}
      {finalUrl && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Final Video (With BGM)</h3>
          <video src={finalUrl} controls className="w-full rounded" />
          <a
            href={finalUrl}
            download
            className="inline-block mt-3 px-5 py-2 bg-blue-600 text-white rounded"
          >
            다운로드
          </a>
        </div>
      )}

      <details className="mt-8">
        <summary className="cursor-pointer font-semibold">로그</summary>
        <div className="mt-2 h-48 overflow-auto bg-gray-900 text-green-300 p-3 text-xs font-mono whitespace-pre-wrap rounded">
          {logs.slice(-400).join('\n')}
        </div>
      </details>

      <div className="mt-8">
        <button onClick={onPrev} className="px-5 py-2 border rounded">이전</button>
      </div>
    </div>
  );
};

Step4.propTypes = {
  storyboard: PropTypes.object,
  selectedConceptId: PropTypes.number,
  onPrev: PropTypes.func
};

export default Step4;

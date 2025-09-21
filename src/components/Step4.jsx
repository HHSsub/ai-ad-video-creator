import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const Step4 = ({ storyboard, selectedConceptId, onPrev, formData }) => { // 🔥 formData 추가
  const styles = storyboard?.styles || [];
  const selected = styles.find(s => s.concept_id === selectedConceptId);
  const [logs, setLogs] = useState([]);
  const [compiledUrl, setCompiledUrl] = useState(null);
  const [finalVideo, setFinalVideo] = useState(null);
  const [bgmMood, setBgmMood] = useState('');
  const [bgmMoodList, setBgmMoodList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const log = m => setLogs(p => [...p, `[${new Date().toLocaleTimeString()}] ${m}`]);

  useEffect(() => {
    // BGM mood 목록을 서버에서 받아옴
    fetch(`${API_BASE}/api/load-mood-list`)
      .then(r => r.json())
      .then(j => {
        if (j.moods) setBgmMoodList(j.moods);
      })
      .catch(() => setBgmMoodList([]));
  }, []);

  const compile = async () => {
    if (!selected) return;
    setErr(null);
    setLoading(true);
    try {
      const segs = (selected.images || [])
        .filter(i => i.videoUrl)
        .sort((a, b) => a.sceneNumber - b.sceneNumber)
        .map(i => ({ videoUrl: i.videoUrl, sceneNumber: i.sceneNumber }));

      if (!segs.length) throw new Error('videoUrl 있는 scene 없음');

      // 🔥 사용자가 선택한 영상 길이를 정확히 전달
      const userVideoLength = formData?.videoLength || storyboard?.metadata?.videoLength || '10초';
      
      log(`클립 합치기 시작: ${segs.length}개 클립 → ${userVideoLength}`);
      log(`🔥 사용자 선택 영상 길이: ${userVideoLength}`);
      
      const r = await fetch(`${API_BASE}/api/compile-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          segments: segs, 
          jsonMode: true,
          videoLength: userVideoLength, // 🔥 핵심: 사용자 선택 길이 전달
          formData: formData // 🔥 formData도 함께 전달
        })
      });
      
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`compile 실패 ${r.status} ${txt}`);
      }
      
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'compile 실패');
      
      setCompiledUrl(j.compiledVideoUrl);
      
      // 🔥 길이 검증 로그
      const meta = j.metadata || {};
      const lengthMatch = meta.lengthMatch ? '✅ 일치' : '❌ 불일치';
      
      log(`합치기 완료: ${j.compiledVideoUrl}`);
      log(`🔥 길이 검증: 선택 ${meta.userSelectedVideoLength || 'N/A'}초 → 실제 ${meta.actualCompiledDuration || 'N/A'}초 ${lengthMatch}`);
      
      if (!meta.lengthMatch) {
        log(`⚠️ 영상 길이가 예상과 다릅니다!`);
      }
      
    } catch (e) {
      setErr(e.message);
      log(`오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

const applyBgm = async () => {
  if (!compiledUrl) return;
  if (!bgmMood) return;
  setErr(null);
  setLoading(true);
  try {
    log(`BGM 적용 시작: mood=${bgmMood}`);
    const r = await fetch(`${API_BASE}/api/apply-bgm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoPath: compiledUrl,
        mood: bgmMood
      })
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`apply-bgm 실패 ${r.status} ${txt}`);
    }
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'apply-bgm 실패');
    // 🔥 결과 검증
    if (!j.mergedVideoPath) {
      throw new Error('BGM 적용 결과 경로가 없습니다');
    }
    log(`BGM 적용 완료: ${j.mergedVideoPath}`);
    log(`사용된 BGM: ${j.bgm?.selectedFrom || 'unknown'}`);
    setFinalVideo(j.mergedVideoPath);
  } catch (e) {
    setErr(`BGM 적용 실패: ${e.message}`);
    log(`오류: ${e.message}`);
  } finally {
    setLoading(false);
  }
};

  if (!selected) {
    return (
      <div className="p-6 bg-white rounded shadow">
        <h2 className="text-xl font-bold mb-4">4단계</h2>
        <p className="text-gray-500">선택된 컨셉 없음. 이전 단계로 돌아가 선택.</p>
        <button onClick={onPrev} className="mt-4 px-4 py-2 border rounded">이전</button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">4단계: 합치기 & BGM</h2>
      
      {/* 🔥 영상 길이 정보 표시 */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
        <p className="text-sm text-blue-800">
          <strong>선택된 영상 길이:</strong> {formData?.videoLength || storyboard?.metadata?.videoLength || '10초'}
        </p>
        <p className="text-xs text-blue-600 mt-1">
          이 길이에 맞춰 클립들이 합쳐집니다. (각 클립 2초씩)
        </p>
      </div>

      {err && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{err}</div>}
      
      {!compiledUrl && (
        <button
          onClick={compile}
          disabled={loading}
          className="px-6 py-2 rounded bg-gradient-to-r from-purple-600 to-pink-600 text-white disabled:opacity-50">
          {loading ? '합치는 중...' : '🔥 정확한 길이로 클립 합치기'}
        </button>
      )}
      
      {compiledUrl && !finalVideo && (
        <div className="mt-6 space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Merged Preview</h3>
            <video src={compiledUrl} controls className="w-full rounded mb-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">BGM Mood 선택</label>
            <select
              className="border rounded p-2"
              value={bgmMood}
              onChange={e => setBgmMood(e.target.value)}
              disabled={loading}
            >
              <option value="">-- 선택 --</option>
              {bgmMoodList.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <button
            onClick={applyBgm}
            disabled={!bgmMood || loading}
            className="px-6 py-2 rounded bg-green-600 text-white disabled:opacity-50"
          >
            {loading ? 'BGM 적용 중...' : 'BGM 적용'}
          </button>
        </div>
      )}
      
      {finalVideo && (
        <div className="mt-8">
          <h3 className="font-semibold mb-2">🎉 Final Video</h3>
          <video src={finalVideo} controls className="w-full rounded mb-3" />
          <div className="flex gap-3">
            <a href={finalVideo} download className="inline-block px-5 py-2 bg-blue-600 text-white rounded">
              다운로드
            </a>
            <div className="text-sm text-gray-600 flex items-center">
              길이: {formData?.videoLength || '10초'} | BGM: {bgmMood || '없음'}
            </div>
          </div>
        </div>
      )}

      <details className="mt-8">
        <summary className="cursor-pointer font-semibold">로그</summary>
        <div className="mt-2 h-48 overflow-auto bg-gray-900 text-green-300 p-3 text-xs font-mono whitespace-pre-wrap rounded">
          {logs.slice(-400).join('\n')}
        </div>
      </details>

      <div className="mt-6">
        <button onClick={onPrev} className="px-5 py-2 border rounded">이전</button>
      </div>
    </div>
  );
};

Step4.propTypes = {
  storyboard: PropTypes.object,
  selectedConceptId: PropTypes.number,
  onPrev: PropTypes.func,
  formData: PropTypes.object // 🔥 formData PropTypes 추가
};

export default Step4;

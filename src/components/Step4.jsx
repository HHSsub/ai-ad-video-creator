import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const Step4 = ({ storyboard, selectedConceptId, onPrev, formData }) => {
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

      const userVideoLength = formData?.videoLength || storyboard?.metadata?.videoLength || '10초';
      
      log(`클립 합치기 시작: ${segs.length}개 클립 → ${userVideoLength}`);
      log(`🔥 사용자 선택 영상 길이: ${userVideoLength}`);
      
      const r = await fetch(`${API_BASE}/api/compile-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          segments: segs, 
          jsonMode: true,
          videoLength: userVideoLength,
          formData: formData
        })
      });
      
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`compile 실패 ${r.status} ${txt}`);
      }
      
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'compile 실패');
      
      setCompiledUrl(j.compiledVideoUrl);
      
      const meta = j.metadata || {};
      const lengthMatch = meta.lengthMatch ? '✅ 일치' : '⌛ 불일치';
      
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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black">
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-8">
            <h2 className="text-xl font-bold mb-4 text-white">영상 합치기 & BGM</h2>
            <p className="text-gray-400">선택된 컨셉 없음. 이전 단계로 돌아가 선택.</p>
            <button onClick={onPrev} className="mt-4 px-4 py-2 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-800">
              이전
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black">
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-8">
          <h2 className="text-3xl font-bold mb-6 text-white">영상 합치기 & BGM 추가</h2>
          
          <div className="mb-6 p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
            <p className="text-sm text-blue-300">
              <strong>선택된 영상 길이:</strong> {formData?.videoLength || storyboard?.metadata?.videoLength || '10초'}
            </p>
            <p className="text-xs text-blue-400 mt-1">
              이 길이에 맞춰 클립들이 합쳐집니다. (각 클립 2초씩)
            </p>
          </div>

          {err && (
            <div className="bg-red-900/30 border border-red-800 text-red-300 p-4 rounded-lg mb-6">
              {err}
            </div>
          )}
          
          {!compiledUrl && (
            <button
              onClick={compile}
              disabled={loading}
              className="px-8 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white disabled:opacity-50 transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.02]">
              {loading ? '합치는 중...' : '🎬 정확한 길이로 클립 합치기'}
            </button>
          )}
          
          {compiledUrl && !finalVideo && (
            <div className="mt-6 space-y-4">
              <div>
                <h3 className="font-semibold mb-3 text-white">합쳐진 영상 미리보기</h3>
                <video src={compiledUrl} controls className="w-full rounded-lg bg-black shadow-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">BGM 분위기 선택</label>
                <select
                  className="border border-gray-600 bg-gray-700 text-white rounded-lg p-2 w-64 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
              >
                {loading ? 'BGM 적용 중...' : '🎵 BGM 적용'}
              </button>
            </div>
          )}
          
          {finalVideo && (
            <div className="mt-8">
              <h3 className="font-semibold mb-3 text-white">🎉 최종 영상</h3>
              <video src={finalVideo} controls className="w-full rounded-lg bg-black mb-4 shadow-lg" />
              <div className="flex gap-3 items-center">
                <a href={finalVideo} download className="inline-block px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.02]">
                  다운로드
                </a>
                <div className="text-sm text-gray-400 flex items-center">
                  길이: {formData?.videoLength || '10초'} | BGM: {bgmMood || '없음'}
                </div>
              </div>
            </div>
          )}

          <details className="mt-8">
            <summary className="cursor-pointer font-semibold text-gray-300 hover:text-white">진행 상황</summary>
            <div className="mt-2 h-48 overflow-auto bg-gray-900 text-green-400 p-3 text-xs font-mono whitespace-pre-wrap rounded-lg border border-gray-700">
              {logs.slice(-400).join('\n')}
            </div>
          </details>

          <div className="mt-6">
            <button onClick={onPrev} className="px-5 py-2 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors">
              이전
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

Step4.propTypes = {
  storyboard: PropTypes.object,
  selectedConceptId: PropTypes.number,
  onPrev: PropTypes.func,
  formData: PropTypes.object
};

export default Step4;

import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const Step3 = ({
  storyboard,
  selectedConceptId,
  setSelectedConceptId,
  onPrev,
  onNext,
  formData,
  user,
  currentProject
}) => {
  const [selectedVideoId, setSelectedVideoId] = useState(selectedConceptId || null);
  const [bgmMood, setBgmMood] = useState('');
  const [bgmMoodList, setBgmMoodList] = useState([]);
  const [bgmAppliedUrl, setBgmAppliedUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);

  const finalVideos = storyboard?.finalVideos || [];

  const log = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
    console.log(`[Step3] ${msg}`);
  };

  useEffect(() => {
    const loadBgmMoodList = async () => {
      try {
        log('BGM 분위기 목록 로드 중...');
        const response = await fetch(`${API_BASE}/nexxii/api/load-mood-list`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.moodList) {
            setBgmMoodList(data.moodList);
            log(`BGM 분위기 ${data.moodList.length}개 로드 완료`);
          }
        } else {
          log('BGM 목록 로드 실패 - 기본값 사용');
          setBgmMoodList([
            { value: 'upbeat', label: '업비트/에너제틱' },
            { value: 'calm', label: '차분한/평화로운' },
            { value: 'dramatic', label: '드라마틱/영화적' },
            { value: 'corporate', label: '기업/프로페셔널' },
            { value: 'inspiring', label: '영감/동기부여' }
          ]);
        }
      } catch (err) {
        log(`BGM 목록 로드 오류: ${err.message}`);
        setBgmMoodList([
          { value: 'upbeat', label: '업비트/에너제틱' },
          { value: 'calm', label: '차분한/평화로운' },
          { value: 'dramatic', label: '드라마틱/영화적' },
          { value: 'corporate', label: '기업/프로페셔널' },
          { value: 'inspiring', label: '영감/동기부여' }
        ]);
      }
    };

    loadBgmMoodList();
  }, []);

  useEffect(() => {
    if (selectedConceptId && !selectedVideoId) {
      setSelectedVideoId(selectedConceptId);
    }
  }, [selectedConceptId, selectedVideoId]);

  const selectedVideo = finalVideos.find(v => v.conceptId === selectedVideoId);

  const handleSelectVideo = (conceptId) => {
    setSelectedVideoId(conceptId);
    setSelectedConceptId(conceptId);
    setBgmAppliedUrl(null);
    log(`컨셉 ${conceptId} 선택됨`);
  };

  const handleApplyBgm = async () => {
    if (!selectedVideo || !bgmMood) {
      setError('영상과 BGM 분위기를 모두 선택해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    log(`BGM 적용 시작 - 분위기: ${bgmMood}`);

    try {
      const response = await fetch(`${API_BASE}/nexxii/api/apply-bgm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: selectedVideo.videoUrl,
          mood: bgmMood,
          videoLength: formData?.videoLength || '10초'
        })
      });

      const result = await response.json();

      if (result.success) {
        setBgmAppliedUrl(result.mergedVideoPath);
        log(`BGM 적용 완료: ${result.mergedVideoPath}`);
      } else {
        throw new Error(result.message || 'BGM 적용 실패');
      }
    } catch (err) {
      setError(`BGM 적용 오류: ${err.message}`);
      log(`BGM 적용 오류: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const downloadUrl = bgmAppliedUrl || selectedVideo?.videoUrl;
    if (!downloadUrl) {
      setError('다운로드할 영상이 없습니다.');
      return;
    }

    log(`다운로드 시작: ${downloadUrl}`);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `upnexx_video_${selectedVideo?.conceptName || 'final'}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGoToEdit = () => {
    if (!selectedVideoId) {
      setError('편집할 영상을 선택해주세요.');
      return;
    }
    setSelectedConceptId(selectedVideoId);
    log(`편집 화면으로 이동 - 컨셉 ID: ${selectedVideoId}`);
    onNext();
  };

  if (finalVideos.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black">
        <div className="max-w-7xl mx-auto p-6">
          <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-8">
            <h2 className="text-3xl font-bold mb-4 text-white">🎬 최종 영상 선택</h2>
            <div className="bg-yellow-900/30 border border-yellow-800 text-yellow-300 p-6 rounded-lg">
              <p className="font-semibold mb-2">아직 생성된 영상이 없습니다.</p>
              <p className="text-sm">이전 단계에서 스토리보드 생성을 완료해주세요.</p>
            </div>
            <div className="mt-6">
              <button
                onClick={onPrev}
                className="px-6 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
              >
                ← 이전 단계
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black">
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2 text-white">🎬 최종 영상 선택 & 완성</h2>
            <p className="text-gray-400">원하는 영상을 선택하고 BGM을 적용하세요</p>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-300 p-4 mb-6 rounded-lg">
              <div className="font-semibold">오류</div>
              <div className="text-sm mt-1">{error}</div>
              <button
                onClick={() => setError(null)}
                className="mt-2 text-xs text-red-400 hover:text-red-300"
              >
                닫기
              </button>
            </div>
          )}

          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">📹 생성된 영상 ({finalVideos.length}개)</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {finalVideos.map((video) => (
                <div
                  key={video.conceptId}
                  onClick={() => !loading && handleSelectVideo(video.conceptId)}
                  className={`border-2 rounded-xl p-4 cursor-pointer transition-all bg-gray-900/50 ${
                    selectedVideoId === video.conceptId
                      ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                      : 'border-gray-700 hover:border-gray-600'
                  } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="aspect-video bg-black rounded-lg overflow-hidden mb-3">
                    <video
                      src={video.videoUrl}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                      onMouseEnter={(e) => e.target.play()}
                      onMouseLeave={(e) => {
                        e.target.pause();
                        e.target.currentTime = 0;
                      }}
                    />
                  </div>
                  <div className="font-semibold text-white mb-1">{video.conceptName}</div>
                  <div className="text-xs text-gray-400">
                    컨셉 {video.conceptId}
                    {video.metadata?.actualCompiledDuration && (
                      <span className="ml-2">| {video.metadata.actualCompiledDuration}초</span>
                    )}
                  </div>
                  {selectedVideoId === video.conceptId && (
                    <div className="mt-2 text-xs text-blue-400 font-medium">✓ 선택됨</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {selectedVideo && (
            <div className="mb-8 bg-gray-900/50 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">
                ✅ 선택된 영상: {selectedVideo.conceptName}
              </h3>
              <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4 max-w-4xl mx-auto">
                <video
                  src={bgmAppliedUrl || selectedVideo.videoUrl}
                  className="w-full h-full"
                  controls
                />
              </div>
              {bgmAppliedUrl && (
                <div className="text-center text-green-400 text-sm mb-4">
                  🎵 BGM이 적용된 영상입니다
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-6 mt-6">
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <h4 className="font-semibold text-white mb-3">🎵 BGM 적용</h4>
                  <select
                    value={bgmMood}
                    onChange={(e) => setBgmMood(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white mb-3 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value="">BGM 분위기 선택</option>
                    {bgmMoodList.map((mood) => (
                      <option key={mood.value} value={mood.value}>
                        {mood.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleApplyBgm}
                    disabled={loading || !bgmMood}
                    className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? '적용 중...' : '🎵 BGM 적용'}
                  </button>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <h4 className="font-semibold text-white mb-3">💾 다운로드 & 편집</h4>
                  <div className="space-y-3">
                    <button
                      onClick={handleDownload}
                      disabled={loading}
                      className="w-full px-4 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                    >
                      📥 영상 다운로드
                    </button>
                    <button
                      onClick={handleGoToEdit}
                      disabled={loading}
                      className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                    >
                      ✏️ 씬별 편집하기 (Step4)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedVideo?.metadata && (
            <details className="mb-6">
              <summary className="cursor-pointer font-semibold text-gray-300 hover:text-white">
                📊 영상 메타데이터
              </summary>
              <div className="mt-2 bg-gray-900 p-4 rounded-lg text-sm text-gray-400 font-mono">
                <pre>{JSON.stringify(selectedVideo.metadata, null, 2)}</pre>
              </div>
            </details>
          )}

          <details className="mb-6">
            <summary className="cursor-pointer font-semibold text-gray-300 hover:text-white">
              📋 진행 로그
            </summary>
            <div className="mt-2 h-32 overflow-auto bg-gray-900 text-green-400 p-3 text-xs font-mono whitespace-pre-wrap rounded-lg border border-gray-700">
              {logs.length === 0 ? '로그가 없습니다.' : logs.join('\n')}
            </div>
          </details>

          <div className="flex justify-between pt-6 border-t border-gray-700">
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
              disabled={loading}
            >
              ← 이전 단계
            </button>
            {!selectedVideo && (
              <div className="text-gray-500 text-sm self-center">
                영상을 선택해주세요
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

Step3.propTypes = {
  storyboard: PropTypes.shape({
    finalVideos: PropTypes.arrayOf(PropTypes.shape({
      conceptId: PropTypes.number.isRequired,
      conceptName: PropTypes.string.isRequired,
      videoUrl: PropTypes.string.isRequired,
      metadata: PropTypes.object
    })),
    styles: PropTypes.array,
    metadata: PropTypes.object
  }),
  selectedConceptId: PropTypes.number,
  setSelectedConceptId: PropTypes.func.isRequired,
  onPrev: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  formData: PropTypes.object,
  user: PropTypes.object,
  currentProject: PropTypes.object
};

export default Step3;

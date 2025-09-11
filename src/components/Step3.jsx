import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const SpinnerOverlay = ({ percent, completedByStatus, ready, total }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center">
    <div className="w-full max-w-lg bg-white/10 rounded p-6 text-white">
      <div className="flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />
      </div>
      <h3 className="text-center text-lg mt-4">영상 제작 중입니다...</h3>

      <div className="mt-4">
        <div className="flex justify-between text-sm text-white/80 mb-1">
          <span>전체 진행률</span>
          <span>{percent}%</span>
        </div>
        <div className="w-full bg-white/20 rounded h-2 overflow-hidden">
          <div className="bg-white h-2 transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>

        <div className="mt-3 text-sm text-white/80">
          상태 완료: {completedByStatus}/{total} · URL 준비: {ready}/{total}
        </div>
      </div>

      <p className="mt-4 text-center text-white/80 text-sm">브라우저를 닫지 마세요.</p>
    </div>
  </div>
);

SpinnerOverlay.propTypes = {
  percent: PropTypes.number,
  completedByStatus: PropTypes.number,
  ready: PropTypes.number,
  total: PropTypes.number,
};

const Step3 = ({ formData, storyboard, onPrev, setIsLoading, isLoading }) => {
  const styles = Array.isArray(storyboard) ? storyboard : (storyboard?.storyboard ?? []);

  const [selectedStyle, setSelectedStyle] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);

  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoError, setVideoError] = useState(null);

  const [totalSegments, setTotalSegments] = useState(0);
  const [completedByStatus, setCompletedByStatus] = useState(0);
  const [readyWithUrl, setReadyWithUrl] = useState(0);
  const [overallPercent, setOverallPercent] = useState(0);
  const [progressMap, setProgressMap] = useState({});
  const [allCompletedAt, setAllCompletedAt] = useState(null);

  const isBusy = isGeneratingVideo || isLoading;
  const noData = !Array.isArray(styles) || styles.length === 0;

  useEffect(() => {
    if (selectedStyle && Array.isArray(selectedStyle.images)) {
      setSelectedImages(selectedStyle.images);
    }
  }, [selectedStyle]);

  const handleStyleSelect = (styleData) => {
    if (isGeneratingVideo) return;
    setSelectedStyle(styleData);
    setSelectedImages(styleData.images || []);
  };

  const handleImageToggle = (imageId) => {
    if (isGeneratingVideo) return;
    setSelectedImages((prev) => {
      if (prev.some((img) => img.id === imageId)) {
        return prev.filter((img) => img.id !== imageId);
      } else {
        const imageToAdd = (selectedStyle?.images || []).find((img) => img.id === imageId);
        return imageToAdd ? [...prev, imageToAdd] : prev;
      }
    });
  };

  const startVideoGeneration = async () => {
    if (!selectedStyle) {
      alert('스타일을 먼저 선택해주세요.');
      return;
    }
    if (selectedImages.length === 0) {
      alert('최소 1개 이상의 이미지를 선택해주세요.');
      return;
    }

    setIsGeneratingVideo(true);
    setIsLoading?.(true);
    setVideoError(null);
    setProgressMap({});
    setTotalSegments(selectedImages.length);
    setCompletedByStatus(0);
    setReadyWithUrl(0);
    setOverallPercent(0);
    setAllCompletedAt(null);

    try {
      // 1) 비디오 생성 시작
      const response = await fetch(`${API_BASE}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedStyle: selectedStyle.style || selectedStyle.name || 'Default',
          selectedImages: selectedImages,
          formData: formData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `서버 오류: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) throw new Error(data.error || '영상 생성에 실패했습니다.');

      const tasks = (Array.isArray(data.tasks) ? data.tasks : []).map((t) => ({
        taskId: t.taskId,
        sceneNumber: t.sceneNumber,
        duration: t.duration,
        title: t.title,
      }));

      if (tasks.length === 0) {
        setIsGeneratingVideo(false);
        setIsLoading?.(false);
        setVideoError('생성 요청은 성공했지만 세그먼트가 비었습니다.');
        return;
      }

      setTotalSegments(tasks.length);

      // 2) 상태 폴링 (미완료만)
      let pollTimer = null;

      const tick = async () => {
        const pending = tasks.filter((t) => progressMap[t.sceneNumber] !== 'completed');
        if (pending.length === 0) {
          clearInterval(pollTimer);
          setIsGeneratingVideo(false);
          setIsLoading?.(false);
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
            console.warn('비디오 상태 조회 실패:', r.status, txt);
            return;
          }

          const result = await r.json();
          const segments = Array.isArray(result?.segments) ? result.segments : [];

          const map = { ...progressMap };
          let byStatus = 0;
          let withUrl = 0;

          for (const s of segments) {
            const status = String(s.status || '').toLowerCase();
            map[s.sceneNumber] = status;
            if (status === 'completed') {
              byStatus++;
              if (s.videoUrl) withUrl++;
            }
          }

          setProgressMap(map);
          const total = result?.summary?.total ?? tasks.length;
          setCompletedByStatus(byStatus);
          setReadyWithUrl(withUrl);
          setOverallPercent(total ? Math.round((byStatus / total) * 100) : 0);

          const allDoneByStatus = byStatus === total;
          if (allDoneByStatus && !allCompletedAt) {
            setAllCompletedAt(Date.now());
          }

          const graceMs = 90_000;
          const gracePassed =
            allDoneByStatus && allCompletedAt && Date.now() - allCompletedAt >= graceMs;

          if (allDoneByStatus && (withUrl === total || gracePassed)) {
            clearInterval(pollTimer);
            setIsGeneratingVideo(false);
            setIsLoading?.(false);
          }
        } catch (e) {
          console.warn('폴링 예외:', e?.message || e);
        }
      };

      await tick();
      pollTimer = setInterval(tick, 5000);

      // 안전 타임아웃
      setTimeout(() => {
        if (pollTimer) clearInterval(pollTimer);
        setIsGeneratingVideo(false);
        setIsLoading?.(false);
        console.log('폴링 타임아웃');
      }, 10 * 60 * 1000);
    } catch (error) {
      console.error('영상 생성 실패:', error);
      setVideoError(error.message);
      setIsGeneratingVideo(false);
      setIsLoading?.(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      {isBusy && (
        <SpinnerOverlay
          percent={overallPercent}
          completedByStatus={completedByStatus}
          ready={readyWithUrl}
          total={totalSegments}
        />
      )}

      <div className={`bg-white rounded-lg shadow-lg p-6 ${isBusy ? 'pointer-events-none opacity-50' : ''}`}>
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">3단계: 스타일 선택 및 영상 생성</h2>
          <p className="text-gray-600">
            스토리보드의 스타일을 선택하고, 해당 스타일의 이미지들을 영상으로 변환합니다.
          </p>
        </div>

        {videoError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded p-3">
            {videoError}
          </div>
        )}

        {noData ? (
          <div className="p-6 text-center text-gray-600 border rounded">
            스토리보드가 아직 준비되지 않았습니다. 이전 단계에서 스토리보드를 먼저 생성하세요.
          </div>
        ) : (
          <>
            {/* 스타일 리스트 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {styles.map((style) => (
                <div
                  key={style.style || style.name}
                  className={`border rounded p-3 cursor-pointer ${selectedStyle?.style === style.style || selectedStyle?.name === style.name ? 'ring-2 ring-blue-500' : 'hover:border-gray-400'}`}
                  onClick={() => handleStyleSelect(style)}
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

            {/* 이미지 선택 */}
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
                        className={`relative block border rounded overflow-hidden ${
                          checked ? 'ring-2 ring-blue-500' : 'hover:border-gray-400'
                        }`}
                      >
                        <img
                          src={img.thumbnail || img.url}
                          alt={img.title}
                          className="w-full h-32 object-cover"
                        />
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

            {/* 액션 바 */}
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
                onClick={startVideoGeneration}
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

import { useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const SpinnerOverlay = ({ message = '스토리보드를 생성하는 중입니다...', sub = 'Gemini가 브리프/프롬프트를 만들고, Freepik이 이미지를 생성 중입니다.' }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center">
    <div className="w-full max-w-lg bg-white/10 rounded p-6 text-white">
      <div className="flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
      </div>
      <h3 className="text-center text-lg mt-4">{message}</h3>
      <p className="text-center text-white/80 text-sm mt-2">{sub}</p>
    </div>
  </div>
);

SpinnerOverlay.propTypes = {
  message: PropTypes.string,
  sub: PropTypes.string,
};

function imagesPerStyle(videoLength) {
  const n = Math.max(1, Math.floor(Number(videoLength || 10) / 2)); // 2초당 1장
  return n;
}

async function runWithConcurrency(tasks, limit, onProgress) {
  let i = 0;
  let completed = 0;
  const results = new Array(tasks.length);
  const workers = new Array(Math.min(limit, tasks.length)).fill(0).map(async () => {
    while (true) {
      const current = i++;
      if (current >= tasks.length) break;
      try {
        results[current] = await tasks[current]();
      } catch (e) {
        results[current] = { ok: false, error: e?.message || 'unknown error' };
      } finally {
        completed++;
        onProgress?.(completed, tasks.length);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('idle'); // idle | generating | done
  const [progress, setProgress] = useState(0);

  const isBusy = isLoading || currentPhase === 'generating';

  const updatePhase = (phase, p) => {
    setCurrentPhase(phase);
    if (typeof p === 'number') {
      const clamped = Math.max(0, Math.min(100, Math.round(p)));
      setProgress(clamped);
    }
  };

  const handleGenerateStoryboard = async () => {
    setIsLoading?.(true);
    setError(null);
    setDebugInfo(null);
    setProgress(0);
    updatePhase('generating', 1);

    try {
      // 1) 서버에 스토리보드 생성 요청 (public/*.txt 프롬프트 체인 그대로 사용)
      const initRes = await fetch(`${API_BASE}/api/storyboard-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData }),
      });
      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        throw new Error(err?.error || `init failed: ${initRes.status}`);
      }

      const initData = await initRes.json();
      const { imagePrompts, styles, metadata } = initData;

      const perStyleCount = imagesPerStyle(formData.videoLength);
      const promptsToUse = (imagePrompts || []).slice(0, perStyleCount);

      setDebugInfo({
        sceneCountPerStyle: perStyleCount,
        stylesCount: styles?.length || 0,
      });

      updatePhase('generating', 10);

      // 2) 각 스타일별로 이미지 생성 (프롬프트 "그대로" 전달)
      const storyboard = [];

      for (const style of styles) {
        const images = [];
        const tasks = promptsToUse.map((p, idx) => async () => {
          const promptToSend = p.prompt; // 절대 변형/주입 금지

          const res = await fetch(`${API_BASE}/api/storyboard-render-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: promptToSend,
              sceneNumber: p.sceneNumber,
              title: p.title,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            images.push({
              id: `${style.name?.toLowerCase?.().replace(/\s+/g, '-') || 'style'}-${idx + 1}`,
              title: p.title,
              url: data.url,
              thumbnail: data.url,
              prompt: promptToSend,
              duration: p.duration,
              sceneNumber: p.sceneNumber,
            });
          } else {
            const text = await res.text().catch(() => '');
            console.warn('이미지 생성 실패:', text);
          }
        });

        // 동시성 4로 생성
        await runWithConcurrency(tasks, 4, (done, total) => {
          const base = 10;
          const span = 80;
          const localProgress = Math.round((done / total) * span);
          updatePhase('generating', base + localProgress);
        });

        images.sort((a, b) => a.sceneNumber - b.sceneNumber);

        storyboard.push({
          style: style.name,
          description: style.description,
          colorPalette: style.colorPalette,
          images,
          status: images.length > 0 ? 'success' : 'empty',
        });
      }

      // 3) 상위 상태에 결과 저장 후 다음 단계로
      setStoryboard?.({
        success: true,
        storyboard,
        imagePrompts,
        metadata: {
          ...metadata,
          perStyleCount,
          createdAt: new Date().toISOString(),
        },
      });

      updatePhase('done', 100);
      setIsLoading?.(false);
      onNext?.();
    } catch (e) {
      console.error('Step2 오류:', e);
      setError(e.message);
      setIsLoading?.(false);
      updatePhase('idle', 0);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      {isBusy && <SpinnerOverlay />}

      <div className={`bg-white rounded-lg shadow-lg p-6 ${isBusy ? 'pointer-events-none opacity-50' : ''}`}>
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">2단계: 스토리보드 생성</h2>
          <p className="text-gray-600">
            입력한 브랜드 정보와 영상 길이에 맞춰, 각 스타일별로 장면당 이미지를 생성합니다.
            장면 수는 영상 길이를 2초로 나눈 값입니다.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded p-3">
            {error}
          </div>
        )}

        {debugInfo && (
          <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 rounded p-3 text-sm">
            스타일 수: {debugInfo.stylesCount} · 스타일당 장면 수: {debugInfo.sceneCountPerStyle}
          </div>
        )}

        {/* 진행률 바 */}
        {currentPhase === 'generating' && (
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>진행률</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded h-2 overflow-hidden">
              <div className="bg-blue-600 h-2 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* 액션 바 */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              이전 단계
            </button>
          </div>

          <button
            onClick={handleGenerateStoryboard}
            disabled={isBusy}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            스토리보드 생성 시작
          </button>
        </div>
      </div>
    </div>
  );
};

Step2.propTypes = {
  onNext: PropTypes.func,
  onPrev: PropTypes.func,
  formData: PropTypes.object,
  setStoryboard: PropTypes.func,
  setIsLoading: PropTypes.func,
  isLoading: PropTypes.bool,
};

export default Step2;

import { useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''; // 예: https://api.yourdomain.com 또는 http://EC2:3000

const Spinner = () => (
  <div className="flex flex-col justify-center items-center text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
    <p className="mt-4 text-lg text-white/90">
      스토리보드를 생성하는 중입니다...
    </p>
    <p className="text-sm text-white/70 mt-2">
      Gemini가 브리프/프롬프트를 만들고, Freepik이 이미지를 생성 중입니다.
    </p>
  </div>
);

const PLACEHOLDERS = [
  // via.placeholder.com 일부 환경 문제 → placehold.co 사용
  `https://placehold.co/800x450/3B82F6/FFFFFF?text=${encodeURIComponent('Business Professional')}`,
  `https://placehold.co/800x450/10B981/FFFFFF?text=${encodeURIComponent('Product Showcase')}`,
  `https://placehold.co/800x450/F59E0B/FFFFFF?text=${encodeURIComponent('Lifestyle Scene')}`,
  `https://placehold.co/800x450/EF4444/FFFFFF?text=${encodeURIComponent('Call To Action')}`,
  `https://placehold.co/800x450/8B5CF6/FFFFFF?text=${encodeURIComponent('Brand Identity')}`,
  `https://placehold.co/800x450/06B6D4/FFFFFF?text=${encodeURIComponent('Customer Happy')}`,
];

function getImageCountByVideoLength(videoLength) {
  const map = { '10초': 5, '30초': 15, '60초': 30 };
  return map[videoLength] || 15;
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
      // 1) Init: 브리프/컨셉/이미지 프롬프트/스타일 목록
      const initRes = await fetch(`${API_BASE}/api/storyboard-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData })
      });

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => null);
        throw new Error(err?.error || `storyboard-init 실패: ${initRes.status}`);
      }

      const initData = await initRes.json();
      if (!initData?.success) {
        throw new Error(initData?.error || '브리프/프롬프트 생성 실패');
      }

      const styles = initData.styles || [];
      const imagePrompts = initData.imagePrompts || [];
      const imageCountPerStyle =
        initData?.metadata?.imageCountPerStyle || getImageCountByVideoLength(formData.videoLength);

      if (!styles.length || !imagePrompts.length) {
        throw new Error('초기 데이터가 올바르지 않습니다. (styles/imagePrompts 없음)');
      }

      setDebugInfo({
        totalStyles: styles.length,
        imageCountPerStyle,
        geminiModel: initData?.metadata?.geminiModel || 'n/a',
        fallbackModel: initData?.metadata?.fallbackGeminiModel || '',
        modelChain: initData?.metadata?.geminiModelChain || []
      });
      updatePhase('generating', 10);

      // 2) 이미지 생성: styleName 필수
      const promptsToUse = imagePrompts.slice(0, imageCountPerStyle);
      const totalImages = styles.length * promptsToUse.length;
      let produced = 0;

      const storyboard = [];

      for (const style of styles) {
        const tasks = promptsToUse.map((p, idx) => async () => {
          const body = {
            prompt: p?.prompt,
            styleName: style.name,
            sceneNumber: p?.sceneNumber,
            title: p?.title
          };

          try {
            const res = await fetch(`${API_BASE}/api/storyboard-render-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });

            let url = '';
            if (res.ok) {
              const data = await res.json();
              url = data?.url || '';
            }

            if (!url) {
              // 실패 시 플레이스홀더
              url = PLACEHOLDERS[idx % PLACEHOLDERS.length];
            }

            produced++;
            const pctCore = 10 + (produced / totalImages) * 80; // 10 → 90
            updatePhase('generating', pctCore);

            return {
              id: `${style.name.toLowerCase().replace(/\s+/g, '-')}-${idx + 1}`,
              title: p?.title || `Scene ${p?.sceneNumber || idx + 1}`,
              url,
              thumbnail: url,
              prompt: `${p?.prompt || ''}, ${style.description}`,
              duration: p?.duration,
              sceneNumber: p?.sceneNumber || idx + 1
            };
          } catch (e) {
            produced++;
            const pctCore = 10 + (produced / totalImages) * 80;
            updatePhase('generating', pctCore);

            // 완전 실패 시에도 플레이스홀더
            return {
              id: `${style.name.toLowerCase().replace(/\s+/g, '-')}-${idx + 1}`,
              title: p?.title || `Scene ${p?.sceneNumber || idx + 1}`,
              url: PLACEHOLDERS[idx % PLACEHOLDERS.length],
              thumbnail: PLACEHOLDERS[idx % PLACEHOLDERS.length],
              prompt: `${p?.prompt || ''}, ${style.description}`,
              duration: p?.duration,
              sceneNumber: p?.sceneNumber || idx + 1
            };
          }
        });

        const images = await runWithConcurrency(tasks, 3, () => {}); // 동시 3개
        images.sort((a, b) => (a.sceneNumber || 0) - (b.sceneNumber || 0));

        storyboard.push({
          style: style.name,
          description: style.description,
          colorPalette: style.colorPalette,
          images,
          searchQuery: `${formData.brandName} ${formData.industryCategory} advertisement`,
          status: images.length > 0 ? 'success' : 'fallback'
        });
      }

      // 최종 결과 반영
      setStoryboard?.({
        success: true,
        creativeBrief: initData.creativeBrief,
        storyboardConcepts: initData.storyboardConcepts,
        imagePrompts: promptsToUse,
        storyboard,
        metadata: {
          ...(initData?.metadata || {}),
          successCount: storyboard.filter(s => s.status === 'success').length,
          fallbackCount: storyboard.filter(s => s.status === 'fallback').length,
          processSteps: 4
        }
      });

      updatePhase('done', 100);

      // 생성 완료 후 바로 다음 단계로 이동
      onNext?.();
    } catch (e) {
      console.error('스토리보드 생성 오류:', e);
      setError(e?.message || '스토리보드 생성 중 오류가 발생했습니다.');
      updatePhase('idle', 0);
    } finally {
      setIsLoading?.(false);
    }
  };

  return (
    <div className="w-full">
      {/* 상단 헤더/설명 */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold">2단계: 스토리보드 생성</h2>
        <p className="text-gray-600 mt-1">
          제공한 정보로 AI가 스토리보드와 이미지를 자동 생성합니다.
        </p>
      </div>

      {/* 디버그 정보 */}
      {debugInfo && (
        <div className="mb-4 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded p-3">
          <div>스타일 개수: {debugInfo.totalStyles}</div>
          <div>스타일당 이미지 수: {debugInfo.imageCountPerStyle}</div>
          <div>Gemini 모델: {debugInfo.geminiModel} {debugInfo.fallbackModel ? `(fallback: ${debugInfo.fallbackModel})` : ''}</div>
        </div>
      )}

      {/* 에러 알림 */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded p-3">
          {error}
        </div>
      )}

      {/* 진행 바 */}
      <div className="w-full h-2 bg-gray-200 rounded overflow-hidden mb-4">
        <div
          className="h-2 bg-blue-600 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={`px-4 py-2 rounded border ${isBusy ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white hover:bg-gray-50'} `}
          onClick={onPrev}
          disabled={isBusy}
          title={isBusy ? '생성 중에는 이전 단계로 이동할 수 없습니다.' : '이전 단계로 이동'}
        >
          이전 단계
        </button>

        <button
          type="button"
          className={`px-4 py-2 rounded text-white ${isBusy ? 'bg-blue-300 cursor-wait' : 'bg-blue-600 hover:bg-blue-700'}`}
          onClick={handleGenerateStoryboard}
          disabled={isBusy}
          title={isBusy ? '생성 중입니다...' : '스토리보드 자동 생성 시작'}
        >
          {isBusy ? '생성 중...' : '스토리보드 생성'}
        </button>

        <button
          type="button"
          className={`ml-auto px-4 py-2 rounded border ${isBusy ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}`}
          onClick={() => window.location.reload()}
          disabled={isBusy}
          title={isBusy ? '생성 중에는 새로 시작할 수 없습니다.' : '초기 상태로 새로 시작'}
        >
          새로 시작
        </button>
      </div>

      {/* 전체 화면 오버레이(생성 중) */}
      {(isBusy) && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
          role="alert"
          aria-live="assertive"
        >
          <div className="w-full max-w-md p-6">
            <Spinner />
            <div className="mt-6 w-full h-2 bg-white/20 rounded overflow-hidden">
              <div
                className="h-2 bg-white transition-all duration-300"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>
            <p className="mt-3 text-center text-white/80 text-sm">
              진행률 {Math.max(5, Math.round(progress))}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

Step2.propTypes = {
  onNext: PropTypes.func,
  onPrev: PropTypes.func,
  formData: PropTypes.object.isRequired,
  setStoryboard: PropTypes.func,
  setIsLoading: PropTypes.func,
  isLoading: PropTypes.bool
};

export default Step2;

import { useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''; // 예: https://api.yourdomain.com 또는 http://EC2:3000

const Spinner = () => (
  <div className="flex flex-col justify-center items-center text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600"></div>
    <p className="mt-4 text-lg text-gray-700">
      AI를 활용하여 스토리보드를 생성하는 중입니다.
    </p>
    <p className="text-sm text-gray-500 mt-2">
      Gemini AI가 브리프/프롬프트를 만들고, Freepik API가 이미지를 생성합니다.
    </p>
  </div>
);

const PLACEHOLDERS = [
  // via.placeholder.com 이 일부 환경에서 DNS 실패 → placehold.co로 변경
  // 텍스트는 URL 인코딩
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

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  const [currentPhase, setCurrentPhase] = useState('');
  const [progress, setProgress] = useState(0);

  const updatePhase = (phase, p) => {
    setCurrentPhase(phase);
    if (typeof p === 'number') setProgress(Math.max(0, Math.min(100, Math.round(p))));
  };

  const handleGenerateStoryboard = async () => {
    setIsLoading(true);
    setError(null);
    setDebugInfo(null);
    setProgress(0);

    try {
      // 1) Init: 브리프/컨셉/이미지 프롬프트/스타일 목록
      updatePhase('브리프/프롬프트 생성 준비...', 5);

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
        fallbackModel: initData?.metadata?.fallbackGeminiModel || ''
      });
      updatePhase('브리프/프롬프트 생성 완료', 20);

      // 2) 이미지 생성: styleName 필수! (서버가 prompt + styleName 없으면 400)
      const totalImages = styles.length * imageCountPerStyle;

      const makeTask = (styleIndex, imgIndex) => async () => {
        const style = styles[styleIndex];
        const ip = imagePrompts[imgIndex];

        // 서버 요구 바디: { prompt, styleName, sceneNumber?, title? }
        const body = {
          prompt: ip?.prompt,
          styleName: style?.name,  // 중요: style.name을 styleName으로!
          sceneNumber: ip?.sceneNumber,
          title: ip?.title
        };

        let attempt = 0;
        const maxAttempts = 2;
        while (attempt < maxAttempts) {
          attempt++;
          try {
            const r = await fetch(`${API_BASE}/api/storyboard-render-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            const text = await r.text();
            let data = null;
            try { data = JSON.parse(text); } catch { /* ignore */ }

            if (!r.ok) {
              const msg = data?.error || text || `HTTP ${r.status}`;
              throw new Error(msg);
            }

            if (data?.success && data?.url) {
              return {
                ok: true,
                styleIndex,
                imageIndex: imgIndex,
                sceneNumber: ip?.sceneNumber,
                duration: ip?.duration,
                title: ip?.title,
                url: data.url,
                thumbnail: data.thumbnail || data.url,
                prompt: data.prompt || ip?.prompt,
              };
            }
            throw new Error(data?.error || '이미지 생성 실패');
          } catch (e) {
            if (attempt >= maxAttempts) {
              const ph = PLACEHOLDERS[(imgIndex % PLACEHOLDERS.length)];
              return {
                ok: false,
                styleIndex,
                imageIndex: imgIndex,
                sceneNumber: ip?.sceneNumber,
                duration: ip?.duration,
                title: ip?.title,
                url: ph,
                thumbnail: ph,
                prompt: ip?.prompt,
                isFallback: true,
                error: e?.message || 'unknown'
              };
            }
            await sleep(1200);
          }
        }
      };

      const tasks = [];
      for (let s = 0; s < styles.length; s++) {
        for (let i = 0; i < imageCountPerStyle; i++) {
          tasks.push(makeTask(s, i));
        }
      }

      updatePhase('이미지 생성 시작...', 25);

      const results = await runWithConcurrency(tasks, 2, (completed, total) => {
        const p = 25 + (completed / total) * 70;
        const curStyle = Math.min(styles.length, Math.floor(completed / imageCountPerStyle) + 1);
        setCurrentPhase(`이미지 생성 중... (스타일 ${curStyle}/${styles.length}, 전체 ${completed}/${total})`);
        setProgress(Math.round(p));
      });

      const storyboard = styles.map((st, idx) => {
        const imgs = results
          .filter((r) => r?.styleIndex === idx)
          .sort((a, b) => (a.imageIndex ?? 0) - (b.imageIndex ?? 0))
          .map((r, k) => ({
            id: `${st.name.toLowerCase().replace(/\s+/g, '-')}-${k + 1}`,
            title: r.title || `Scene ${k + 1}`,
            url: r.url,
            thumbnail: r.thumbnail,
            prompt: r.prompt,
            duration: r.duration || 6,
            sceneNumber: r.sceneNumber || (k + 1),
            isFallback: !!r.isFallback
          }));

        return {
          style: st.name,
          description: st.description,
          colorPalette: st.colorPalette,
          images: imgs,
          status: imgs.some((i) => !i.isFallback) ? 'success' : 'fallback'
        };
      });

      setDebugInfo((prev) => ({
        ...prev,
        successCount: storyboard.filter((s) => s.status === 'success').length,
        fallbackCount: storyboard.filter((s) => s.status === 'fallback').length
      }));

      updatePhase('최종 정리 중...', 98);
      setStoryboard(storyboard);
      updatePhase('완료!', 100);

      setTimeout(() => onNext(), 600);
    } catch (e) {
      console.error('스토리보드 생성 실패:', e);
      let msg = '스토리보드 생성 중 오류가 발생했습니다.';
      if (e?.message) msg = e.message;
      setError(msg);
      setProgress(0);
      setCurrentPhase('');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <Spinner />
        {currentPhase && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium text-blue-800">{currentPhase}</h4>
              <span className="text-sm text-blue-600">{progress}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        {debugInfo && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-green-800 mb-2">처리 현황</h4>
            <div className="text-sm text-green-700 space-y-1">
              <p>총 스타일: {debugInfo.totalStyles}개</p>
              {debugInfo.imageCountPerStyle && <p>스타일당 이미지: {debugInfo.imageCountPerStyle}개</p>}
              {typeof debugInfo.successCount === 'number' && <p>성공: {debugInfo.successCount}개</p>}
              {typeof debugInfo.fallbackCount === 'number' && <p>대체 스타일: {debugInfo.fallbackCount}개</p>}
              {debugInfo.geminiModel && <p>Gemini 모델: {debugInfo.geminiModel}{debugInfo.fallbackModel ? ` (fallback: ${debugInfo.fallbackModel})` : ''}</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">
        2단계: AI 스토리보드 생성
      </h2>

      {/* 입력 정보 요약 (원본 유지) */}
      {/* ... 생략: 기존 UI 동일 ... */}

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L9.414 10l1.293-1.293a1 1 0 10-1.414-1.414L7.586 8.586 6.293 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">스토리보드 생성 오류</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => setError(null)}
                  className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded hover:bg-red-200 transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <button
          onClick={onPrev}
          className="flex items-center px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors shadow-md"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          이전 단계
        </button>

        <div className="text-center">
          <div className="text-sm text-gray-500 mb-2">예상 소요시간: 2~5분</div>
          <div className="text-xs text-gray-400">AI 처리 + 이미지 생성 (동시 2개)</div>
        </div>

        <button
          onClick={handleGenerateStoryboard}
          disabled={isLoading}
          className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              생성 중...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              🚀 AI 스토리보드 생성
            </>
          )}
        </button>
      </div>

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-yellow-800">참고사항</h4>
            <div className="text-sm text-yellow-700 mt-1 space-y-1">
              <p>• 긴 작업을 나눠 호출하여 504를 방지합니다.</p>
              <p>• 일부 이미지는 대체 이미지로 채워질 수 있습니다.</p>
              <p>• 네트워크/Freepik 대기시간에 따라 시간이 달라질 수 있습니다.</p>
              <p>• EC2 API를 사용하려면 VITE_API_BASE_URL을 설정하세요.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

Step2.propTypes = {
  onNext: PropTypes.func.isRequired,
  onPrev: PropTypes.func.isRequired,
  formData: PropTypes.object.isRequired,
  setStoryboard: PropTypes.func.isRequired,
  setIsLoading: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired
};

export default Step2;

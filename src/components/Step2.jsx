import { useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const SpinnerOverlay = ({ title, percent, lines }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center">
    <div className="w-full max-w-2xl bg-white/10 rounded p-6 text-white">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="text-sm text-white/80">{percent}%</span>
      </div>
      <div className="w-full bg-white/20 rounded h-2 mt-3 overflow-hidden">
        <div className="bg-white h-2 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <details className="mt-4 text-sm text-white/90" open>
        <summary className="cursor-pointer select-none">세부 로그</summary>
        <div className="mt-2 h-40 overflow-auto bg-black/40 rounded p-2 font-mono text-xs whitespace-pre-wrap">
          {(lines || []).slice(-200).join('\n')}
        </div>
      </details>
    </div>
  </div>
);

SpinnerOverlay.propTypes = {
  title: PropTypes.string,
  percent: PropTypes.number,
  lines: PropTypes.arrayOf(PropTypes.string),
};

function imagesPerStyle(videoLength) {
  return Math.max(1, Math.floor(Number(videoLength || 10) / 2)); // 2초당 1장
}

async function runWithConcurrency(tasks, limit, onStep) {
  let i = 0;
  let done = 0;
  const results = new Array(tasks.length);
  const workers = new Array(Math.min(limit, tasks.length)).fill(0).map(async () => {
    while (true) {
      const cur = i++;
      if (cur >= tasks.length) break;
      try {
        results[cur] = await tasks[cur]();
      } catch (e) {
        results[cur] = { ok: false, error: e?.message || 'unknown' };
      } finally {
        done++;
        onStep?.(done, tasks.length);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [error, setError] = useState(null);
  const [percent, setPercent] = useState(0);
  const [logs, setLogs] = useState([]);
  const [imagesDone, setImagesDone] = useState(0);
  const [imagesFail, setImagesFail] = useState(0);
  const [imagesTotal, setImagesTotal] = useState(0);
  const [debugInfo, setDebugInfo] = useState(null);

  const isBusy = isLoading;

  const log = (msg) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleGenerateStoryboard = async () => {
    setIsLoading?.(true);
    setError(null);
    setLogs([]);
    setPercent(0);
    setImagesDone(0);
    setImagesFail(0);
    setImagesTotal(0);
    setDebugInfo(null);

    try {
      // 1) 서버에 스토리보드 요청
      log('1/2 스토리보드(프롬프트 체인) 시작');
      setPercent(5);

      const initRes = await fetch(`${API_BASE}/api/storyboard-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData }),
      });

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        log(`스토리보드 실패: ${initRes.status} ${err?.error || ''}`);
        throw new Error(err?.error || `init failed: ${initRes.status}`);
      }

      const initData = await initRes.json();
      const { imagePrompts, styles, metadata } = initData;

      const perStyle = imagesPerStyle(formData.videoLength);
      const promptsToUse = (imagePrompts || []).slice(0, perStyle);
      const totalImages = (styles?.length || 0) * (promptsToUse?.length || 0);
      setImagesTotal(totalImages);

      setDebugInfo({
        stylesCount: styles?.length || 0,
        perStyleScenes: perStyle,
        videoLength: formData.videoLength,
      });

      log(`스토리보드 완료: 스타일 ${styles.length}개, 스타일당 장면 ${perStyle}개, 총 이미지 ${totalImages}개`);
      setPercent(20);

      // 2) 이미지 생성(프롬프트 그대로 전달)
      log('2/2 이미지 생성 시작');
      const storyboard = [];

      for (const style of styles) {
        const images = [];
        let localDone = 0;

        const tasks = promptsToUse.map((p, idx) => async () => {
          const promptToSend = p.prompt;

          try {
            log(`이미지 생성 요청: [${style.name}] Scene ${p.sceneNumber}`);
            const res = await fetch(`${API_BASE}/api/storyboard-render-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: promptToSend,
                sceneNumber: p.sceneNumber,
                title: p.title,
              }),
            });

            if (!res.ok) {
              const txt = await res.text().catch(() => '');
              setImagesFail((f) => f + 1);
              localDone++;
              const cur = Math.min(100, Math.round(20 + ((imagesDone + localDone + imagesFail) / totalImages) * 80));
              setPercent(cur);
              log(`이미지 생성 실패: [${style.name}] Scene ${p.sceneNumber} - ${res.status} ${txt}`);
              return;
            }

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
            setImagesDone((d) => d + 1);
            localDone++;
            const cur = Math.min(100, Math.round(20 + ((imagesDone + localDone + imagesFail) / totalImages) * 80));
            setPercent(cur);
            log(`이미지 생성 완료: [${style.name}] Scene ${p.sceneNumber} -> ${data.url}`);
          } catch (e) {
            setImagesFail((f) => f + 1);
            localDone++;
            const cur = Math.min(100, Math.round(20 + ((imagesDone + localDone + imagesFail) / totalImages) * 80));
            setPercent(cur);
            log(`이미지 생성 예외: [${style.name}] Scene ${p.sceneNumber} - ${e?.message || e}`);
          }
        });

        await runWithConcurrency(tasks, 4, (done, total) => {
          const cur = Math.min(100, Math.round(20 + ((imagesDone + imagesFail + done) / totalImages) * 80));
          setPercent(cur);
        });

        images.sort((a, b) => a.sceneNumber - b.sceneNumber);

        storyboard.push({
          style: style.name,
          description: style.description,
          colorPalette: style.colorPalette,
          images,
        });
      }

      // 완료
      setPercent(100);
      log(`이미지 생성 완료: 성공 ${imagesDone} / 실패 ${imagesFail} / 총 ${imagesTotal}`);

      setStoryboard?.({
        success: true,
        storyboard,
        imagePrompts,
        metadata: {
          ...metadata,
          perStyleCount: perStyle,
          createdAt: new Date().toISOString(),
        },
      });

      setIsLoading?.(false);
      onNext?.();
    } catch (e) {
      console.error('Step2 오류:', e);
      log(`오류: ${e.message}`);
      setError(e.message);
      setIsLoading?.(false);
      setPercent(0);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      {isBusy && <SpinnerOverlay title="스토리보드/이미지 생성 중..." percent={percent} lines={logs} />}

      <div className={`bg-white rounded-lg shadow-lg p-6 ${isBusy ? 'pointer-events-none opacity-50' : ''}`}>
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">2단계: 스토리보드 생성</h2>
          <p className="text-gray-600">
            public/input_prompt.txt, second_prompt.txt, third_prompt.txt를 그대로 사용해 스토리보드를 만들고,
            장면당 이미지를 생성합니다. 장면 수 = 영상길이 ÷ 2초.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded p-3">
            {error}
          </div>
        )}

        {debugInfo && (
          <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 rounded p-3 text-sm">
            스타일 수: {debugInfo.stylesCount} · 스타일당 장면 수: {debugInfo.perStyleScenes} · 전체 이미지: {imagesTotal}
            <br />
            진행(실시간): 성공 {imagesDone} · 실패 {imagesFail}
          </div>
        )}

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

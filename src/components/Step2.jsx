// 스타일별 이미지 개수 = (영상길이 ÷ 2). public/*.txt 기반 3단계 결과 사용.
import { useState } from 'react';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function imagesPerStyle(videoLength) {
  const n = Math.max(1, Math.floor(Number(videoLength || 10) / 2));
  return n;
}

export default function Step2({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) {
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  const handleGenerateStoryboard = async () => {
    setIsLoading?.(true);
    setError(null); setProgress(0);

    try {
      const r = await fetch(`${API_BASE}/api/storyboard-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData })
      });
      if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || `init ${r.status}`);

      const { imagePrompts, styles, metadata } = await r.json();
      const perStyle = imagesPerStyle(formData.videoLength);
      const promptsToUse = (imagePrompts || []).slice(0, perStyle);

      const storyboard = [];
      for (const style of styles) {
        const images = [];
        const tasks = promptsToUse.map((p, i) => async () => {
          const compositePrompt = [
            p.prompt,
            `style: ${style.name}`,
            style.description,
            style.colorPalette && `palette: ${style.colorPalette}`,
          ].filter(Boolean).join(', ');

          const res = await fetch(`${API_BASE}/api/storyboard-render-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: compositePrompt, styleName: style.name, sceneNumber: p.sceneNumber, title: p.title })
          });
          if (res.ok) {
            const data = await res.json();
            images.push({
              id: `${style.name}-${i + 1}`,
              title: p.title, url: data.url, thumbnail: data.url,
              prompt: compositePrompt, duration: p.duration, sceneNumber: p.sceneNumber
            });
          }
          setProgress(prev => Math.min(100, prev + (100 / (styles.length * promptsToUse.length))));
        });
        // 간단한 병렬(4)
        let idx = 0; const workers = Array.from({ length: 4 }, async () => { while (idx < tasks.length) { const i = idx++; await tasks[i](); }});
        await Promise.all(workers);
        images.sort((a,b)=>a.sceneNumber-b.sceneNumber);
        storyboard.push({ style: style.name, description: style.description, colorPalette: style.colorPalette, images });
      }

      setStoryboard?.({ storyboard, imagePrompts, metadata: { ...metadata, perStyle } });
      setIsLoading?.(false);
      onNext?.();
    } catch (e) {
      setError(e.message);
      setIsLoading?.(false);
    }
  };

  return (
    <div>
      <button onClick={handleGenerateStoryboard} disabled={isLoading}>스토리보드 생성</button>
      {!!progress && <div>진행률 {Math.round(progress)}%</div>}
      {error && <div className="text-red-600">{error}</div>}
    </div>
  );
}

export async function generateStoryboardFlow(formData, { concurrency = 3, basePath = '' } = {}) {
  const initRes = await fetch(`${basePath}/api/storyboard-init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData })
  });
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(err.error || `init failed: ${initRes.status}`);
  }
  const { creativeBrief, storyboardConcepts, imagePrompts, styles, metadata } = await initRes.json();

  const perStyleCount = metadata.imageCountPerStyle;
  const promptsToUse = imagePrompts.slice(0, perStyleCount);

  const runPool = async (items, limit, worker) => {
    const results = new Array(items.length);
    let idx = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = idx++;
        if (i >= items.length) break;
        results[i] = await worker(items[i], i);
      }
    });
    await Promise.all(runners);
    return results;
  };

  const storyboard = [];
  for (const style of styles) {
    const tasks = promptsToUse.map((p) => ({ p, style }));
    const images = [];

    await runPool(tasks, concurrency, async ({ p, style }, i) => {
      const res = await fetch(`${basePath}/api/storyboard-render-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: p.prompt,
          styleName: style.name,
          sceneNumber: p.sceneNumber,
          title: p.title
        })
      });

      if (res.ok) {
        const data = await res.json();
        images.push({
          id: `${style.name.toLowerCase().replace(/\s+/g, '-')}-${i + 1}`,
          title: p.title,
          url: data.url,
          thumbnail: data.url,
          prompt: `${p.prompt}, ${style.description}`,
          duration: p.duration,
          sceneNumber: p.sceneNumber
        });
      } else {
        // 실패는 무시하고 다음으로 (원본도 개별 실패는 계속 진행)
        console.warn(`render-image failed for ${style.name} #${i + 1}:`, await res.text());
      }
    });

    images.sort((a, b) => a.sceneNumber - b.sceneNumber);

    storyboard.push({
      style: style.name,
      description: style.description,
      colorPalette: style.colorPalette,
      images,
      searchQuery: `${formData.brandName} ${formData.industryCategory} advertisement`,
      status: images.length > 0 ? 'success' : 'fallback'
    });
  }

  return {
    success: true,
    creativeBrief,
    storyboardConcepts,
    imagePrompts,
    storyboard,
    metadata: {
      ...metadata,
      successCount: storyboard.filter(s => s.status === 'success').length,
      fallbackCount: storyboard.filter(s => s.status === 'fallback').length,
      processSteps: 4
    }
  };
}

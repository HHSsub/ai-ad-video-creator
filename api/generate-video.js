// 병렬 디스패치 + 6초로 생성(제공사 제약) → 나중에 FFmpeg에서 2초로 컷/머지
function clamp(s, max) { return s && s.length > max ? s.slice(0, max - 20) + '…' : (s || ''); }

function buildVideoPrompt(image, formData) {
  const base = [
    image.title && `Title: ${image.title}`,
    formData?.brandName && `Brand: ${formData.brandName}`,
    'gentle camera parallax, natural easing, maintain subject integrity',
  ].filter(Boolean).join('. ');
  return `${base}. ${image.prompt || ''}`;
}

async function runPool(arr, limit, worker) {
  let i = 0; const res = new Array(arr.length);
  const runners = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (true) { const idx = i++; if (idx >= arr.length) break; res[idx] = await worker(arr[idx], idx); }
  });
  await Promise.all(runners);
  return res;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { selectedStyle, selectedImages, formData, concurrency = 3 } = req.body || {};
    if (!selectedStyle || !Array.isArray(selectedImages) || selectedImages.length === 0) {
      return res.status(400).json({ error: 'Selected style and images are required' });
    }

    const apiKey =
      process.env.FREEPIK_API_KEY ||
      process.env.REACT_APP_FREEPIK_API_KEY ||
      process.env.VITE_FREEPIK_API_KEY;
    if (!apiKey) throw new Error('Freepik API key not found');

    // 제공사 제약: 6 또는 10초. 성능 위해 6초 사용 → 이후 2초로 컷
    const providerDuration = 6;

    const inputs = selectedImages.map((image, i) => ({ image, i }));
    const segments = [];
    const failed = [];

    await runPool(inputs, concurrency, async ({ image, i }) => {
      try {
        if (!image.url) throw new Error('Image URL is required');
        const prompt = clamp(buildVideoPrompt(image, formData), 1900);

        const r = await fetch('https://api.freepik.com/v1/ai/image-to-video/minimax-hailuo-02-768p', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-freepik-api-key': apiKey },
          body: JSON.stringify({ prompt, first_frame_image: image.url, duration: providerDuration, webhook_url: null })
        });

        if (!r.ok) {
          const t = await r.text(); console.error('[generate-video] Freepik 오류', r.status, t);
          throw new Error(`Video API failed ${r.status}`);
        }
        const j = await r.json();
        const taskId = j?.data?.task_id;
        if (!taskId) throw new Error('no task_id');

        segments[i] = {
          segmentId: `segment-${i + 1}`,
          sceneNumber: image.sceneNumber || i + 1,
          originalImage: { url: image.url, title: image.title || null },
          taskId,
          videoUrl: null,
          status: 'in_progress',
          duration: providerDuration,
          prompt,
          createdAt: new Date().toISOString(),
        };
      } catch (e) {
        failed[i] = {
          segmentId: `segment-${i + 1}`,
          sceneNumber: i + 1,
          originalImage: selectedImages[i],
          error: e.message,
          status: 'failed',
          duration: providerDuration
        };
      }
    });

    const ok = segments.filter(Boolean);
    const tasks = ok.map(s => ({ taskId: s.taskId, sceneNumber: s.sceneNumber, duration: s.duration, title: s.originalImage?.title || `Segment ${s.sceneNumber}` }));

    res.status(200).json({
      success: true,
      videoProject: {
        projectId: `project-${Date.now()}`,
        selectedStyle,
        totalSegments: selectedImages.length,
        successfulSegments: ok.length,
        failedSegments: failed.filter(Boolean).length,
        requestedDuration: Number(formData?.videoLength || 10),
        providerSegmentDuration: providerDuration,
        status: ok.length ? 'in_progress' : 'failed',
      },
      videoSegments: ok,
      failedSegments: failed.filter(Boolean),
      tasks
    });
  } catch (e) {
    console.error('[generate-video] error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
}

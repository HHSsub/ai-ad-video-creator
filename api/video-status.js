// 미완료만 폴링 + 캐시 + 요약 카운트(상태/URL 분리)
const CACHE = new Map(); // taskId -> { status, videoUrl, sceneNumber, updatedAt }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { tasks } = req.body || {};
    if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: 'tasks array is required' });

    const apiKey =
      process.env.FREEPIK_API_KEY ||
      process.env.REACT_APP_FREEPIK_API_KEY ||
      process.env.VITE_FREEPIK_API_KEY;
    if (!apiKey) throw new Error('Freepik API key not found');

    const out = [];

    for (const t of tasks) {
      const taskId = t?.taskId;
      if (!taskId) continue;
      const cached = CACHE.get(taskId);

      try {
        const r = await fetch(`https://api.freepik.com/v1/ai/image-to-video/minimax-hailuo-02-768p/${taskId}`, {
          method: 'GET',
          headers: { 'x-freepik-api-key': apiKey, Accept: 'application/json' }
        });

        if (!r.ok) {
          if (cached) {
            out.push({ sceneNumber: cached.sceneNumber ?? t.sceneNumber, title: t.title ?? null, taskId, status: cached.status, videoUrl: cached.videoUrl ?? null, duration: t.duration ?? null, providerStatus: 'CACHED_AFTER_FAIL' });
            continue;
          }
          out.push({ sceneNumber: t.sceneNumber, title: t.title, taskId, status: 'error', videoUrl: null, duration: t.duration ?? null });
          continue;
        }

        const j = await r.json();
        const ps = String(j?.data?.status || 'UNKNOWN').toUpperCase();
        const status = ps === 'COMPLETED' ? 'completed' : (ps === 'FAILED' || ps === 'ERROR') ? 'failed' : 'in_progress';
        const url = Array.isArray(j?.data?.result) && j.data.result[0]?.url ? j.data.result[0].url : null;

        const item = { sceneNumber: t.sceneNumber, title: t.title, taskId, status, videoUrl: url, duration: t.duration ?? null, providerStatus: ps };
        CACHE.set(taskId, { status: item.status, videoUrl: item.videoUrl, sceneNumber: item.sceneNumber, updatedAt: Date.now() });
        out.push(item);
      } catch (e) {
        if (cached) out.push({ sceneNumber: cached.sceneNumber ?? t.sceneNumber, title: t.title, taskId, status: cached.status, videoUrl: cached.videoUrl ?? null, duration: t.duration ?? null, providerStatus: 'CACHED_AFTER_EXCEPTION' });
        else out.push({ sceneNumber: t.sceneNumber, title: t.title, taskId, status: 'error', videoUrl: null, duration: t.duration ?? null });
      }
    }

    const completedByStatus = out.filter(s => s.status === 'completed').length;
    const ready = out.filter(s => s.status === 'completed' && s.videoUrl).length;
    const failed = out.filter(s => s.status === 'failed' || s.status === 'error').length;
    const inProgress = out.filter(s => s.status === 'in_progress').length;

    res.status(200).json({ success: true, summary: { total: out.length, completedByStatus, ready, inProgress, failed }, segments: out });
  } catch (e) {
    console.error('[video-status] error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
}

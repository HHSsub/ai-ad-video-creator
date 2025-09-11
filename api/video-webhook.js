// Optional webhook target for Freepik to push "COMPLETED" notifications.
// Set FREEPIK_WEBHOOK_URL to this endpoint's public URL (e.g. via reverse proxy).
const TASK_CACHE = global.__VIDEO_TASK_CACHE__ || (global.__VIDEO_TASK_CACHE__ = new Map());

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload = req.body || {};
    const taskId = payload?.data?.task_id || payload?.task_id;
    const status = String(payload?.data?.status || payload?.status || '').toLowerCase();
    const url =
      Array.isArray(payload?.data?.result) && payload.data.result[0]?.url
        ? payload.data.result[0].url
        : null;

    if (!taskId) return res.status(400).json({ ok: false, error: 'No task_id in webhook' });

    TASK_CACHE.set(taskId, {
      status: status === 'completed' ? 'completed' : status || 'unknown',
      videoUrl: url || null,
      updatedAt: Date.now(),
    });

    console.log('[video-webhook] updated', taskId, TASK_CACHE.get(taskId));
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[video-webhook] error', e);
    res.status(500).json({ ok: false, error: e.message });
  }
}

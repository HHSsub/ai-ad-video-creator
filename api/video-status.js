// Poll only pending tasks; cache results; return both completedByStatus and ready counts.

const TASK_CACHE = new Map(); // taskId -> { status, videoUrl, sceneNumber, updatedAt }

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { tasks } = req.body || {};
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'tasks array is required' });
    }

    const freepikApiKey =
      process.env.FREEPIK_API_KEY ||
      process.env.REACT_APP_FREEPIK_API_KEY ||
      process.env.VITE_FREEPIK_API_KEY;
    if (!freepikApiKey) throw new Error('Freepik API key not found');

    const pending = [];
    const seeded = [];

    // Use cache first; only poll tasks still in progress/unknown/no-url
    for (const t of tasks) {
      const taskId = t?.taskId;
      if (!taskId) continue;
      const cached = TASK_CACHE.get(taskId);
      if (cached && cached.status === 'completed' && cached.videoUrl) {
        seeded.push({
          sceneNumber: cached.sceneNumber ?? t?.sceneNumber ?? null,
          title: t?.title ?? null,
          taskId,
          status: 'completed',
          videoUrl: cached.videoUrl,
          duration: t?.duration ?? null,
          providerStatus: 'CACHED',
        });
      } else {
        pending.push(t);
      }
    }

    const fetched = [];
    for (const t of pending) {
      const taskId = t.taskId;
      try {
        const r = await fetch(
          `https://api.freepik.com/v1/ai/image-to-video/minimax-hailuo-02-768p/${taskId}`,
          {
            method: 'GET',
            headers: {
              'x-freepik-api-key': freepikApiKey,
              Accept: 'application/json',
            },
          }
        );

        if (!r.ok) {
          const text = await r.text();
          console.error(`[video-status] status check ${taskId} 실패 (${r.status}):`, text);
          // fallback to previous cache if any
          const cached = TASK_CACHE.get(taskId);
          if (cached) {
            fetched.push({
              sceneNumber: cached.sceneNumber ?? t.sceneNumber ?? null,
              title: t.title ?? null,
              taskId,
              status: cached.status,
              videoUrl: cached.videoUrl ?? null,
              duration: t.duration ?? null,
              providerStatus: 'CACHED_AFTER_5XX',
            });
            continue;
          }
          fetched.push({
            sceneNumber: t.sceneNumber ?? null,
            title: t.title ?? null,
            taskId,
            status: 'error',
            videoUrl: null,
            duration: t.duration ?? null,
            error: `Status check failed: ${r.status}`,
          });
          continue;
        }

        const json = await r.json();
        const providerStatus = String(json?.data?.status || 'UNKNOWN').toUpperCase();

        let status = 'in_progress';
        if (providerStatus === 'COMPLETED') status = 'completed';
        else if (providerStatus === 'FAILED' || providerStatus === 'ERROR') status = 'failed';
        else if (providerStatus === 'UNKNOWN') status = 'unknown';

        const videoUrl =
          Array.isArray(json?.data?.result) && json.data.result[0]?.url
            ? json.data.result[0].url
            : null;

        const item = {
          sceneNumber: t.sceneNumber ?? null,
          title: t.title ?? null,
          taskId,
          status,
          videoUrl,
          duration: t.duration ?? null,
          providerStatus,
        };

        TASK_CACHE.set(taskId, {
          status: item.status,
          videoUrl: item.videoUrl,
          sceneNumber: item.sceneNumber,
          updatedAt: Date.now(),
        });

        fetched.push(item);
      } catch (err) {
        console.error(`[video-status] status check ${taskId} 예외:`, err.message);
        const cached = TASK_CACHE.get(taskId);
        if (cached) {
          fetched.push({
            sceneNumber: cached.sceneNumber ?? t.sceneNumber ?? null,
            title: t.title ?? null,
            taskId,
            status: cached.status,
            videoUrl: cached.videoUrl ?? null,
            duration: t.duration ?? null,
            providerStatus: 'CACHED_AFTER_EXCEPTION',
          });
        } else {
          fetched.push({
            sceneNumber: t.sceneNumber ?? null,
            title: t.title ?? null,
            taskId,
            status: 'error',
            videoUrl: null,
            duration: t.duration ?? null,
            error: err.message,
          });
        }
      }
    }

    const merged = [...seeded, ...fetched];

    const completedByStatus = merged.filter((s) => s.status === 'completed').length;
    const ready = merged.filter((s) => s.status === 'completed' && s.videoUrl).length;
    const failed = merged.filter((s) => s.status === 'failed' || s.status === 'error').length;
    const inProgress = merged.filter((s) => s.status === 'in_progress' || s.status === 'unknown').length;

    res.status(200).json({
      success: true,
      summary: {
        total: merged.length,
        completedByStatus,
        ready,
        inProgress,
        failed,
      },
      segments: merged,
    });
  } catch (error) {
    console.error('[video-status] 전체 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

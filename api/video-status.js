// Check Freepik Image-to-Video task statuses.
// Input: { tasks: [{taskId, sceneNumber, duration, title}] }
// Output: segments with status/videoUrl.
// Use this to enable per-segment <video> playback once completed.

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

    const checked = [];
    for (const t of tasks) {
      const taskId = t?.taskId;
      if (!taskId) {
        checked.push({
          sceneNumber: t?.sceneNumber ?? null,
          title: t?.title ?? null,
          taskId: null,
          status: 'error',
          videoUrl: null,
          duration: t?.duration ?? null,
          error: 'Missing taskId',
        });
        continue;
      }

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
          checked.push({
            sceneNumber: t?.sceneNumber ?? null,
            title: t?.title ?? null,
            taskId,
            status: 'error',
            videoUrl: null,
            duration: t?.duration ?? null,
            error: `Status check failed: ${r.status}`,
          });
          continue;
        }

        const json = await r.json();
        const providerStatus = json?.data?.status || 'UNKNOWN';
        const upper = String(providerStatus).toUpperCase();

        let status = 'in_progress';
        if (upper === 'COMPLETED') status = 'completed';
        else if (upper === 'FAILED' || upper === 'ERROR') status = 'failed';
        else if (upper === 'UNKNOWN') status = 'unknown';

        const videoUrl =
          Array.isArray(json?.data?.result) && json.data.result[0]?.url
            ? json.data.result[0].url
            : null;
        const duration =
          Array.isArray(json?.data?.result) && json.data.result[0]?.duration
            ? json.data.result[0].duration
            : t?.duration ?? null;

        checked.push({
          sceneNumber: t?.sceneNumber ?? null,
          title: t?.title ?? null,
          taskId,
          status,
          videoUrl,
          duration,
          providerStatus,
        });
      } catch (err) {
        console.error(`[video-status] status check ${taskId} 예외:`, err.message);
        checked.push({
          sceneNumber: t?.sceneNumber ?? null,
          title: t?.title ?? null,
          taskId,
          status: 'error',
          videoUrl: null,
          duration: t?.duration ?? null,
          error: err.message,
        });
      }
    }

    const completed = checked.filter((s) => s.status === 'completed' && s.videoUrl);
    const failed = checked.filter((s) => s.status === 'failed' || s.status === 'error');
    const inProgress = checked.filter((s) => s.status === 'in_progress' || s.status === 'unknown');

    const payload = {
      success: true,
      summary: {
        total: checked.length,
        completed: completed.length,
        inProgress: inProgress.length,
        failed: failed.length,
      },
      segments: checked, // 프론트는 여기 videoUrl로 카드별 재생 버튼 활성화
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error('[video-status] 전체 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

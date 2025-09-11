// Check Freepik Image-to-Video task statuses with simple in-memory cache.
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

      // 기본 캐시
      const cached = TASK_CACHE.get(taskId);

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
          // 5xx면 캐시가 있으면 캐시로 대체해 플럭추에이션 완화
          if (r.status >= 500 && cached) {
            checked.push({
              sceneNumber: cached.sceneNumber ?? t?.sceneNumber ?? null,
              title: t?.title ?? null,
              taskId,
              status: cached.status,
              videoUrl: cached.videoUrl ?? null,
              duration: t?.duration ?? null,
              providerStatus: 'CACHED_AFTER_5XX',
            });
            continue;
          }
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

        const item = {
          sceneNumber: t?.sceneNumber ?? null,
          title: t?.title ?? null,
          taskId,
          status,
          videoUrl,
          duration,
          providerStatus,
        };

        // 캐시 업데이트
        TASK_CACHE.set(taskId, {
          status: item.status,
          videoUrl: item.videoUrl,
          sceneNumber: item.sceneNumber,
          updatedAt: Date.now(),
        });

        checked.push(item);
      } catch (err) {
        console.error(`[video-status] status check ${taskId} 예외:`, err.message);
        if (cached) {
          checked.push({
            sceneNumber: cached.sceneNumber ?? t?.sceneNumber ?? null,
            title: t?.title ?? null,
            taskId,
            status: cached.status,
            videoUrl: cached.videoUrl ?? null,
            duration: t?.duration ?? null,
            providerStatus: 'CACHED_AFTER_EXCEPTION',
          });
        } else {
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
    }

    const completedByStatus = checked.filter((s) => s.status === 'completed').length;
    const ready = checked.filter((s) => s.status === 'completed' && s.videoUrl).length;
    const failed = checked.filter((s) => s.status === 'failed' || s.status === 'error').length;
    const inProgress = checked.filter((s) => s.status === 'in_progress' || s.status === 'unknown').length;

    const payload = {
      success: true,
      summary: {
        total: checked.length,
        completed: ready,             // 하위호환: 기존 completed는 "URL까지 준비된" 개수
        completedByStatus,            // 추가: 상태 기준 완료
        ready,                        // 추가: URL까지 준비된 개수
        inProgress,
        failed,
      },
      segments: checked,
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error('[video-status] 전체 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

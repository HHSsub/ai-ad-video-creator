export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { taskIds } = req.body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ 
        error: 'Task IDs array is required' 
      });
    }

    console.log('비디오 상태 확인 요청:', taskIds.length + '개 작업');

    const freepikApiKey = process.env.FREEPIK_API_KEY || 
                          process.env.REACT_APP_FREEPIK_API_KEY || 
                          process.env.VITE_FREEPIK_API_KEY;

    if (!freepikApiKey) {
      throw new Error('Freepik API key not found');
    }

    const statusResults = [];

    // 각 task ID의 상태 확인
    for (const taskId of taskIds) {
      try {
        console.log(`상태 확인 중: ${taskId}`);
        
        const response = await fetch(`https://api.freepik.com/v1/ai/image-to-video/minimax-hailuo-02-768p/${taskId}`, {
          method: 'GET',
          headers: {
            'x-freepik-api-key': freepikApiKey
          }
        });

        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }

        const result = await response.json();
        console.log(`Task ${taskId} 상태:`, result.data?.status);

        statusResults.push({
          taskId: taskId,
          status: result.data?.status || 'UNKNOWN',
          videoUrl: result.data?.result && result.data.result.length > 0 
            ? result.data.result[0].url 
            : null,
          thumbnailUrl: result.data?.result && result.data.result.length > 0 
            ? result.data.result[0].thumbnail_url 
            : null,
          progress: result.data?.progress || 0,
          duration: result.data?.result && result.data.result.length > 0 
            ? result.data.result[0].duration 
            : null,
          error: result.data?.status === 'FAILED' 
            ? result.data?.error || 'Generation failed' 
            : null,
          updatedAt: new Date().toISOString()
        });

      } catch (error) {
        console.error(`Task ${taskId} 상태 확인 실패:`, error.message);
        
        statusResults.push({
          taskId: taskId,
          status: 'ERROR',
          videoUrl: null,
          thumbnailUrl: null,
          progress: 0,
          duration: null,
          error: error.message,
          updatedAt: new Date().toISOString()
        });
      }

      // API 호출 간격 조정
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 전체 상태 요약
    const summary = {
      total: statusResults.length,
      completed: statusResults.filter(r => r.status === 'COMPLETED').length,
      inProgress: statusResults.filter(r => r.status === 'IN_PROGRESS').length,
      failed: statusResults.filter(r => r.status === 'FAILED' || r.status === 'ERROR').length,
      pending: statusResults.filter(r => r.status === 'PENDING' || r.status === 'QUEUED').length
    };

    const allCompleted = summary.completed === summary.total;
    const hasFailures = summary.failed > 0;

    console.log('상태 확인 완료:', summary);

    const response = {
      success: true,
      summary: summary,
      allCompleted: allCompleted,
      hasFailures: hasFailures,
      statusResults: statusResults,
      completedVideos: statusResults.filter(r => r.status === 'COMPLETED' && r.videoUrl),
      metadata: {
        checkedAt: new Date().toISOString(),
        apiProvider: 'Freepik',
        model: 'minimax-hailuo-02-768p'
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('비디오 상태 확인 중 전체 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
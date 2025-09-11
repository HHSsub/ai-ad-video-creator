// 향상된 비디오 상태 폴링 시스템
const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const CACHE = new Map(); // taskId -> { status, videoUrl, sceneNumber, updatedAt }
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 에러 재시도 가능 여부 판단
function isRetryableError(error, statusCode) {
  if ([429, 500, 502, 503, 504].includes(statusCode)) return true;
  const message = error?.message?.toLowerCase() || '';
  return message.includes('timeout') || 
         message.includes('network') || 
         message.includes('fetch') ||
         message.includes('overload');
}

// 안정적인 API 호출
async function safeApiCall(url, options, label) {
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        timeout: 30000
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (isRetryableError(data, response.status) && attempt < MAX_RETRIES) {
          console.warn(`[${label}] HTTP ${response.status}, 재시도 ${attempt}`);
          await sleep(RETRY_DELAY * attempt);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${data.message || 'Unknown error'}`);
      }
      
      return data;
      
    } catch (error) {
      lastError = error;
      console.error(`[${label}] 시도 ${attempt} 실패:`, error.message);
      
      if (attempt < MAX_RETRIES && isRetryableError(error, null)) {
        await sleep(RETRY_DELAY * attempt);
        continue;
      }
      break;
    }
  }
  
  throw lastError;
}

// 단일 태스크 상태 확인
async function checkSingleTaskStatus(taskId, apiKey) {
  const url = `${FREEPIK_API_BASE}/ai/image-to-video/${taskId}`;
  
  const options = {
    method: 'GET',
    headers: {
      'x-freepik-api-key': apiKey,
      'User-Agent': 'AI-Ad-Creator/1.0'
    }
  };
  
  try {
    const data = await safeApiCall(url, options, `status-${taskId.substring(0, 8)}`);
    
    const taskData = data.data || {};
    const status = String(taskData.status || 'UNKNOWN').toUpperCase();
    
    console.log(`[checkSingleTaskStatus] ${taskId.substring(0, 8)}: ${status}`);
    
    // 상태 정규화
    let normalizedStatus;
    let videoUrl = null;
    
    if (status === 'COMPLETED') {
      normalizedStatus = 'completed';
      // 2025 Freepik API 응답 구조에 맞춰 비디오 URL 추출
      if (taskData.video && taskData.video.url) {
        videoUrl = taskData.video.url;
      } else if (taskData.result && Array.isArray(taskData.result) && taskData.result[0]?.url) {
        videoUrl = taskData.result[0].url;
      } else if (taskData.generated && Array.isArray(taskData.generated) && taskData.generated[0]) {
        videoUrl = taskData.generated[0];
      }
    } else if (status === 'FAILED' || status === 'ERROR') {
      normalizedStatus = 'failed';
    } else if (status === 'PROCESSING' || status === 'IN_PROGRESS' || status === 'QUEUED') {
      normalizedStatus = 'in_progress';
    } else {
      normalizedStatus = 'in_progress'; // 기본값으로 진행 중 처리
    }
    
    return {
      success: true,
      status: normalizedStatus,
      videoUrl,
      providerStatus: status,
      data: taskData
    };
    
  } catch (error) {
    console.error(`[checkSingleTaskStatus] ${taskId.substring(0, 8)} 실패:`, error.message);
    
    // 캐시에서 이전 상태 확인
    const cached = CACHE.get(taskId);
    if (cached) {
      console.log(`[checkSingleTaskStatus] 캐시된 상태 사용: ${taskId.substring(0, 8)}`);
      return {
        success: false,
        status: cached.status,
        videoUrl: cached.videoUrl,
        providerStatus: 'CACHED_AFTER_ERROR',
        error: error.message,
        fromCache: true
      };
    }
    
    return {
      success: false,
      status: 'error',
      videoUrl: null,
      providerStatus: 'ERROR',
      error: error.message
    };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();

  try {
    const { tasks } = req.body || {};
    
    if (!Array.isArray(tasks) || !tasks.length) {
      return res.status(400).json({ error: 'tasks array is required' });
    }

    console.log('[video-status] 시작:', {
      tasksCount: tasks.length,
      taskIds: tasks.map(t => t.taskId?.substring(0, 8)).join(', ')
    });

    // API 키 확인
    const apiKey = process.env.FREEPIK_API_KEY ||
                   process.env.REACT_APP_FREEPIK_API_KEY ||
                   process.env.VITE_FREEPIK_API_KEY;

    if (!apiKey) {
      console.error('[video-status] Freepik API 키 없음');
      // API 키가 없어도 캐시된 상태라도 반환
      const segments = tasks.map(task => {
        const cached = CACHE.get(task.taskId);
        return {
          sceneNumber: task.sceneNumber || cached?.sceneNumber || 1,
          title: task.title || `Scene ${task.sceneNumber || 1}`,
          taskId: task.taskId,
          status: cached?.status || 'error',
          videoUrl: cached?.videoUrl || null,
          duration: task.duration || 6,
          providerStatus: 'NO_API_KEY',
          error: 'API 키 없음'
        };
      });

      return res.status(200).json({
        success: false,
        error: 'API 키가 설정되지 않았습니다',
        segments,
        summary: { total: segments.length, ready: 0, inProgress: 0, failed: segments.length }
      });
    }

    const segments = [];
    
    // 각 태스크 상태 확인 (병렬 처리)
    const statusPromises = tasks.map(async (task) => {
      const { taskId, sceneNumber, title, duration } = task;
      
      if (!taskId) {
        return {
          sceneNumber: sceneNumber || 1,
          title: title || `Scene ${sceneNumber || 1}`,
          taskId: 'NO_TASK_ID',
          status: 'error',
          videoUrl: null,
          duration: duration || 6,
          providerStatus: 'NO_TASK_ID'
        };
      }

      try {
        const result = await checkSingleTaskStatus(taskId, apiKey);
        
        // 캐시 업데이트
        if (result.success) {
          CACHE.set(taskId, {
            status: result.status,
            videoUrl: result.videoUrl,
            sceneNumber: sceneNumber,
            updatedAt: Date.now()
          });
        }
        
        return {
          sceneNumber: sceneNumber || 1,
          title: title || `Scene ${sceneNumber || 1}`,
          taskId,
          status: result.status,
          videoUrl: result.videoUrl,
          duration: duration || 6,
          providerStatus: result.providerStatus,
          fromCache: result.fromCache || false,
          error: result.error
        };
        
      } catch (error) {
        console.error(`[video-status] Task ${taskId?.substring(0, 8)} 처리 실패:`, error.message);
        
        return {
          sceneNumber: sceneNumber || 1,
          title: title || `Scene ${sceneNumber || 1}`,
          taskId,
          status: 'error',
          videoUrl: null,
          duration: duration || 6,
          providerStatus: 'ERROR',
          error: error.message
        };
      }
    });

    // 모든 상태 확인 완료 대기
    const results = await Promise.allSettled(statusPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        segments.push(result.value);
      } else {
        console.error(`[video-status] Task ${index} Promise 실패:`, result.reason);
        const task = tasks[index];
        segments.push({
          sceneNumber: task?.sceneNumber || index + 1,
          title: task?.title || `Scene ${index + 1}`,
          taskId: task?.taskId || 'UNKNOWN',
          status: 'error',
          videoUrl: null,
          duration: task?.duration || 6,
          providerStatus: 'PROMISE_REJECTED',
          error: result.reason?.message || 'Promise rejected'
        });
      }
    });

    // 통계 계산
    const completed = segments.filter(s => s.status === 'completed');
    const ready = segments.filter(s => s.status === 'completed' && s.videoUrl);
    const inProgress = segments.filter(s => s.status === 'in_progress');
    const failed = segments.filter(s => s.status === 'failed' || s.status === 'error');

    const summary = {
      total: segments.length,
      completed: completed.length,
      ready: ready.length,
      inProgress: inProgress.length,
      failed: failed.length,
      completionRate: segments.length > 0 ? Math.round((ready.length / segments.length) * 100) : 0
    };

    const processingTime = Date.now() - startTime;

    console.log('[video-status] 완료:', {
      처리시간: processingTime + 'ms',
      총태스크: summary.total,
      완료: summary.ready,
      진행중: summary.inProgress,
      실패: summary.failed,
      완료율: summary.completionRate + '%'
    });

    res.status(200).json({
      success: true,
      segments,
      summary,
      metadata: {
        processingTime,
        apiKeyAvailable: !!apiKey,
        cacheSize: CACHE.size,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[video-status] 전체 오류:', error);
    
    const processingTime = Date.now() - startTime;
    
    // 오류 발생시에도 기본 구조 반환
    const fallbackSegments = (req.body?.tasks || []).map((task, index) => ({
      sceneNumber: task?.sceneNumber || index + 1,
      title: task?.title || `Scene ${index + 1}`,
      taskId: task?.taskId || 'ERROR',
      status: 'error',
      videoUrl: null,
      duration: task?.duration || 6,
      providerStatus: 'HANDLER_ERROR',
      error: error.message
    }));

    res.status(200).json({
      success: false,
      error: error.message,
      segments: fallbackSegments,
      summary: {
        total: fallbackSegments.length,
        completed: 0,
        ready: 0,
        inProgress: 0,
        failed: fallbackSegments.length,
        completionRate: 0
      },
      metadata: {
        processingTime,
        fallback: true,
        timestamp: new Date().toISOString()
      }
    });
  }
}

// 캐시 정리 (메모리 관리)
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24시간
  
  for (const [taskId, data] of CACHE.entries()) {
    if (now - data.updatedAt > maxAge) {
      CACHE.delete(taskId);
      console.log(`[video-status] 캐시 정리: ${taskId.substring(0, 8)}`);
    }
  }
}, 60 * 60 * 1000); // 1시간마다 정리

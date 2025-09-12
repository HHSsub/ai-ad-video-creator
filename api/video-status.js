// 향상된 비디오 상태 폴링 시스템 - 2025년 Freepik MiniMax Hailuo-02 API 호환
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
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (isRetryableError({message: errorText}, response.status) && attempt < MAX_RETRIES) {
          console.warn(`[${label}] HTTP ${response.status}, 재시도 ${attempt}`);
          await sleep(RETRY_DELAY * attempt);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      return await response.json();
      
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

// 단일 태스크 상태 확인 - 2025년 Freepik API 스펙
async function checkSingleTaskStatus(taskId, apiKey) {
  // 🔥 정확한 2025년 Freepik MiniMax Hailuo-02 상태 확인 엔드포인트
  const url = `${FREEPIK_API_BASE}/ai/image-to-video/minimax-hailuo-02-768p/${taskId}`;
  
  const options = {
    method: 'GET',
    headers: {
      'x-freepik-api-key': apiKey,
      'User-Agent': 'AI-Ad-Creator/2025'
    }
  };
  
  try {
    const data = await safeApiCall(url, options, `status-${taskId.substring(0, 8)}`);
    
    console.log(`[checkSingleTaskStatus] ${taskId.substring(0, 8)} 원본 응답:`, JSON.stringify(data, null, 2));
    
    const taskData = data.data || data;
    const status = String(taskData.status || 'UNKNOWN').toUpperCase();
    
    console.log(`[checkSingleTaskStatus] ${taskId.substring(0, 8)}: ${status}`);
    
    // 상태 정규화 - 2025년 Freepik API 기준
    let normalizedStatus;
    let videoUrl = null;
    
    if (status === 'COMPLETED' || status === 'SUCCESS') {
      normalizedStatus = 'completed';
      
      // 2025년 Freepik MiniMax Hailuo-02 응답 구조에서 비디오 URL 추출
      if (taskData.video && taskData.video.url) {
        videoUrl = taskData.video.url;
      } else if (taskData.result && Array.isArray(taskData.result) && taskData.result[0]?.url) {
        videoUrl = taskData.result[0].url;
      } else if (taskData.generated && Array.isArray(taskData.generated) && taskData.generated[0]) {
        videoUrl = taskData.generated[0];
      } else if (taskData.output && taskData.output.url) {
        videoUrl = taskData.output.url;
      } else if (typeof taskData.video === 'string') {
        videoUrl = taskData.video;
      }
      
      console.log(`[checkSingleTaskStatus] ${taskId.substring(0, 8)} 비디오 URL:`, videoUrl);
      
    } else if (status === 'FAILED' || status === 'ERROR') {
      normalizedStatus = 'failed';
    } else if (['PROCESSING', 'IN_PROGRESS', 'QUEUED', 'PENDING', 'GENERATING'].includes(status)) {
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

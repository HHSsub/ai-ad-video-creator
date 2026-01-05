// api/video-status.js - Freepik Kling v2.1 Pro 공식문서 기반 폴링 시스템 -> 동적엔진
const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const CACHE = new Map(); // taskId -> { status, videoUrl, sceneNumber, updatedAt }
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

import { getImageToVideoStatusUrl } from '../src/utils/engineConfigLoader.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function isRetryableError(error, statusCode) {
  if ([429, 500, 502, 503, 504].includes(statusCode)) return true;
  const message = error?.message?.toLowerCase() || '';
  return message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('overload');
}

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
        if (isRetryableError({ message: errorText }, response.status) && attempt < MAX_RETRIES) {
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

// 단일 태스크 상태 확인 - Kling v2.1 Pro API 스펙 
// 🔥🔥🔥 핵심 수정: POST는 kling-v2-1-pro, GET은 kling-v2-1 🔥🔥🔥
async function checkSingleTaskStatus(taskId, apiKey) {
  // 🔥 Dynamic Loader로 엔진 버전(v2.5/v2.1) 자동 대응
  const url = getImageToVideoStatusUrl(taskId);

  const options = {
    method: 'GET',
    headers: {
      'x-freepik-api-key': apiKey,
      'User-Agent': 'AI-Ad-Creator/2025'
    }
  };

  try {
    const data = await safeApiCall(url, options, `status-${taskId.substring(0, 8)}`);

    console.log(`[checkSingleTaskStatus] ${taskId.substring(0, 8)} 응답:`, JSON.stringify(data, null, 2));

    const taskData = data.data || data;
    const status = String(taskData.status || 'UNKNOWN').toUpperCase();

    console.log(`[checkSingleTaskStatus] ${taskId.substring(0, 8)}: ${status}`);

    // 상태 정규화
    let normalizedStatus;
    let videoUrl = null;

    if (status === 'COMPLETED' || status === 'SUCCESS') {
      normalizedStatus = 'completed';
      if (taskData.generated && Array.isArray(taskData.generated) && taskData.generated[0]) {
        videoUrl = taskData.generated[0];
      }
    } else if (status === 'FAILED' || status === 'ERROR') {
      normalizedStatus = 'failed';
    } else if (['PROCESSING', 'IN_PROGRESS', 'QUEUED', 'PENDING', 'GENERATING', 'CREATED'].includes(status)) {
      normalizedStatus = 'in_progress';
    } else {
      normalizedStatus = 'in_progress';
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

    const apiKey = process.env.FREEPIK_API_KEY ||
      process.env.REACT_APP_FREEPIK_API_KEY ||
      process.env.VITE_FREEPIK_API_KEY;

    if (!apiKey) {
      console.error('[video-status] Freepik API 키 없음');
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
    const statusPromises = tasks.map(async (task) => {
      const { taskId, sceneNumber, title, duration } = task;
      if (!taskId) {
        return {
          sceneNumber: sceneNumber || 1,
          title: title || `Scene ${sceneNumber || 1}`,
          taskId: 'NO_TASK_ID',
          status: 'error',
          videoUrl: null,
          duration: duration || 5,
          providerStatus: 'NO_TASK_ID'
        };
      }
      try {
        const result = await checkSingleTaskStatus(taskId, apiKey);
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
          taskId: taskId,
          status: result.status,
          videoUrl: result.videoUrl,
          duration: duration || 5,
          providerStatus: result.providerStatus,
          error: result.error || null
        };
      } catch (error) {
        return {
          sceneNumber: sceneNumber || 1,
          title: title || `Scene ${sceneNumber || 1}`,
          taskId: taskId,
          status: 'error',
          videoUrl: null,
          duration: duration || 5,
          providerStatus: 'EXCEPTION',
          error: error.message
        };
      }
    });

    const results = await Promise.all(statusPromises);

    const summary = {
      total: results.length,
      ready: results.filter(r => r.status === 'completed').length,
      inProgress: results.filter(r => r.status === 'in_progress').length,
      failed: results.filter(r => r.status === 'failed' || r.status === 'error').length
    };

    console.log('[video-status] 완료:', {
      processingTime: Date.now() - startTime,
      summary
    });

    return res.status(200).json({
      success: true,
      segments: results,
      summary,
      processingTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('[video-status] 전체 오류:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime
    });
  }
}

// 캐시 정리 (메모리 관리)
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;
  for (const [taskId, data] of CACHE.entries()) {
    if (now - data.updatedAt > maxAge) {
      CACHE.delete(taskId);
      console.log(`[video-status] 캐시 정리: ${taskId.substring(0, 8)}`);
    }
  }
}, 60 * 60 * 1000);

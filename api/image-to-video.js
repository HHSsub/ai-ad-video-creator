// 2025년 최신 Freepik Image-to-Video API 연동
const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

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

// Freepik API 호출 (재시도 로직)
async function callFreepikVideoAPI(url, options, label = 'VideoAPI') {
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[${label}] 시도 ${attempt}/${MAX_RETRIES}: ${url}`);
      
      const response = await fetch(url, {
        ...options,
        timeout: 60000 // 비디오는 더 긴 타임아웃
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.warn(`[${label}] HTTP ${response.status}:`, data);
        
        if (isRetryableError(data, response.status) && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY * attempt;
          console.log(`[${label}] ${delay}ms 후 재시도...`);
          await sleep(delay);
          continue;
        }
        
        throw new Error(`HTTP ${response.status}: ${data.message || data.error || 'Unknown error'}`);
      }
      
      console.log(`[${label}] 성공 (시도 ${attempt})`);
      return { success: true, data };
      
    } catch (error) {
      lastError = error;
      console.error(`[${label}] 시도 ${attempt} 실패:`, error.message);
      
      if (isRetryableError(error, null) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt;
        console.log(`[${label}] ${delay}ms 후 재시도...`);
        await sleep(delay);
        continue;
      }
      
      break;
    }
  }
  
  throw lastError || new Error(`${label} 최대 재시도 횟수 초과`);
}

// 프롬프트 최적화
function optimizeVideoPrompt(prompt) {
  let optimized = prompt.trim();
  
  // 비디오 특화 키워드 추가
  const videoKeywords = ['smooth motion', 'cinematic', 'professional'];
  const hasVideoKeywords = videoKeywords.some(keyword => 
    optimized.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (!hasVideoKeywords) {
    optimized += ', smooth motion, cinematic movement, professional video';
  }
  
  // Freepik 비디오 프롬프트 제한 (2000자)
  if (optimized.length > 2000) {
    optimized = optimized.substring(0, 1950) + '...';
  }
  
  return optimized;
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
    const { 
      imageUrl, 
      prompt, 
      duration = 6, 
      sceneNumber, 
      conceptId, 
      title 
    } = req.body || {};
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl required' });
    }
    
    console.log('[image-to-video] 시작:', {
      sceneNumber,
      conceptId,
      duration,
      title,
      imageUrl: imageUrl.substring(0, 50) + '...'
    });

    // API 키 확인
    const apiKey = process.env.FREEPIK_API_KEY || 
                   process.env.VITE_FREEPIK_API_KEY;
    
    if (!apiKey) {
      throw new Error('Freepik API 키가 설정되지 않았습니다');
    }

    // 2025 Freepik Image-to-Video API 엔드포인트
    const endpoint = `${FREEPIK_API_BASE}/ai/image-to-video`;
    
    // 프롬프트 최적화
    const optimizedPrompt = optimizeVideoPrompt(prompt || 'High quality cinematic video');
    
    // API 요청 본문 (2025년 최신 스펙)
    const requestBody = {
      prompt: optimizedPrompt,
      first_frame_image: imageUrl,
      duration: Math.min(Math.max(duration, 2), 10), // 2-10초 제한
      aspect_ratio: 'widescreen_16_9',
      fps: 24,
      motion_strength: 'medium',
      seed: Math.floor(Math.random() * 1000000),
      enhance_prompt: true
    };

    console.log('[image-to-video] API 요청:', {
      prompt: optimizedPrompt.substring(0, 100) + '...',
      duration: requestBody.duration,
      aspect_ratio: requestBody.aspect_ratio,
      motion_strength: requestBody.motion_strength
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-freepik-api-key': apiKey,
        'User-Agent': 'AI-Ad-Creator/1.0'
      },
      body: JSON.stringify(requestBody)
    };

    // API 호출
    const result = await callFreepikVideoAPI(endpoint, options, 'image-to-video');
    
    if (!result.success || !result.data.data?.task_id) {
      throw new Error('비디오 생성 태스크 ID를 받지 못했습니다');
    }
    
    const taskId = result.data.data.task_id;
    const processingTime = Date.now() - startTime;
    
    console.log('[image-to-video] 성공:', {
      taskId,
      sceneNumber,
      conceptId,
      처리시간: processingTime + 'ms'
    });

    // 성공 응답
    res.status(200).json({
      success: true,
      taskId,
      sceneNumber,
      conceptId,
      title,
      duration: requestBody.duration,
      processingTime,
      metadata: {
        prompt: optimizedPrompt,
        imageUrl: imageUrl.substring(0, 100) + '...',
        apiEndpoint: endpoint,
        requestId: `${conceptId}-${sceneNumber}-${Date.now()}`
      }
    });

  } catch (error) {
    console.error('[image-to-video] 오류:', error);
    
    const processingTime = Date.now() - startTime;
    
    // 에러 응답이지만 클라이언트에서 처리할 수 있도록 구조화
    res.status(200).json({
      success: false,
      error: error.message,
      sceneNumber: req.body?.sceneNumber,
      conceptId: req.body?.conceptId,
      title: req.body?.title,
      duration: req.body?.duration || 6,
      processingTime,
      fallback: true,
      metadata: {
        originalError: error.message,
        imageUrl: req.body?.imageUrl?.substring(0, 100) + '...' || 'N/A'
      }
    });
  }
}

// 2025년 최신 Freepik Image-to-Video API (MiniMax Hailuo-02) 정확한 연동
const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 에러 재시도 가능 여부 판단
function isRetryableError(statusCode, errorMessage) {
  if ([429, 500, 502, 503, 504].includes(statusCode)) return true;
  const msg = (errorMessage || '').toLowerCase();
  return msg.includes('timeout') || 
         msg.includes('overloaded') || 
         msg.includes('rate limit') ||
         msg.includes('quota');
}

// 안전한 API 호출 (재시도 로직)
async function safeFreepikCall(url, options, label = 'API') {
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[${label}] 시도 ${attempt}/${MAX_RETRIES}: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90초 타임아웃
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          console.error(`[${label}] HTTP ${response.status}:`, errorText);
        } catch (e) {
          errorText = `HTTP ${response.status}`;
        }
        
        if (isRetryableError(response.status, errorText) && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY * attempt;
          console.log(`[${label}] ${delay}ms 후 재시도...`);
          await sleep(delay);
          continue;
        }
        
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log(`[${label}] 성공 (시도 ${attempt})`);
      return data;
      
    } catch (error) {
      lastError = error;
      console.error(`[${label}] 시도 ${attempt} 실패:`, error.message);
      
      if (isRetryableError(null, error.message) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt;
        console.log(`[${label}] ${delay}ms 후 재시도...`);
        await sleep(delay);
        continue;
      }
      
      break;
    }
  }
  
  throw lastError || new Error(`${label} 최대 재시도 초과`);
}

// 프롬프트 최적화
function optimizeVideoPrompt(prompt) {
  let optimized = prompt.trim();
  
  // 비디오 특화 키워드 추가 (사용자 컨텍스트 보존하면서)
  if (!optimized.toLowerCase().includes('motion') && 
      !optimized.toLowerCase().includes('movement') &&
      !optimized.toLowerCase().includes('animation')) {
    optimized += ', smooth natural motion, realistic movement';
  }
  
  // Freepik 제한 (1000자)
  if (optimized.length > 950) {
    optimized = optimized.substring(0, 900) + '...';
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
                   process.env.VITE_FREEPIK_API_KEY ||
                   process.env.REACT_APP_FREEPIK_API_KEY;
    
    if (!apiKey) {
      throw new Error('Freepik API 키가 설정되지 않았습니다');
    }

    // 2025년 정확한 Freepik MiniMax Hailuo-02 엔드포인트
    const endpoint = `${FREEPIK_API_BASE}/ai/image-to-video/minimax-hailuo-02-768p`;
    
    // 프롬프트 최적화 (사용자 컨텍스트 유지)
    const optimizedPrompt = optimizeVideoPrompt(prompt || 'natural smooth motion');
    
    // 2025년 공식 API 스펙에 맞는 요청 본문
    const requestBody = {
      prompt: optimizedPrompt,
      first_frame_image: imageUrl,
      duration: Math.min(Math.max(duration, 2), 10), // 2-10초 제한
      prompt_optimizer: true, // 자동 프롬프트 최적화
      webhook_url: null // 선택적 웹훅
    };

    console.log('[image-to-video] API 요청 파라미터:', {
      endpoint,
      prompt: optimizedPrompt.substring(0, 100) + '...',
      duration: requestBody.duration,
      first_frame_image: imageUrl.substring(0, 60) + '...',
      prompt_optimizer: requestBody.prompt_optimizer
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-freepik-api-key': apiKey,
        'User-Agent': 'AI-Ad-Creator/2025'
      },
      body: JSON.stringify(requestBody)
    };

    // API 호출 (재시도 로직 포함)
    const result = await safeFreepikCall(endpoint, options, 'image-to-video');
    
    console.log('[image-to-video] API 응답 구조:', {
      hasData: !!result.data,
      dataKeys: result.data ? Object.keys(result.data) : [],
      hasTaskId: !!(result.data?.task_id),
      status: result.data?.status || 'unknown'
    });
    
    if (!result.data || !result.data.task_id) {
      console.error('[image-to-video] 응답에 task_id 없음:', JSON.stringify(result, null, 2));
      throw new Error('비디오 생성 태스크 ID를 받지 못했습니다');
    }
    
    const taskId = result.data.task_id;
    const processingTime = Date.now() - startTime;
    
    console.log('[image-to-video] 성공:', {
      taskId,
      sceneNumber,
      conceptId,
      처리시간: processingTime + 'ms'
    });

    // 성공 응답 (2025년 표준 형식)
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
        apiProvider: 'Freepik MiniMax Hailuo-02',
        requestId: `${conceptId}-${sceneNumber}-${Date.now()}`
      }
    });

  } catch (error) {
    console.error('[image-to-video] 오류:', error);
    
    const processingTime = Date.now() - startTime;
    
    // 에러 응답도 일관된 구조로
    res.status(500).json({
      success: false,
      error: error.message,
      sceneNumber: req.body?.sceneNumber,
      conceptId: req.body?.conceptId,
      title: req.body?.title,
      duration: req.body?.duration || 6,
      processingTime,
      metadata: {
        originalError: error.message,
        imageUrl: req.body?.imageUrl?.substring(0, 100) + '...' || 'N/A',
        timestamp: new Date().toISOString()
      }
    });
  }
}

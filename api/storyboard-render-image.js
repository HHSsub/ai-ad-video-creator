import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// 2025년 최신 Freepik API 엔드포인트 및 설정
const FREEPIK_API_BASE = 'https://api.freepik.com/v1';

// 재시도 설정
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const POLLING_MAX_ATTEMPTS = 30;
const POLLING_INTERVAL = 3000;

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

// Freepik API 호출 (재시도 로직 포함)
async function callFreepikAPI(url, options, label = 'API') {
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[${label}] 시도 ${attempt}/${MAX_RETRIES}: ${url}`);
      
      const response = await fetch(url, {
        ...options,
        timeout: 30000 // 30초 타임아웃
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

// 이미지 생성 요청 (2025 Freepik API)
async function generateImage(prompt, apiKey) {
  const url = `${FREEPIK_API_BASE}/ai/text-to-image`;
  
  // 프롬프트 최적화
  const optimizedPrompt = optimizePrompt(prompt);
  
  const requestBody = {
    prompt: optimizedPrompt,
    negative_prompt: 'blurry, distorted, low quality, watermark, text, logo, oversaturated, noise',
    num_images: 1,
    image: {
      size: 'widescreen_16_9' // 광고 영상에 적합한 16:9 비율
    },
    style: 'photorealistic',
    guidance_scale: 7.5,
    filter_nsfw: true,
    enhance_prompt: true
  };
  
  console.log('[generateImage] 요청 데이터:', {
    prompt: optimizedPrompt.substring(0, 100) + '...',
    size: requestBody.image.size,
    style: requestBody.style
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
  
  return await callFreepikAPI(url, options, 'generateImage');
}

// 프롬프트 최적화
function optimizePrompt(prompt) {
  // 기본 품질 키워드가 없으면 추가
  let optimized = prompt.trim();
  
  const qualityKeywords = ['4K', '8K', 'high quality', 'professional', 'detailed', 'sharp focus'];
  const hasQuality = qualityKeywords.some(keyword => 
    optimized.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (!hasQuality) {
    optimized += ', professional commercial photography, high quality, detailed, sharp focus, 4K';
  }
  
  // 너무 긴 프롬프트 정리 (Freepik 제한: 1000자)
  if (optimized.length > 1000) {
    optimized = optimized.substring(0, 950) + '...';
  }
  
  return optimized;
}

// 이미지 생성 상태 폴링
async function pollImageStatus(taskId, apiKey) {
  const url = `${FREEPIK_API_BASE}/ai/text-to-image/${taskId}`;
  
  const options = {
    method: 'GET',
    headers: {
      'x-freepik-api-key': apiKey,
      'User-Agent': 'AI-Ad-Creator/1.0'
    }
  };
  
  for (let attempt = 1; attempt <= POLLING_MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[pollImageStatus] 폴링 ${attempt}/${POLLING_MAX_ATTEMPTS}: ${taskId}`);
      
      const result = await callFreepikAPI(url, options, `pollStatus-${attempt}`);
      const status = result.data.data?.status;
      
      console.log(`[pollImageStatus] 상태: ${status}`);
      
      if (status === 'completed') {
        const imageData = result.data.data;
        if (imageData.image && imageData.image.url) {
          console.log('[pollImageStatus] 이미지 생성 완료');
          return {
            success: true,
            imageUrl: imageData.image.url,
            data: imageData
          };
        } else {
          throw new Error('완료되었지만 이미지 URL이 없음');
        }
      } else if (status === 'failed' || status === 'error') {
        throw new Error(`이미지 생성 실패: ${status}`);
      } else if (status === 'processing' || status === 'queued') {
        console.log(`[pollImageStatus] 대기 중... (${status})`);
        await sleep(POLLING_INTERVAL);
        continue;
      } else {
        console.warn(`[pollImageStatus] 알 수 없는 상태: ${status}`);
        await sleep(POLLING_INTERVAL);
        continue;
      }
      
    } catch (error) {
      console.error(`[pollImageStatus] 폴링 ${attempt} 실패:`, error.message);
      
      if (attempt === POLLING_MAX_ATTEMPTS) {
        throw new Error(`폴링 타임아웃: ${error.message}`);
      }
      
      await sleep(POLLING_INTERVAL);
    }
  }
  
  throw new Error('이미지 생성 타임아웃');
}

// 이미지를 로컬에 저장
async function saveImageLocally(imageUrl, conceptId, sceneNumber) {
  try {
    console.log('[saveImageLocally] 다운로드 시작:', imageUrl);
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`이미지 다운로드 실패: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const outDir = path.resolve(process.cwd(), 'tmp', 'images');
    
    // 디렉토리 생성
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    
    // 파일명 생성
    const hash = crypto.randomBytes(8).toString('hex');
    const fileName = `img_${conceptId}_${sceneNumber}_${hash}.jpg`;
    const filePath = path.join(outDir, fileName);
    
    // 파일 저장
    fs.writeFileSync(filePath, Buffer.from(buffer));
    
    const localUrl = `/tmp/images/${fileName}`;
    console.log('[saveImageLocally] 저장 완료:', localUrl);
    
    return localUrl;
    
  } catch (error) {
    console.error('[saveImageLocally] 저장 실패:', error.message);
    // 저장 실패해도 원본 URL 반환
    return imageUrl;
  }
}

// 폴백 이미지 생성
function generateFallbackImage(conceptId, sceneNumber) {
  console.log('[generateFallbackImage] 폴백 이미지 생성');
  
  // 기본 플레이스홀더 이미지 URL들
  const placeholderImages = [
    'https://via.placeholder.com/1920x1080/3B82F6/FFFFFF?text=Professional+Scene+1',
    'https://via.placeholder.com/1920x1080/10B981/FFFFFF?text=Product+Showcase+2', 
    'https://via.placeholder.com/1920x1080/F59E0B/FFFFFF?text=Lifestyle+Scene+3',
    'https://via.placeholder.com/1920x1080/EF4444/FFFFFF?text=Action+Scene+4',
    'https://via.placeholder.com/1920x1080/8B5CF6/FFFFFF?text=Brand+Identity+5',
    'https://via.placeholder.com/1920x1080/06B6D4/FFFFFF?text=Call+to+Action+6'
  ];
  
  const imageIndex = (sceneNumber - 1) % placeholderImages.length;
  return placeholderImages[imageIndex];
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
    const { prompt, sceneNumber, conceptId, style } = req.body || {};
    
    if (!prompt) {
      return res.status(400).json({ error: 'prompt required' });
    }
    
    console.log('[storyboard-render-image] 시작:', {
      conceptId,
      sceneNumber,
      style,
      promptLength: prompt.length
    });

    // API 키 확인
    const apiKey = process.env.FREEPIK_API_KEY ||
                   process.env.VITE_FREEPIK_API_KEY ||
                   process.env.REACT_APP_FREEPIK_API_KEY;
    
    if (!apiKey) {
      console.error('[storyboard-render-image] Freepik API 키 없음');
      // API 키가 없어도 폴백 이미지로 응답
      const fallbackUrl = generateFallbackImage(conceptId, sceneNumber);
      return res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        message: 'API 키 없음, 폴백 이미지 사용'
      });
    }

    console.log('[storyboard-render-image] API 키 확인됨');

    try {
      // 1. 이미지 생성 요청
      console.log('[storyboard-render-image] 1단계: 이미지 생성 요청');
      const generateResult = await generateImage(prompt, apiKey);
      
      if (!generateResult.success || !generateResult.data.data?.task_id) {
        throw new Error('이미지 생성 요청 실패');
      }
      
      const taskId = generateResult.data.data.task_id;
      console.log('[storyboard-render-image] Task ID 획득:', taskId);
      
      // 2. 상태 폴링
      console.log('[storyboard-render-image] 2단계: 상태 폴링 시작');
      const pollResult = await pollImageStatus(taskId, apiKey);
      
      if (!pollResult.success) {
        throw new Error('이미지 생성 폴링 실패');
      }
      
      // 3. 이미지 로컬 저장 시도
      console.log('[storyboard-render-image] 3단계: 이미지 저장');
      const finalUrl = await saveImageLocally(pollResult.imageUrl, conceptId, sceneNumber);
      
      const processingTime = Date.now() - startTime;
      
      console.log('[storyboard-render-image] 성공 완료:', {
        conceptId,
        sceneNumber,
        처리시간: processingTime + 'ms',
        finalUrl: finalUrl.substring(0, 50) + '...'
      });
      
      res.status(200).json({
        success: true,
        url: finalUrl,
        taskId: taskId,
        processingTime: processingTime,
        metadata: {
          conceptId,
          sceneNumber,
          style,
          originalUrl: pollResult.imageUrl,
          promptUsed: optimizePrompt(prompt).substring(0, 100) + '...'
        }
      });
      
    } catch (apiError) {
      console.error('[storyboard-render-image] API 오류:', apiError.message);
      
      // API 실패시 폴백 이미지 사용
      const fallbackUrl = generateFallbackImage(conceptId, sceneNumber);
      
      console.log('[storyboard-render-image] 폴백 이미지 사용:', fallbackUrl);
      
      res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        error: apiError.message,
        processingTime: Date.now() - startTime,
        metadata: {
          conceptId,
          sceneNumber,
          style,
          promptUsed: prompt.substring(0, 100) + '...'
        }
      });
    }
    
  } catch (error) {
    console.error('[storyboard-render-image] 전체 오류:', error);
    
    // 최종 폴백 - 완전 실패 방지
    const fallbackUrl = generateFallbackImage(
      req.body?.conceptId || 1, 
      req.body?.sceneNumber || 1
    );
    
    res.status(200).json({
      success: true,
      url: fallbackUrl,
      fallback: true,
      error: error.message,
      processingTime: Date.now() - startTime
    });
  }
}

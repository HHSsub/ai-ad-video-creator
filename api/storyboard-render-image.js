import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function isRetryableError(error, statusCode) {
  if ([429, 500, 502, 503, 504].includes(statusCode)) return true;
  const message = error?.message?.toLowerCase() || '';
  return message.includes('timeout') || 
         message.includes('network') || 
         message.includes('fetch') ||
         message.includes('overload');
}

async function callFreepikAPI(url, options, label = 'API') {
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[${label}] 시도 ${attempt}/${MAX_RETRIES}: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const responseText = await response.text();
      console.log(`[${label}] HTTP ${response.status} 응답:`, responseText.substring(0, 300));
      
      if (!response.ok) {
        if (isRetryableError({ message: responseText }, response.status) && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY * attempt;
          console.log(`[${label}] ${delay}ms 후 재시도...`);
          await sleep(delay);
          continue;
        }
        
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`JSON 파싱 실패: ${responseText}`);
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

// Classic API (올바른 파라미터)
async function generateImageClassic(prompt, apiKey) {
  const url = `${FREEPIK_API_BASE}/ai/text-to-image`;
  
  const optimizedPrompt = optimizePrompt(prompt);
  
  // 올바른 Classic API 파라미터
  const requestBody = {
    prompt: optimizedPrompt,
    negative_prompt: "blurry, distorted, low quality, watermark, text, logo, oversaturated, noise",
    guidance_scale: 7.5,
    seed: Math.floor(Math.random() * 1000000),
    num_images: 1,
    image: {
      size: "widescreen_16_9"
    },
    styling: {
      style: "photo" // 올바른 스타일 값
    },
    filter_nsfw: true
  };
  
  console.log('[generateImageClassic] 요청:', {
    prompt: optimizedPrompt.substring(0, 100) + '...',
    style: requestBody.styling.style,
    size: requestBody.image.size
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
  
  const result = await callFreepikAPI(url, options, 'generateImageClassic');
  
  console.log('[generateImageClassic] 전체 응답:', JSON.stringify(result.data, null, 2));
  
  // Classic API 응답 구조 처리
  if (result.data && result.data.data && Array.isArray(result.data.data) && result.data.data.length > 0) {
    const imageUrl = result.data.data[0];
    console.log('[generateImageClassic] 이미지 URL:', imageUrl);
    return {
      success: true,
      imageUrl: imageUrl,
      method: 'classic'
    };
  } else {
    throw new Error('Classic API에서 이미지 URL을 찾을 수 없음');
  }
}

// Imagen3 API (올바른 파라미터)
async function generateImageImagen3(prompt, apiKey) {
  const url = `${FREEPIK_API_BASE}/ai/text-to-image/imagen3`;
  
  const optimizedPrompt = optimizePrompt(prompt);
  
  // 올바른 Imagen3 파라미터
  const requestBody = {
    prompt: optimizedPrompt,
    num_images: 1,
    aspect_ratio: "widescreen_16_9",
    styling: {
      style: "photo" // photo, digital-art, 3d 등 유효한 값
    },
    person_generation: "allow_adult",
    safety_settings: "block_low_and_above"
  };
  
  console.log('[generateImageImagen3] 요청:', {
    prompt: optimizedPrompt.substring(0, 100) + '...',
    style: requestBody.styling.style,
    aspect_ratio: requestBody.aspect_ratio
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
  
  const result = await callFreepikAPI(url, options, 'generateImageImagen3');
  
  if (result.data && result.data.task_id) {
    console.log('[generateImageImagen3] Task ID:', result.data.task_id);
    return {
      success: true,
      taskId: result.data.task_id,
      method: 'imagen3'
    };
  } else {
    throw new Error('Imagen3 Task ID를 받지 못했습니다');
  }
}

// Imagen3 상태 확인
async function checkImagen3Status(taskId, apiKey) {
  const url = `${FREEPIK_API_BASE}/ai/text-to-image/imagen3/${taskId}`;
  
  const options = {
    method: 'GET',
    headers: {
      'x-freepik-api-key': apiKey,
      'User-Agent': 'AI-Ad-Creator/1.0'
    }
  };
  
  const result = await callFreepikAPI(url, options, `checkImagen3-${taskId.substring(0, 8)}`);
  
  console.log('[checkImagen3Status] 응답:', result.data);
  
  if (result.data.task_status === 'COMPLETED' && result.data.generated && result.data.generated.length > 0) {
    return {
      success: true,
      imageUrl: result.data.generated[0],
      status: 'completed'
    };
  } else if (result.data.task_status === 'FAILED') {
    throw new Error('Imagen3 이미지 생성 실패');
  } else {
    return {
      success: true,
      status: result.data.task_status || 'IN_PROGRESS'
    };
  }
}

function optimizePrompt(prompt) {
  let optimized = prompt.trim();
  
  if (optimized.length > 800) {
    optimized = optimized.substring(0, 750) + '...';
  }
  
  const qualityKeywords = ['high quality', 'professional', 'detailed', '4K'];
  const hasQuality = qualityKeywords.some(keyword => 
    optimized.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (!hasQuality) {
    optimized += ', high quality, professional photography, detailed';
  }
  
  return optimized;
}

async function saveImageLocally(imageUrl, conceptId, sceneNumber) {
  try {
    console.log('[saveImageLocally] 다운로드 시작:', imageUrl);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`이미지 다운로드 실패: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const outDir = path.resolve(process.cwd(), 'tmp', 'images');
    
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    
    const hash = crypto.randomBytes(8).toString('hex');
    const fileName = `img_${conceptId}_${sceneNumber}_${hash}.jpg`;
    const filePath = path.join(outDir, fileName);
    
    fs.writeFileSync(filePath, Buffer.from(buffer));
    
    const localUrl = `/tmp/images/${fileName}`;
    console.log('[saveImageLocally] 저장 완료:', localUrl);
    
    return localUrl;
    
  } catch (error) {
    console.error('[saveImageLocally] 저장 실패:', error.message);
    return imageUrl;
  }
}

function generateFallbackImage(conceptId, sceneNumber) {
  console.log('[generateFallbackImage] 폴백 이미지 생성');
  
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

    const apiKey = process.env.FREEPIK_API_KEY ||
                   process.env.VITE_FREEPIK_API_KEY ||
                   process.env.REACT_APP_FREEPIK_API_KEY;
    
    if (!apiKey) {
      console.error('[storyboard-render-image] API 키 없음');
      const fallbackUrl = generateFallbackImage(conceptId, sceneNumber);
      return res.status(200).json({
        success: true,
        url: fallbackUrl,
        fallback: true,
        message: 'API 키 없음'
      });
    }

    console.log('[storyboard-render-image] API 키 확인됨');

    let finalResult = null;

    // 1. Classic API 시도
    try {
      console.log('[storyboard-render-image] Classic API 시도');
      const classicResult = await generateImageClassic(prompt, apiKey);
      
      if (classicResult.success) {
        console.log('[storyboard-render-image] Classic API 성공');
        finalResult = {
          imageUrl: classicResult.imageUrl,
          method: 'classic'
        };
      }
    } catch (classicError) {
      console.warn('[storyboard-render-image] Classic API 실패:', classicError.message);
      
      // 2. Classic 실패시 Imagen3 시도
      try {
        console.log('[storyboard-render-image] Imagen3 API 시도');
        const imagen3Result = await generateImageImagen3(prompt, apiKey);
        
        if (imagen3Result.success) {
          console.log('[storyboard-render-image] Imagen3 폴링 시작');
          
          // 폴링으로 완료 대기
          for (let attempt = 1; attempt <= 10; attempt++) {
            await sleep(5000); // 5초 대기
            
            try {
              const statusResult = await checkImagen3Status(imagen3Result.taskId, apiKey);
              
              if (statusResult.success && statusResult.status === 'completed') {
                console.log('[storyboard-render-image] Imagen3 완료');
                finalResult = {
                  imageUrl: statusResult.imageUrl,
                  method: 'imagen3',
                  taskId: imagen3Result.taskId
                };
                break;
              }
              
              console.log(`[storyboard-render-image] Imagen3 폴링 ${attempt}/10: ${statusResult.status}`);
            } catch (pollError) {
              console.error(`[storyboard-render-image] 폴링 ${attempt} 실패:`, pollError.message);
            }
          }
          
          if (!finalResult) {
            throw new Error('Imagen3 폴링 타임아웃');
          }
        }
      } catch (imagen3Error) {
        console.error('[storyboard-render-image] Imagen3도 실패:', imagen3Error.message);
        throw imagen3Error;
      }
    }

    // 성공한 경우 처리
    if (finalResult) {
      let finalUrl = finalResult.imageUrl;
      
      // 로컬 저장 시도
      try {
        const localUrl = await saveImageLocally(finalResult.imageUrl, conceptId, sceneNumber);
        if (localUrl !== finalResult.imageUrl) {
          finalUrl = localUrl;
        }
      } catch (saveError) {
        console.warn('[storyboard-render-image] 로컬 저장 실패:', saveError.message);
      }
      
      const processingTime = Date.now() - startTime;
      
      console.log('[storyboard-render-image] 최종 성공:', {
        conceptId,
        sceneNumber,
        method: finalResult.method,
        처리시간: processingTime + 'ms'
      });
      
      return res.status(200).json({
        success: true,
        url: finalUrl,
        processingTime: processingTime,
        metadata: {
          conceptId,
          sceneNumber,
          style,
          method: finalResult.method,
          taskId: finalResult.taskId || null,
          promptUsed: optimizePrompt(prompt).substring(0, 100) + '...'
        }
      });
    }
    
  } catch (error) {
    console.error('[storyboard-render-image] 전체 오류:', error);
  }
  
  // 모든 것이 실패한 경우 폴백
  const fallbackUrl = generateFallbackImage(
    req.body?.conceptId || 1, 
    req.body?.sceneNumber || 1
  );
  
  console.log('[storyboard-render-image] 폴백 사용:', fallbackUrl);
  
  return res.status(200).json({
    success: true,
    url: fallbackUrl,
    fallback: true,
    processingTime: Date.now() - startTime
  });
}

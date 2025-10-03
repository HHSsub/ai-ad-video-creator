// api/storyboard-init.js - 완전 수정 (영상길이 나누기 2 로직 + JSON 파싱 개선)
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🔥 프롬프트 파일 매핑
const PROMPT_FILE_MAPPING = {
  'step1_product': 'Prompt_step1_product.txt',
  'step1_service': 'Prompt_step1_service.txt',
  'step2_product': 'Prompt_step2_product.txt',
  'step2_service': 'Prompt_step2_service.txt'
};

// 🔥🔥🔥 영상 길이에 따른 씬 수 결정 - 영상길이 나누기 2
function getSceneCount(videoLength) {
  const lengthNumber = parseInt(videoLength);
  console.log(`[getSceneCount] 입력: ${videoLength} → ${lengthNumber}초`);
  
  // 영상 길이 나누기 2 = 씬 수
  const sceneCount = Math.floor(lengthNumber / 2);
  
  console.log(`[getSceneCount] 결과: ${lengthNumber}초 ÷ 2 = ${sceneCount}씬`);
  return sceneCount;
}

// 종횡비 코드 매핑
function mapAspectRatio(aspectRatio) {
  console.log(`[mapAspectRatio] 입력: ${aspectRatio}`);
  
  if (!aspectRatio || typeof aspectRatio !== 'string') {
    console.log('[mapAspectRatio] → 기본값: widescreen_16_9');
    return 'widescreen_16_9';
  }

  const cleanRatio = aspectRatio.toLowerCase().trim();
  
  if (cleanRatio.includes('16:9') || cleanRatio.includes('가로') || cleanRatio.includes('widescreen')) {
    console.log('[mapAspectRatio] → widescreen_16_9');
    return 'widescreen_16_9';
  }
  
  if (cleanRatio.includes('1:1') || cleanRatio.includes('정사각형') || cleanRatio.includes('square')) {
    console.log('[mapAspectRatio] → square_1_1');
    return 'square_1_1';
  }
  
  if (cleanRatio.includes('9:16') || cleanRatio.includes('세로') || cleanRatio.includes('portrait')) {
    console.log('[mapAspectRatio] → portrait_9_16');
    return 'portrait_9_16';
  }

  console.log('[mapAspectRatio] 기본값: widescreen_16_9');
  return 'widescreen_16_9';
}

// 해상도 매핑 함수들
function getWidthFromAspectRatio(aspectRatio) {
  const resolutions = {
    'widescreen_16_9': 1344,
    'vertical_9_16': 768,
    'square_1_1': 1024,
    'portrait_9_16': 768
  };
  return resolutions[aspectRatio] || 1344;
}

function getHeightFromAspectRatio(aspectRatio) {
  const resolutions = {
    'widescreen_16_9': 768,
    'vertical_9_16': 1344,
    'square_1_1': 1024,
    'portrait_9_16': 1344
  };
  return resolutions[aspectRatio] || 768;
}

// PRODUCT COMPOSITING SCENE 감지
function detectProductCompositingScenes(phase1_output, videoPurpose) {
  const compositingScenes = [];

  try {
    const lines = phase1_output.split('\n');
    let currentSceneNumber = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 씬 번호 감지
      const sceneMatch = line.match(/S#(\d+)|Scene\s+(\d+)|씬\s*(\d+)/i);
      if (sceneMatch) {
        currentSceneNumber = parseInt(sceneMatch[1] || sceneMatch[2] || sceneMatch[3], 10);
      }

      // 🔥 명시적 PRODUCT COMPOSITING SCENE만 감지
      if (line.includes('[PRODUCT COMPOSITING SCENE]') || 
          line.includes('제품 합성') || 
          line.includes('Product Compositing')) {
        compositingScenes.push({
          sceneNumber: currentSceneNumber || compositingScenes.length + 1,
          lineNumber: i + 1,
          content: line.trim(),
          type: 'product_compositing',
          explicit: true,
          context: `제품 합성 씬 ${currentSceneNumber || compositingScenes.length + 1}`,
          videoPurpose: videoPurpose
        });
      }

      // 🔥 암시적 합성 씬 감지 - 주석처리 (로그만 출력)
      // if ((videoPurpose === 'product' || videoPurpose === 'conversion') && 
      //     currentSceneNumber && 
      //     (line.includes('제품') || line.includes('product') || line.includes('상품'))) {
      //   
      //   const hasExplicitCompositing = compositingScenes.some(cs => cs.sceneNumber === currentSceneNumber && cs.explicit);
      //   if (!hasExplicitCompositing) {
      //     console.log(`[detectProductCompositingScenes] 제품 노출 감지 (씬 ${currentSceneNumber}): ${line.substring(0, 50)}...`);
      //   }
      // }
      
      // 🔥 제품 노출 씬 로그만 출력
      if ((videoPurpose === 'product' || videoPurpose === 'conversion') && 
          currentSceneNumber && 
          (line.includes('제품') || line.includes('product') || line.includes('상품'))) {
        const hasExplicitCompositing = compositingScenes.some(cs => cs.sceneNumber === currentSceneNumber && cs.explicit);
        if (!hasExplicitCompositing) {
          console.log(`[detectProductCompositingScenes] 💡 제품 노출 씬 감지 (씬 ${currentSceneNumber}): ${line.substring(0, 80)}...`);
        }
      }
    }

    console.log(`[detectProductCompositingScenes] ✅ 명시적 합성 씬: ${compositingScenes.length}개`);
    return compositingScenes;

  } catch (error) {
    console.error('[detectProductCompositingScenes] 오류:', error);
    return [];
  }
}

// 컨셉 블록 추출
function extractConceptBlocks(content) {
  const blocks = [];
  const lines = content.split('\n');
  let currentBlock = null;
  
  lines.forEach((line, index) => {
    if (line.includes('컨셉') && (line.includes('#') || line.includes('번'))) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      currentBlock = {
        startLine: index + 1,
        title: line.trim(),
        content: [line]
      };
    } else if (currentBlock) {
      currentBlock.content.push(line);
    }
  });
  
  if (currentBlock) {
    blocks.push(currentBlock);
  }
  
  return blocks;
}

// 최종 프롬프트 구성
function buildFinalPrompt(phase1Output, conceptBlocks, requestBody, sceneCount, step2Template) {
  let finalPrompt = step2Template;
  
  // 변수 치환
  finalPrompt = finalPrompt.replace(/{phase1_output}/g, phase1Output);
  finalPrompt = finalPrompt.replace(/{sceneCount}/g, sceneCount);
  finalPrompt = finalPrompt.replace(/{brandName}/g, requestBody.brandName || '');
  finalPrompt = finalPrompt.replace(/{videoPurpose}/g, requestBody.videoPurpose || '');
  finalPrompt = finalPrompt.replace(/{videoLength}/g, requestBody.videoLength || '10');
  
  return finalPrompt;
}

// parseMultiConceptJSON 함수를 다음으로 완전 교체:
function parseMultiConceptJSON(text) {
  try {
    console.log('[parseMultiConceptJSON] 파싱 시작, 텍스트 길이:', text.length);
    console.log('[parseMultiConceptJSON] 첫 500자:', text.substring(0, 500));
    
    // Step2는 JSON 블록들만 추출
    const jsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
    
    console.log(`[parseMultiConceptJSON] 발견된 JSON 블록: ${jsonBlocks.length}개`);
    
    if (jsonBlocks.length === 0) {
      console.error('[parseMultiConceptJSON] JSON 블록 없음');
      const debugPath = path.join(process.cwd(), 'debug_step2_response.txt');
      fs.writeFileSync(debugPath, text, 'utf-8');
      console.log('[parseMultiConceptJSON] Step2 응답 저장:', debugPath);
      return null;
    }
    
    // JSON을 3개씩 묶어서 씬으로 처리 (Image, Motion, Copy)
    const concepts = [];
    const scenesPerConcept = Math.floor(jsonBlocks.length / 6 / 3); // 6개 컨셉
    
    console.log(`[parseMultiConceptJSON] 예상 컨셉당 씬 수: ${scenesPerConcept}개`);
    
    for (let conceptIdx = 0; conceptIdx < 6; conceptIdx++) {
      const conceptData = {
        concept_name: `컨셉 ${conceptIdx + 1}`,
        scenes: {}
      };
      
      const startBlockIdx = conceptIdx * scenesPerConcept * 3;
      
      for (let sceneIdx = 0; sceneIdx < scenesPerConcept; sceneIdx++) {
        const blockIdx = startBlockIdx + (sceneIdx * 3);
        
        if (blockIdx + 2 >= jsonBlocks.length) break;
        
        try {
          const imagePrompt = JSON.parse(jsonBlocks[blockIdx][1].trim());
          const motionPrompt = JSON.parse(jsonBlocks[blockIdx + 1][1].trim());
          const copyPrompt = JSON.parse(jsonBlocks[blockIdx + 2][1].trim());
          
          conceptData.scenes[`scene_${sceneIdx + 1}`] = {
            sceneNumber: sceneIdx + 1,
            title: `씬 ${sceneIdx + 1}`,
            image_prompt: imagePrompt,
            motion_prompt: motionPrompt,
            copy: copyPrompt
          };
          
        } catch (e) {
          console.warn(`[parseMultiConceptJSON] 컨셉 ${conceptIdx + 1} 씬 ${sceneIdx + 1} 파싱 실패:`, e.message);
        }
      }
      
      const sceneCount = Object.keys(conceptData.scenes).length;
      console.log(`[parseMultiConceptJSON] 컨셉 ${conceptIdx + 1}: ${sceneCount}개 씬`);
      
      if (sceneCount > 0) {
        concepts.push(conceptData);
      }
    }
    
    console.log('[parseMultiConceptJSON] ✅ 파싱 완료, 총 컨셉:', concepts.length);
    return { concepts };
    
  } catch (error) {
    console.error('[parseMultiConceptJSON] ❌ 파싱 오류:', error);
    const debugPath = path.join(process.cwd(), 'debug_step2_response.txt');
    fs.writeFileSync(debugPath, text, 'utf-8');
    console.log('[parseMultiConceptJSON] Step2 응답 저장:', debugPath);
    return null;
  }
}

// 안전한 Gemini API 호출
async function safeCallGemini(prompt, options = {}) {
  const { label = 'gemini-call', maxRetries = 3 } = options;
  
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_1;
  console.log(apiKey);
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${label}] Gemini API 호출 시도 ${attempt}/${maxRetries}`);
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text || text.length < 10) {
        throw new Error('Gemini 응답이 너무 짧습니다.');
      }

      console.log(`[${label}] ✅ 성공: ${text.length} chars`);
      return { text };

    } catch (error) {
      console.error(`[${label}] 시도 ${attempt} 실패:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// 합성 정보 분석
function analyzeCompositingInfo(formData, compositingScenes) {
  const imageRef = formData.imageRef || formData.imageUpload;
  const videoPurpose = formData.videoPurpose;
  
  const needsProductImage = videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education';
  const needsBrandLogo = videoPurpose === 'service' || videoPurpose === 'brand';

  return {
    needsCompositing: compositingScenes.length > 0,
    hasProductImage: needsProductImage && !!(imageRef && imageRef.url),
    hasBrandLogo: needsBrandLogo && !!(imageRef && imageRef.url),
    scenes: compositingScenes,
    productImageData: (needsProductImage && imageRef) ? imageRef : null,
    brandLogoData: (needsBrandLogo && imageRef) ? imageRef : null,
    totalCompositingScenes: compositingScenes.length
  };
}

// 제품/서비스에 따른 프롬프트 파일 결정
function getPromptFiles(videoPurpose) {
  console.log(`[getPromptFiles] videoPurpose: ${videoPurpose}`);
  
  if (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education') {
    console.log('[getPromptFiles] → 제품용 프롬프트');
    return {
      step1: 'step1_product',
      step2: 'step2_product'
    };
  } else if (videoPurpose === 'service' || videoPurpose === 'brand') {
    console.log('[getPromptFiles] → 서비스용 프롬프트');
    return {
      step1: 'step1_service',
      step2: 'step2_service'
    };
  }
  
  console.log('[getPromptFiles] → 기본값 (제품용)');
  return {
    step1: 'step1_product',
    step2: 'step2_product'
  };
}

// 사용자 파일 경로 및 함수들
const USERS_FILE = path.join(process.cwd(), 'config', 'users.json');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      console.error('[storyboard-init] 사용자 파일이 없습니다:', USERS_FILE);
      return {};
    }
    
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    const users = JSON.parse(data);
    console.log('[storyboard-init] 사용자 데이터 로드 완료');
    return users;
  } catch (error) {
    console.error('[storyboard-init] 사용자 데이터 로드 오류:', error);
    return {};
  }
}

function saveUsers(users) {
  try {
    const data = JSON.stringify(users, null, 2);
    fs.writeFileSync(USERS_FILE, data, 'utf8');
    console.log('[storyboard-init] 사용자 데이터 저장 완료');
    return true;
  } catch (error) {
    console.error('[storyboard-init] 사용자 데이터 저장 오류:', error);
    return false;
  }
}

function checkAndResetDaily(user) {
  const today = new Date().toISOString().split('T')[0];
  
  if (user.lastResetDate !== today) {
    user.usageCount = 0;
    user.lastResetDate = today;
    console.log('[storyboard-init] 일일 리셋:', user.id);
    return true;
  }
  
  return false;
}

function checkUsageLimit(username) {
  try {
    if (!username) {
      console.warn('[storyboard-init] username이 없습니다');
      return { allowed: false, message: '사용자 정보가 없습니다.' };
    }

    const users = loadUsers();
    const user = users[username];

    if (!user) {
      console.warn('[storyboard-init] 사용자를 찾을 수 없습니다:', username);
      return { allowed: false, message: '존재하지 않는 사용자입니다.' };
    }

    checkAndResetDaily(user);

    if (user.usageCount >= user.dailyLimit) {
      console.warn('[storyboard-init] 일일 사용 한도 초과:', username);
      return { 
        allowed: false, 
        message: `일일 사용 한도(${user.dailyLimit}회)를 초과했습니다. 내일 다시 시도해주세요.`,
        usageCount: user.usageCount,
        dailyLimit: user.dailyLimit
      };
    }

    user.usageCount += 1;
    saveUsers(users);

    console.log('[storyboard-init] 사용 횟수 증가:', {
      username,
      usageCount: user.usageCount,
      dailyLimit: user.dailyLimit
    });

    return { 
      allowed: true, 
      usageCount: user.usageCount,
      dailyLimit: user.dailyLimit,
      remaining: user.dailyLimit - user.usageCount
    };
  } catch (error) {
    console.error('[storyboard-init] 사용 한도 확인 오류:', error);
    return { allowed: true };
  }
}

// 🔥 메인 핸들러
export default async function handler(req, res) {
  const startTime = Date.now();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const username = req.headers['x-username'];
    
    if (username && username !== 'undefined' && username !== 'null') {
      const usageCheck = checkUsageLimit(username);
      
      if (!usageCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: usageCheck.message,
          usageCount: usageCheck.usageCount,
          dailyLimit: usageCheck.dailyLimit
        });
      }

      console.log('[storyboard-init] 사용자 사용 가능:', {
        username,
        remaining: usageCheck.remaining
      });
    }

    const { 
      brandName, 
      videoLength, 
      videoPurpose, 
      aspectRatio,
      aspectRatioCode 
    } = req.body;

    if (!brandName || !videoLength || !videoPurpose) {
      return res.status(400).json({
        success: false,
        error: '필수 입력값이 누락되었습니다.'
      });
    }

    console.log('[storyboard-init] 🚀 요청 수신:', {
      brandName,
      videoLength,
      videoPurpose,
      aspectRatio: aspectRatio || aspectRatioCode
    });

    const promptFiles = getPromptFiles(videoPurpose);
    console.log('[storyboard-init] 📝 선택된 프롬프트:', promptFiles);

    const step1FileName = PROMPT_FILE_MAPPING[promptFiles.step1];
    const step1FilePath = path.join(process.cwd(), 'public', step1FileName);

    if (!fs.existsSync(step1FilePath)) {
      console.error(`[storyboard-init] STEP1 프롬프트 파일 없음:`, step1FilePath);
      return res.status(404).json({
        success: false,
        error: `STEP1 프롬프트 파일을 찾을 수 없습니다: ${step1FileName}`
      });
    }

    console.log(`[storyboard-init] 📝 STEP1 프롬프트 파일 로드: ${step1FileName}`);
    let step1PromptTemplate = fs.readFileSync(step1FilePath, 'utf-8');

    const step1Variables = {
      brandName,
      videoLength,
      videoPurpose,
      imageStatus: (req.body.imageRef && req.body.imageRef.url) ? '업로드됨' : '업로드 안됨',
      aspectRatioCode: mapAspectRatio(aspectRatioCode || aspectRatio)
    };

    for (const [key, value] of Object.entries(step1Variables)) {
      const placeholder = `{${key}}`;
      step1PromptTemplate = step1PromptTemplate.replace(new RegExp(placeholder, 'g'), value);
    }

    console.log(`[storyboard-init] ✅ STEP1 변수 치환 완료 (${Object.keys(step1Variables).length}개 변수)`);

    console.log(`[storyboard-init] 📡 STEP1 Gemini API 호출 시작`);
    const step1 = await safeCallGemini(step1PromptTemplate, {
      label: 'STEP1-storyboard-init',
      maxRetries: 3,
      isImageComposition: false
    });

    const phase1_output = step1.text;
    console.log("[storyboard-init] ✅ STEP1 완료:", phase1_output.length, "chars");

    // 🔥 Step1 전체 응답 출력 (절대 이 코드 지우지 말 것)
    console.log('\n========== STEP1 FULL RESPONSE ==========');
    console.log(phase1_output);
    console.log('==========================================\n');

    // 🔥🔥🔥 씬 수 계산: 영상길이 나누기 2
    const sceneCountPerConcept = getSceneCount(videoLength);
    console.log(`[storyboard-init] 📊 컨셉당 씬 수: ${sceneCountPerConcept}개 (${videoLength} ÷ 2)`);

    const compositingScenes = detectProductCompositingScenes(phase1_output, videoPurpose);
    console.log('[storyboard-init] 🎯 감지된 합성 씬:', compositingScenes);

    const conceptBlocks = extractConceptBlocks(phase1_output);
    console.log(`[storyboard-init] 📋 추출된 컨셉 블록: ${conceptBlocks.length}개`);

    const step2FileName = PROMPT_FILE_MAPPING[promptFiles.step2];
    const step2FilePath = path.join(process.cwd(), 'public', step2FileName);

    if (!fs.existsSync(step2FilePath)) {
      console.error(`[storyboard-init] STEP2 프롬프트 파일 없음:`, step2FilePath);
      return res.status(404).json({
        success: false,
        error: `STEP2 프롬프트 파일을 찾을 수 없습니다: ${step2FileName}`
      });
    }

    console.log(`[storyboard-init] 📝 STEP2 프롬프트 파일 로드: ${step2FileName}`);
    const step2PromptContent = fs.readFileSync(step2FilePath, 'utf-8');

    const step2Prompt = buildFinalPrompt(phase1_output, conceptBlocks, req.body, sceneCountPerConcept, step2PromptContent);
    console.log('[storyboard-init] 📡 STEP2 Gemini API 호출 시작');
    console.log(`[storyboard-init] STEP2 프롬프트 길이: ${step2Prompt.length} chars`);

    const step2 = await safeCallGemini(step2Prompt, {
      label: 'STEP2-storyboard-init',
      maxRetries: 3,
      isImageComposition: false
    });

    console.log("[storyboard-init] ✅ STEP2 완료:", step2.text.length, "chars");

    // 🔥 Step2 전체 응답 출력 (절대 이 코드 지우지 말 것)
    console.log('\n========== STEP2 FULL RESPONSE ==========');
    console.log(step2.text);
    console.log('==========================================\n');

    // 🔥🔥🔥 새로운 파싱 함수 사용
    const mcJson = parseMultiConceptJSON(step2.text);
    console.log("[storyboard-init] 📊 JSON 파싱 결과:", mcJson);

    let styles = [];
    if (mcJson && Array.isArray(mcJson.concepts) && mcJson.concepts.length > 0) {
    // 🔥🔥🔥 컨셉 데이터를 스타일 배열로 변환
      styles = mcJson.concepts.map((concept, index) => {
        const imagePrompts = [];
        
        // 각 컨셉의 씬을 이미지 프롬프트로 변환
        for (let i = 1; i <= sceneCountPerConcept; i++) {
          const sceneKey = `scene_${i}`;
          const scene = concept[sceneKey];
          
          if (scene) {
            // 합성 씬 확인
            const isCompositingScene = compositingScenes.some(cs => cs.sceneNumber === i);
            
            imagePrompts.push({
              sceneNumber: i,
              title: scene.title || `씬 ${i}`,
              prompt: scene.image_prompt?.prompt || `${concept.concept_name} scene ${i}`,
              negative_prompt: scene.image_prompt?.negative_prompt || "blurry, low quality, watermark, text, logo",
              motion_prompt: scene.motion_prompt?.prompt || "subtle camera movement",
              copy: scene.copy?.copy || `씬 ${i}`,
              timecode: `00:${String((i-1)*2).padStart(2,'0')}-00:${String(i*2).padStart(2,'0')}`,
              compositingContext: isCompositingScene ? 
                `[PRODUCT COMPOSITING SCENE] ${concept.concept_name} scene ${i}` : 
                `${concept.concept_name} scene ${i}`,
              isCompositing: isCompositingScene,
              compositingInfo: isCompositingScene ? {
                compositingContext: compositingScenes.find(cs => cs.sceneNumber === i)?.context || '[PRODUCT COMPOSITING SCENE]',
                explicit: compositingScenes.find(cs => cs.sceneNumber === i)?.explicit || false,
                videoPurpose: videoPurpose
              } : null,
              aspect_ratio: mapAspectRatio(aspectRatio || aspectRatioCode),
              guidance_scale: scene.image_prompt?.guidance_scale || 7.5,
              seed: scene.image_prompt?.seed || Math.floor(10000 + Math.random() * 90000),
              size: scene.image_prompt?.image?.size || mapAspectRatio(aspectRatio || aspectRatioCode),
              width: getWidthFromAspectRatio(mapAspectRatio(aspectRatio || aspectRatioCode)),
              height: getHeightFromAspectRatio(mapAspectRatio(aspectRatio || aspectRatioCode)),
              styling: scene.image_prompt?.styling || {
                style: 'photo',
                color: 'color',
                lighting: 'natural'
              }
            });
          }
        }

        return {
          id: index + 1,
          concept_id: index + 1,
          conceptId: index + 1,
          conceptName: concept.concept_name,
          style: concept.style || 'Commercial Photography',
          headline: concept.concept_name,
          description: `${videoPurpose} 광고를 위한 ${concept.concept_name} 접근법`,
          copy: concept.concept_name,
          imagePrompts: imagePrompts,
          images: [],
          metadata: {
            videoPurpose: videoPurpose,
            conceptType: concept.concept_name,
            sceneCount: sceneCountPerConcept,
            videoLength: videoLength,
            aspectRatio: mapAspectRatio(aspectRatio || aspectRatioCode)
          }
        };
      });
      
      console.log(`[storyboard-init] ✅ styles 배열 생성 완료: ${styles.length}개 컨셉`);
      console.log(`[storyboard-init] 📊 각 컨셉당 이미지 프롬프트 수: ${styles[0]?.imagePrompts?.length || 0}개`);
    } else {
      console.error('[storyboard-init] ❌ JSON 파싱 실패 또는 컨셉 없음');
    }

    // 🔥 합성 정보 분석 (imageRef 사용)
    const compositingInfo = analyzeCompositingInfo(req.body, compositingScenes);
    console.log('[storyboard-init] 🎨 합성 정보:', compositingInfo);

    // 🔥 메타데이터 생성
    const metadata = {
      promptFiles: promptFiles,
      promptFiles_step1: step1FileName,
      promptFiles_step2: step2FileName,
      videoPurpose,
      videoLength,
      sceneCountPerConcept,
      aspectRatio: mapAspectRatio(aspectRatio || aspectRatioCode),
      generatedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
      geminiModel: "gemini-2.5-flash",
      step1Length: phase1_output.length,
      step2Length: step2.text.length,
      brandName,
      totalConcepts: styles.length,
      compositingScenes: compositingScenes.length,
      hasImageUpload: !!(req.body.imageRef && req.body.imageRef.url)
    };

    const processingTimeMs = Date.now() - startTime;
    console.log(`[storyboard-init] ✅ 전체 처리 완료: ${processingTimeMs}ms`);

    // 🔥 최종 응답 데이터
    const responseData = {
      success: true,
      styles: styles,
      compositingInfo: compositingInfo,
      metadata: metadata,
      rawStep1Response: phase1_output,
      rawStep2Response: step2.text,
      processingTime: processingTimeMs,
      debugInfo: {
        promptFiles: promptFiles,
        promptFiles_step1: step1FileName,
        promptFiles_step2: step2FileName,
        variablesReplaced: Object.keys(step1Variables).length,
        conceptsParsed: mcJson?.concepts?.length || 0,
        compositingScenes: compositingScenes.length,
        totalScenes: styles.length * sceneCountPerConcept,
        sceneCountCalculation: `${videoLength} ÷ 2 = ${sceneCountPerConcept}`,
        expectedImagesPerConcept: sceneCountPerConcept,
        totalExpectedImages: styles.length * sceneCountPerConcept,
        fallbackUsed: !mcJson || !mcJson.concepts || mcJson.concepts.length !== 6
      }
    };

    console.log(`[storyboard-init] 🎉 성공 완료:`, {
      styles: styles.length,
      totalScenes: styles.length * sceneCountPerConcept,
      scenePerConcept: sceneCountPerConcept,
      compositingScenes: compositingScenes.length,
      processingTime: `${processingTimeMs}ms`,
      imagePrompts: styles.reduce((sum, s) => sum + (s.imagePrompts?.length || 0), 0)
    });

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('[storyboard-init] ❌ 전체 오류:', error);

    const processingTimeMs = Date.now() - startTime;
    const errorResponse = {
      success: false,
      error: error.message,
      processingTime: processingTimeMs,
      timestamp: new Date().toISOString(),
      debugInfo: {
        videoPurpose: req.body?.videoPurpose,
        brandName: req.body?.brandName,
        videoLength: req.body?.videoLength,
        errorType: error.constructor.name,
        errorStack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };

    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('api_key') || errorMsg.includes('gemini_api_key') || errorMsg.includes('consumer') || errorMsg.includes('suspended')) {
      errorResponse.error = 'API 할당량에 문제가 있습니다. 관리자에게 문의하세요.';
      errorResponse.errorCode = 'API_QUOTA_ERROR';
      return res.status(503).json(errorResponse);
    }

    if (errorMsg.includes('quota') || errorMsg.includes('limit') || errorMsg.includes('429')) {
      errorResponse.error = 'API 할당량을 초과했습니다. 관리자에게 문의하세요.';
      errorResponse.errorCode = 'API_QUOTA_EXCEEDED';
      return res.status(429).json(errorResponse);
    }

    if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
      errorResponse.error = 'API 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
      errorResponse.errorCode = 'TIMEOUT_ERROR';
      return res.status(408).json(errorResponse);
    }

    if (errorMsg.includes('403') || errorMsg.includes('forbidden') || errorMsg.includes('permission')) {
      errorResponse.error = 'API 권한에 문제가 있습니다. 관리자에게 문의하세요.';
      errorResponse.errorCode = 'API_PERMISSION_ERROR';
      return res.status(403).json(errorResponse);
    }

    errorResponse.error = '스토리보드 생성 중 오류가 발생했습니다. 관리자에게 문의하세요.';
    errorResponse.errorCode = 'UNKNOWN_ERROR';
    return res.status(500).json(errorResponse);
  }
}

// api/storyboard-init.js
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const PROMPT_FILE_MAPPING = {
  'step1_product': 'Prompt_step1_product.txt',
  'step1_service': 'Prompt_step1_service.txt',
  'step2_product': 'Prompt_step2_product.txt',
  'step2_service': 'Prompt_step2_service.txt'
};

function getSceneCount(videoLength) {
  const lengthNumber = parseInt(videoLength);
  console.log(`[getSceneCount] 입력: ${videoLength} → ${lengthNumber}초`);
  const sceneCount = Math.floor(lengthNumber / 2);
  console.log(`[getSceneCount] 결과: ${lengthNumber}초 ÷ 2 = ${sceneCount}씬`);
  return sceneCount;
}

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
  
  console.log('[mapAspectRatio] → 기본값 (인식 실패): widescreen_16_9');
  return 'widescreen_16_9';
}

function getWidthFromAspectRatio(ratio) {
  const widthMap = {
    'widescreen_16_9': 1920,
    'square_1_1': 1024,
    'portrait_9_16': 1080
  };
  return widthMap[ratio] || 1920;
}

function getHeightFromAspectRatio(ratio) {
  const heightMap = {
    'widescreen_16_9': 1080,
    'square_1_1': 1024,
    'portrait_9_16': 1920
  };
  return heightMap[ratio] || 1080;
}

function detectProductCompositingScenes(text, videoPurpose) {
  try {
    console.log(`[detectProductCompositingScenes] 합성 씬 감지 시작 (videoPurpose: ${videoPurpose})`);
    
    const compositingScenes = [];
    const lines = text.split('\n');
    
    let currentSceneNumber = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      const sceneMatch = line.match(/S#(\d+)/);
      if (sceneMatch) {
        currentSceneNumber = parseInt(sceneMatch[1]);
      }
      
      if (line.includes('[PRODUCT COMPOSITING SCENE]') || line.includes('PRODUCT COMPOSITING SCENE')) {
        const sceneNum = currentSceneNumber || parseInt(line.match(/S#(\d+)/)?.[1] || 0);
        
        if (sceneNum > 0) {
          console.log(`[detectProductCompositingScenes] 🎯 명시적 합성 씬 발견: S#${sceneNum} (라인 ${i + 1})`);
          compositingScenes.push({
            sceneNumber: sceneNum,
            lineNumber: i + 1,
            content: line.trim(),
            type: 'product_compositing',
            explicit: true,
            context: `제품 합성 씬 ${sceneNum}`,
            videoPurpose: videoPurpose
          });
        }
      }

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

function extractConceptBlocks(content) {
  const blocks = [];
  const lines = content.split('\n');
  let currentBlock = null;
  
  lines.forEach((line, index) => {
    if (line.includes('컨셉') && (line.includes(':') || line.includes('. '))) {
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

function buildFinalPrompt(phase1Output, conceptBlocks, requestBody, sceneCount, step2Template) {
  let finalPrompt = step2Template;
  
  finalPrompt = finalPrompt.replace(/{phase1_output}/g, phase1Output);
  finalPrompt = finalPrompt.replace(/{sceneCount}/g, sceneCount);
  finalPrompt = finalPrompt.replace(/{brandName}/g, requestBody.brandName || '');
  finalPrompt = finalPrompt.replace(/{videoPurpose}/g, requestBody.videoPurpose || '');
  finalPrompt = finalPrompt.replace(/{videoLength}/g, requestBody.videoLength || '10');
  
  return finalPrompt;
}

function parseMultiConceptJSON(text) {
  try {
    console.log('[parseMultiConceptJSON] 파싱 시작, 텍스트 길이:', text.length);
    
    const conceptPattern = /###\s*(\d+)\.\s*컨셉:\s*(.+)/g;
    const conceptMatches = [...text.matchAll(conceptPattern)];
    
    if (conceptMatches.length === 0) {
      console.error('[parseMultiConceptJSON] 컨셉 헤더를 찾을 수 없음');
      const debugPath = path.join(process.cwd(), 'debug_step2_response.txt');
      fs.writeFileSync(debugPath, text, 'utf-8');
      console.log('[parseMultiConceptJSON] Step2 응답 저장:', debugPath);
      return null;
    }
    
    console.log(`[parseMultiConceptJSON] ${conceptMatches.length}개 컨셉 발견`);
    
    const concepts = [];
    
    for (let i = 0; i < conceptMatches.length; i++) {
      const conceptNum = parseInt(conceptMatches[i][1]);
      const conceptName = conceptMatches[i][2].trim();
      const startIdx = conceptMatches[i].index;
      const endIdx = i < conceptMatches.length - 1 ? conceptMatches[i + 1].index : text.length;
      const conceptText = text.substring(startIdx, endIdx);
      
      console.log(`[parseMultiConceptJSON] 컨셉 ${conceptNum}: ${conceptName}`);
      
      const scenePattern = /###\s*S#(\d+)\s*\(/g;
      const sceneMatches = [...conceptText.matchAll(scenePattern)];
      
      console.log(`[parseMultiConceptJSON] 컨셉 ${conceptNum} - 발견된 씬: ${sceneMatches.length}개`);
      
      const conceptData = {
        concept_name: conceptName
      };
      
      for (let j = 0; j < sceneMatches.length; j++) {
        const sceneNum = parseInt(sceneMatches[j][1]);
        const sceneStartIdx = sceneMatches[j].index;
        const sceneEndIdx = j < sceneMatches.length - 1 ? sceneMatches[j + 1].index : conceptText.length;
        const sceneText = conceptText.substring(sceneStartIdx, sceneEndIdx);
        
        const jsonBlocks = [...sceneText.matchAll(/```json\s*([\s\S]*?)```/g)];
        
        if (jsonBlocks.length >= 3) {
          try {
            const imagePrompt = JSON.parse(jsonBlocks[0][1].trim());
            const motionPrompt = JSON.parse(jsonBlocks[1][1].trim());
            const copyPrompt = JSON.parse(jsonBlocks[2][1].trim());
            
            conceptData[`scene_${sceneNum}`] = {
              sceneNumber: sceneNum,
              title: `씬 ${sceneNum}`,
              image_prompt: imagePrompt,
              motion_prompt: motionPrompt,
              copy: copyPrompt
            };
            
            console.log(`[parseMultiConceptJSON] 컨셉 ${conceptNum} - 씬 ${sceneNum} 파싱 완료`);
            
          } catch (e) {
            console.warn(`[parseMultiConceptJSON] 컨셉 ${conceptNum} - 씬 ${sceneNum} JSON 파싱 실패:`, e.message);
          }
        } else {
          console.warn(`[parseMultiConceptJSON] 컨셉 ${conceptNum} - 씬 ${sceneNum}: JSON 블록 ${jsonBlocks.length}개 발견 (3개 필요)`);
        }
      }
      
      const sceneCount = Object.keys(conceptData).filter(k => k.startsWith('scene_')).length;
      console.log(`[parseMultiConceptJSON] 컨셉 ${conceptNum} 최종 씬 수: ${sceneCount}개`);
      
      concepts.push(conceptData);
    }
    
    console.log('[parseMultiConceptJSON] ✅ 파싱 완료, 총 컨셉:', concepts.length);
    
    concepts.forEach((concept, idx) => {
      const sceneKeys = Object.keys(concept).filter(k => k.startsWith('scene_'));
      console.log(`[parseMultiConceptJSON] 컨셉 ${idx + 1} (${concept.concept_name}): ${sceneKeys.length}개 씬`);
    });
    
    return { concepts };
    
  } catch (error) {
    console.error('[parseMultiConceptJSON] ❌ 파싱 오류:', error);
    const debugPath = path.join(process.cwd(), 'debug_step2_response.txt');
    fs.writeFileSync(debugPath, text, 'utf-8');
    console.log('[parseMultiConceptJSON] Step2 응답 저장:', debugPath);
    return null;
  }
}

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

function analyzeCompositingInfo(formData, compositingScenes) {
  const imageUpload = formData.imageUpload;
  const videoPurpose = formData.videoPurpose;
  
  const needsProductImage = videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education';
  const needsBrandLogo = videoPurpose === 'service' || videoPurpose === 'brand';

  return {
    needsCompositing: compositingScenes.length > 0,
    hasProductImage: needsProductImage && !!(imageUpload && imageUpload.url),
    hasBrandLogo: needsBrandLogo && !!(imageUpload && imageUpload.url),
    scenes: compositingScenes,
    productImageData: (needsProductImage && imageUpload) ? imageUpload : null,
    brandLogoData: (needsBrandLogo && imageUpload) ? imageUpload : null,
    totalCompositingScenes: compositingScenes.length
  };
}

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
        message: `일일 사용 한도(${user.dailyLimit}회)를 초과했습니다.`
      };
    }

    return { allowed: true, user };

  } catch (error) {
    console.error('[storyboard-init] 사용 한도 체크 오류:', error);
    return { allowed: false, message: '사용 한도 확인 중 오류가 발생했습니다.' };
  }
}

function incrementUsageCount(username) {
  try {
    const users = loadUsers();
    const user = users[username];
    
    if (user) {
      user.usageCount = (user.usageCount || 0) + 1;
      users[username] = user;
      saveUsers(users);
      console.log(`[storyboard-init] 사용 횟수 증가: ${username} (${user.usageCount}/${user.dailyLimit})`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[storyboard-init] 사용 횟수 증가 오류:', error);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    const username = req.headers['x-username'];
    
    if (!username) {
      console.warn('[storyboard-init] username 헤더가 없습니다');
      return res.status(401).json({
        success: false,
        error: '사용자 인증이 필요합니다.'
      });
    }

    const usageCheck = checkUsageLimit(username);
    
    if (!usageCheck.allowed) {
      console.warn('[storyboard-init] 사용 한도 초과:', username);
      return res.status(429).json({
        success: false,
        error: usageCheck.message
      });
    }

    const {
      brandName,
      industryCategory,
      productServiceCategory,
      productServiceName,
      videoLength,
      videoPurpose,
      coreTarget,
      coreDifferentiation,
      aspectRatio,
      aspectRatioCode,
      imageUpload
    } = req.body;

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
      brandName: brandName || '',
      industryCategory: industryCategory || '',
      productServiceCategory: productServiceCategory || '',
      productServiceName: productServiceName || '',
      videoPurpose: videoPurpose || 'product',
      videoLength: videoLength || '10초',
      coreTarget: coreTarget || '',
      coreDifferentiation: coreDifferentiation || '',
      videoRequirements: '없음',
      brandLogo: (imageUpload && imageUpload.url && (videoPurpose === 'service' || videoPurpose === 'brand')) ? '업로드됨' : '없음',
      productImage: (imageUpload && imageUpload.url && (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education')) ? '업로드됨' : '없음',
      aspectRatioCode: mapAspectRatio(aspectRatioCode || aspectRatio)
    };

    console.log('[storyboard-init] 🔄 Step1 변수 치환:', step1Variables);

    for (const [key, value] of Object.entries(step1Variables)) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      step1PromptTemplate = step1PromptTemplate.replace(placeholder, value);
    }

    console.log(`[storyboard-init] ✅ STEP1 변수 치환 완료`);

    console.log(`[storyboard-init] 📡 STEP1 Gemini API 호출 시작`);
    const step1 = await safeCallGemini(step1PromptTemplate, {
      label: 'STEP1-storyboard-init',
      maxRetries: 3,
      isImageComposition: false
    });

    const phase1_output = step1.text;
    console.log("[storyboard-init] ✅ STEP1 완료:", phase1_output.length, "chars");

    console.log('\n========== STEP1 FULL RESPONSE ==========');
    console.log(phase1_output);
    console.log('==========================================\n');

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

    console.log('\n========== STEP2 FULL RESPONSE ==========');
    console.log(step2.text);
    console.log('==========================================\n');

    const mcJson = parseMultiConceptJSON(step2.text);
    console.log("[storyboard-init] 📊 JSON 파싱 결과:", mcJson);

    let styles = [];
    if (mcJson && Array.isArray(mcJson.concepts) && mcJson.concepts.length > 0) {
      styles = mcJson.concepts.map((concept, index) => {
        const imagePrompts = [];
        
        for (let i = 1; i <= sceneCountPerConcept; i++) {
          const sceneKey = `scene_${i}`;
          const scene = concept[sceneKey];
          
          if (scene) {
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

    const compositingInfo = analyzeCompositingInfo(req.body, compositingScenes);
    console.log('[storyboard-init] 🎨 합성 정보:', compositingInfo);

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
      hasImageUpload: !!(imageUpload && imageUpload.url),
      compositingInfo: compositingInfo
    };

    incrementUsageCount(username);

    return res.status(200).json({
      success: true,
      styles,
      metadata,
      phase1_output,
      step2_output: step2.text,
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[storyboard-init] ❌ 오류 발생:', error);
    console.error('[storyboard-init] 스택 트레이스:', error.stack);

    return res.status(500).json({
      success: false,
      error: '스토리보드 생성 중 오류가 발생했습니다. 관리자에게 문의하세요.',
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      debugInfo: {
        videoPurpose: req.body?.videoPurpose,
        brandName: req.body?.brandName,
        videoLength: req.body?.videoLength,
        errorType: error.name
      },
      errorCode: 'UNKNOWN_ERROR'
    });
  }
}

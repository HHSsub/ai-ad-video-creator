export const config = {
  maxDuration: 9000,
};

import fs from 'fs';
import path from 'path';
import { safeCallGemini } from '../src/utils/apiHelpers.js';

const PROMPT_FILE_MAPPING = {
  'step1_product': 'Prompt_step1_product.txt',
  'step1_service': 'Prompt_step1_service.txt',
  'step2_product': 'Prompt_step2_product.txt',
  'step2_service': 'Prompt_step2_service.txt'
};

function getSceneCount(videoLength) {
  const lengthStr = String(videoLength).replace(/[^0-9]/g, '');
  const length = parseInt(lengthStr, 10);
  
  if (length <= 5) return 3;
  if (length <= 10) return 5;
  if (length <= 20) return 10;
  return 15;
}

function mapAspectRatio(input) {
  if (!input) return 'widescreen_16_9';
  const normalized = String(input).toLowerCase().trim();
  
  if (normalized.includes('16:9') || normalized.includes('16_9') || normalized === '가로') {
    return 'widescreen_16_9';
  }
  if (normalized.includes('9:16') || normalized.includes('9_16') || normalized === '세로') {
    return 'portrait_9_16';
  }
  if (normalized.includes('1:1') || normalized.includes('1_1') || normalized === '정사각형') {
    return 'square_1_1';
  }
  
  return 'widescreen_16_9';
}

function getWidthFromAspectRatio(aspectRatio) {
  const map = {
    'widescreen_16_9': 1920,
    'portrait_9_16': 1080,
    'square_1_1': 1080
  };
  return map[aspectRatio] || 1920;
}

function getHeightFromAspectRatio(aspectRatio) {
  const map = {
    'widescreen_16_9': 1080,
    'portrait_9_16': 1920,
    'square_1_1': 1080
  };
  return map[aspectRatio] || 1080;
}

function detectProductCompositingScenes(step1Output, videoPurpose) {
  const scenes = [];
  
  if (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education') {
    const regex = /S#(\d+)[^:]*:[^[]*\[PRODUCT COMPOSITING SCENE\]/gi;
    const matches = [...step1Output.matchAll(regex)];
    
    matches.forEach(match => {
      const sceneNum = parseInt(match[1], 10);
      scenes.push({
        sceneNumber: sceneNum,
        context: '[PRODUCT COMPOSITING SCENE]',
        explicit: true
      });
    });
    
    if (scenes.length === 0) {
      scenes.push({
        sceneNumber: 2,
        context: '[PRODUCT COMPOSITING SCENE] - Default S#2',
        explicit: false
      });
    }
  }
  
  return scenes;
}

function analyzeCompositingInfo(requestBody, compositingScenes) {
  const { videoPurpose, imageUpload, productServiceName, brandName } = requestBody;
  
  const needsProductImage = (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education');
  const needsBrandLogo = (videoPurpose === 'service' || videoPurpose === 'brand');
  
  return {
    videoPurpose: videoPurpose || 'product',
    sceneDescription: productServiceName || brandName || '제품/서비스',
    compositingContext: needsProductImage ? 'product_placement' : 'brand_logo',
    needsProductImage: needsProductImage,
    needsBrandLogo: needsBrandLogo,
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
    return {
      step1: 'step1_product',
      step2: 'step2_product'
    };
  } else if (videoPurpose === 'service' || videoPurpose === 'brand') {
    return {
      step1: 'step1_service',
      step2: 'step2_service'
    };
  }
  
  return {
    step1: 'step1_product',
    step2: 'step2_product'
  };
}

const USERS_FILE = path.join(process.cwd(), 'config', 'users.json');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      return {};
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

function saveUsers(users) {
  try {
    const data = JSON.stringify(users, null, 2);
    fs.writeFileSync(USERS_FILE, data, 'utf8');
    return true;
  } catch (error) {
    return false;
  }
}

function checkAndResetDaily(user) {
  const today = new Date().toISOString().split('T')[0];
  
  if (user.lastResetDate !== today) {
    user.usageCount = 0;
    user.lastResetDate = today;
    return true;
  }
  
  return false;
}

function checkUsageLimit(username) {
  try {
    const users = loadUsers();
    const user = users[username];
    if (!user) {
      return { allowed: false, message: '존재하지 않는 사용자입니다.' };
    }
    checkAndResetDaily(user);
    if (user.usageCount >= user.dailyLimit) {
      return { allowed: false, message: `일일 사용 한도(${user.dailyLimit}회)를 초과했습니다.` };
    }
    return { allowed: true, user };
  } catch (error) {
    return { allowed: false, message: '사용 한도 확인 중 오류 발생' };
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
    }
  } catch (error) {}
}

function extractConceptBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let currentBlock = null;
  
  lines.forEach((line, index) => {
    if (line.match(/^\d+\.\s*컨셉:/)) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        startLine: index + 1,
        title: line.trim(),
        content: [line]
      };
    } else if (currentBlock) {
      currentBlock.content.push(line);
    }
  });
  
  if (currentBlock) blocks.push(currentBlock);
  
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

function saveGeminiResponse(promptKey, step, formData, step1Response, step2Response = null) {
  try {
    const responsesPath = path.join(process.cwd(), 'public', 'gemini_responses');
    if (!fs.existsSync(responsesPath)) {
      fs.mkdirSync(responsesPath, { recursive: true });
    }
    const timestamp = Date.now();
    const fileName = `${promptKey}_${step}_${timestamp}.json`;
    const filePath = path.join(responsesPath, fileName);
    const responseData = {
      promptKey,
      step,
      formData,
      response: step2Response || step1Response,
      rawStep1Response: step1Response,
      rawStep2Response: step2Response,
      timestamp: new Date().toISOString(),
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(filePath, JSON.stringify(responseData, null, 2), 'utf-8');
    return { success: true, fileName };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function parseMultiConceptJSON(text) {
  try {
    const conceptPattern = /###\s*(\d+)\.\s*컨셉:\s*(.+)/g;
    const conceptMatches = [...text.matchAll(conceptPattern)];
    
    if (conceptMatches.length === 0) {
      return null;
    }
    
    const concepts = [];
    
    for (let i = 0; i < conceptMatches.length; i++) {
      const conceptNum = parseInt(conceptMatches[i][1]);
      const conceptName = conceptMatches[i][2].trim();
      const startIdx = conceptMatches[i].index;
      const endIdx = i < conceptMatches.length - 1 ? conceptMatches[i + 1].index : text.length;
      const conceptText = text.substring(startIdx, endIdx);
      
      const scenePattern = /###\s*S#(\d+)\s*\(/g;
      const sceneMatches = [...conceptText.matchAll(scenePattern)];
      
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
            const imagePromptJSON = JSON.parse(jsonBlocks[0][1].trim());
            const motionPromptJSON = JSON.parse(jsonBlocks[1][1].trim());
            const copyJSON = JSON.parse(jsonBlocks[2][1].trim());
            
            conceptData[`scene_${sceneNum}`] = {
              title: `Scene ${sceneNum}`,
              image_prompt: imagePromptJSON,
              motion_prompt: motionPromptJSON,
              copy: copyJSON
            };
          } catch (e) {}
        }
      }
      
      concepts.push(conceptData);
    }
    
    return { concepts };
  } catch (error) {
    return null;
  }
}

export default async function handler(req, res) {
  const startTime = Date.now();
  
  // CORS 설정
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

  // 🔥 여기서부터는 가능한 한 빨리 응답을 돌려주고,
  //    실제 무거운 작업은 백그라운드로 넘긴다.
  const username = req.headers['x-username'] || 'anonymous';
  console.log(`[storyboard-init] 📥 요청 수신 (사용자: ${username})`);

  const sessionId = req.body.sessionId || `session_${Date.now()}_${username}`;
  console.log(`[storyboard-init] 📝 세션 ID: ${sessionId}`);

  // 🔥 즉시 202 응답 반환
  res.status(202).json({
    success: true,
    sessionId: sessionId,
    message: '스토리보드 생성이 시작되었습니다'
  });

  // 🔥 백그라운드에서 나머지 처리 계속
  processStoryboardAsync(req.body, username, sessionId, startTime).catch(err => {
    console.error('[storyboard-init] 백그라운드 처리 실패:', err);
  });
}

// 🔥 백그라운드에서 실제 스토리보드 생성 전체를 수행하는 함수
async function processStoryboardAsync(body, username, sessionId, startTime) {
  try {
    console.log(`[processStoryboardAsync] 시작 (사용자: ${username}, 세션: ${sessionId})`);

    // 1) 일일 사용량 체크
    const usageCheck = checkUsageLimit(username);
    if (!usageCheck.allowed) {
      console.warn('[storyboard-init] 사용 한도 초과:', username);
      await updateSession(sessionId, {
        progress: 0,
        message: usageCheck.message,
        completed: true,
        error: usageCheck.message
      });
      return;
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
    } = body;

    console.log('[storyboard-init] 🚀 요청 수신(백그라운드):', {
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
      await updateSession(sessionId, {
        progress: 0,
        completed: true,
        error: `STEP1 프롬프트 파일을 찾을 수 없습니다: ${step1FileName}`
      });
      return;
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

    if (sessionId) {
      try {
        await fetch(`http://localhost:3000/api/session/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-username': username },
          body: JSON.stringify({
            sessionId,
            progress: 10,
            message: 'Step1 아이디어 구상 중...'
          })
        }).catch(() => {});
      } catch (e) {
        console.error('[세션 업데이트 실패]', e);
      }
    }

    console.log(`[storyboard-init] 📡 STEP1 Gemini API 호출 시작`);
    console.log('[storyboard-init] ⏰ 타임스탬프:', new Date().toISOString());
    console.log('[storyboard-init] 📝 프롬프트 길이:', step1PromptTemplate.length, 'chars');

    const step1 = await safeCallGemini(step1PromptTemplate, {
      label: 'STEP1-storyboard-init',
      maxRetries: 3,
      isImageComposition: false
    });

    const phase1_output = step1.text;
    console.log("[storyboard-init] ✅ STEP1 완료:", phase1_output.length, "chars");
    console.log('[storyboard-init] ⏰ STEP1 소요 시간:', (Date.now() - startTime) / 1000, '초');

    if (sessionId) {
      try {
        await fetch(`http://localhost:3000/api/session/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-username': username },
          body: JSON.stringify({
            sessionId,
            progress: 30,
            message: 'Step1 완료, Step2 컨셉 개발 중...'
          })
        }).catch(() => {});
      } catch (e) {
        console.error('[세션 업데이트 실패]', e);
      }
    }

    console.log('\n========== STEP1 FULL RESPONSE ==========');
    console.log(phase1_output);
    console.log('==========================================\n');

    saveGeminiResponse(
      promptFiles.step1,
      'step1',
      body,
      phase1_output,
      null
    );
    console.log('[storyboard-init] 💾 Step1 응답 저장 완료');

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
      await updateSession(sessionId, {
        progress: 40,
        completed: true,
        error: `STEP2 프롬프트 파일을 찾을 수 없습니다: ${step2FileName}`
      });
      return;
    }

    console.log(`[storyboard-init] 📝 STEP2 프롬프트 파일 로드: ${step2FileName}`);
    const step2PromptContent = fs.readFileSync(step2FilePath, 'utf-8');

    const step2Prompt = buildFinalPrompt(phase1_output, conceptBlocks, body, sceneCountPerConcept, step2PromptContent);

    if (sessionId) {
      try {
        await fetch(`http://localhost:3000/api/session/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-username': username },
          body: JSON.stringify({
            sessionId,
            progress: 50,
            message: 'Step2 상세 컨셉 생성 중...'
          })
        }).catch(() => {});
      } catch (e) {
        console.error('[세션 업데이트 실패]', e);
      }
    }

    console.log('[storyboard-init] 📡 STEP2 Gemini API 호출 시작');
    console.log('[storyboard-init] ⏰ 타임스탬프:', new Date().toISOString());
    console.log(`[storyboard-init] STEP2 프롬프트 길이: ${step2Prompt.length} chars`);

    const step2 = await safeCallGemini(step2Prompt, {
      label: 'STEP2-storyboard-init',
      maxRetries: 3,
      isImageComposition: false
    });

    console.log("[storyboard-init] ✅ STEP2 완료:", step2.text.length, "chars");
    console.log('[storyboard-init] ⏰ STEP2 소요 시간:', (Date.now() - startTime) / 1000, '초');

    if (sessionId) {
      try {
        await fetch(`http://localhost:3000/api/session/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-username': username },
          body: JSON.stringify({
            sessionId,
            progress: 70,
            message: 'Step2 완료, 이미지 생성 준비 중...'
          })
        }).catch(() => {});
      } catch (e) {
        console.error('[세션 업데이트 실패]', e);
      }
    }

    console.log('\n========== STEP2 FULL RESPONSE ==========');
    console.log(step2.text);
    console.log('==========================================\n');

    saveGeminiResponse(
      promptFiles.step1,
      'complete',
      body,
      phase1_output,
      step2.text
    );
    
    saveGeminiResponse(
      promptFiles.step2,
      'complete',
      body,
      phase1_output,
      step2.text
    );
    
    console.log('[storyboard-init] 💾 Step1, Step2 응답 양쪽 히스토리에 저장 완료');

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

            const imagePromptData = {
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
              },
              image_prompt: {
                prompt: scene.image_prompt?.prompt || `${concept.concept_name} scene ${i}`,
                negative_prompt: scene.image_prompt?.negative_prompt || "blurry, low quality, watermark, text, logo",
                guidance_scale: scene.image_prompt?.guidance_scale || 7.5,
                seed: scene.image_prompt?.seed || Math.floor(10000 + Math.random() * 90000)
              }
            };

            imagePrompts.push(imagePromptData);
          }
        }

        return {
          id: index + 1,
          concept_id: index + 1,
          conceptId: index + 1,
          conceptName: concept.concept_name,
          concept_title: concept.concept_name,
          concept_description: `${videoPurpose} 광고를 위한 ${concept.concept_name} 접근법`,
          style: concept.style || 'Commercial Photography',
          headline: concept.concept_name,
          description: `${videoPurpose} 광고를 위한 ${concept.concept_name} 접근법`,
          copy: concept.concept_name,
          imagePrompts: imagePrompts,
          images: imagePrompts.map(ip => ({
            ...ip,
            url: null,
            status: 'pending'
          })),
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
      console.log(`[storyboard-init] 📊 각 컨셉당 images 배열 길이: ${styles[0]?.images?.length || 0}개`);
    } else {
      console.error('[storyboard-init] ❌ JSON 파싱 실패 또는 컨셉 없음');
    }

    // 이미지 생성 및 합성 전 세션 진행도 업데이트
    if (sessionId) {
      try {
        await fetch(`http://localhost:3000/api/session/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-username': username },
          body: JSON.stringify({
            sessionId,
            progress: 80,
            message: '이미지 생성 준비 중...'
          })
        }).catch(() => {});
      } catch (e) {
        console.error('[세션 업데이트 실패]', e);
      }
    }

    console.log('[storyboard-init] 🎨 이미지 생성 루프 시작');

    // 이미지 생성 완료 상태 저장
    const generatedImages = [];

    // 전역 compositing 설정
    const globalCompositingNeeded =
      videoPurpose === 'product' ||
      videoPurpose === 'conversion' ||
      videoPurpose === 'education';

    const globalLogoNeeded =
      videoPurpose === 'service' ||
      videoPurpose === 'brand';

    // 메인 이미지 생성 루프
    for (let si = 0; si < styles.length; si++) {
      const style = styles[si];

      console.log(`[storyboard-init] 🎞 컨셉 ${si + 1}/${styles.length} 이미지 생성 시작`);

      for (let ip = 0; ip < style.imagePrompts.length; ip++) {
        const imgPrompt = style.imagePrompts[ip];
        console.log(`[storyboard-init] 🖼  생성 중 → Concept ${si + 1} / Image ${ip + 1}`);

        try {
          const imageResponse = await safeCallGemini(imgPrompt.prompt, {
            label: `IMAGE_C${si + 1}_S${ip + 1}`,
            maxRetries: 3,
            isImageComposition: false
          });

          const imageUrl = imageResponse?.imageUrl || null;
          generatedImages.push({
            conceptId: style.id,
            sceneNumber: imgPrompt.sceneNumber,
            url: imageUrl
          });

          style.images[ip].url = imageUrl;
          style.images[ip].status = imageUrl ? 'generated' : 'failed';

          console.log(`[storyboard-init]   → 이미지 생성 완료: ${imageUrl}`);

        } catch (imageError) {
          console.error(`[storyboard-init] ❌ 이미지 생성 실패 (C${si + 1}-S${ip + 1})`, imageError);
          style.images[ip].url = null;
          style.images[ip].status = 'failed';
        }

        // 세션 상태 업데이트 (프론트에서 실시간 반영)
        if (sessionId) {
          try {
            await fetch(`http://localhost:3000/api/session/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-username': username },
              body: JSON.stringify({
                sessionId,
                progress: 80 + Math.floor((ip / style.imagePrompts.length) * 15),
                message: `이미지 생성 중... (${ip + 1}/${style.imagePrompts.length})`,
                styles: styles
              })
            }).catch(() => {});
          } catch (e) {
            console.error('[세션 업데이트 실패]', e);
          }
        }
      }
    }

    console.log('[storyboard-init] 🖨 모든 이미지 생성 루프 완료');

    // 합성 이미지(상품 이미지 or 브랜드 로고) 추가 생성
    if (globalCompositingNeeded || globalLogoNeeded) {
      console.log('[storyboard-init] 🧩 합성 이미지 생성 시작');

      for (let si = 0; si < styles.length; si++) {
        const style = styles[si];

        for (let ip = 0; ip < style.imagePrompts.length; ip++) {
          const imgPrompt = style.imagePrompts[ip];

          if (!imgPrompt.isCompositing) continue;

          console.log(
            `[storyboard-init] 🔧 합성 처리 → Concept ${si + 1}, Scene ${imgPrompt.sceneNumber}`
          );

          try {
            const compositeRequest = {
              prompt: imgPrompt.prompt,
              productImageUrl: globalCompositingNeeded ? body.imageUpload?.url || null : null,
              brandLogoUrl: globalLogoNeeded ? body.imageUpload?.url || null : null,
              aspectRatio: imgPrompt.aspect_ratio || 'widescreen_16_9'
            };

            const compositeResp = await safeCallGemini(compositeRequest.prompt, {
              label: `COMPOSITING_C${si + 1}_S${imgPrompt.sceneNumber}`,
              maxRetries: 2,
              isImageComposition: true
            });

            const compositeUrl = compositeResp?.imageUrl || null;

            style.images[ip].url = compositeUrl;
            style.images[ip].status = compositeUrl ? 'generated' : 'failed';

            console.log(`[storyboard-init]     → 합성 결과: ${compositeUrl}`);

          } catch (e) {
            console.error(
              `[storyboard-init] ❌ 합성 실패 (C${si + 1}-S${imgPrompt.sceneNumber})`,
              e
            );
          }

          // 합성 진행 상태 업데이트
          if (sessionId) {
            try {
              await fetch(`http://localhost:3000/api/session/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-username': username },
                body: JSON.stringify({
                  sessionId,
                  progress: 95,
                  message: `합성 이미지 처리 중...`,
                  styles: styles
                })
              }).catch(() => {});
            } catch (e) {
              console.error('[세션 업데이트 실패]', e);
            }
          }
        }
      }

      console.log('[storyboard-init] 🧩 합성 이미지 전체 완료');
    }

    console.log('[storyboard-init] 🎉 모든 이미지 생성 및 합성 완료');

    // 최종 세션 업데이트
    if (sessionId) {
      try {
        console.log('[storyboard-init] 📝 최종 세션 업데이트 시작');

        await fetch(`http://localhost:3000/api/session/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-username': username },
          body: JSON.stringify({
            sessionId,
            progress: 100,
            message: '📌 스토리보드 생성이 완료되었습니다.',
            completed: true,
            storyboard: {
              step1_output: typeof phase1_output === 'string'
                ? phase1_output
                : JSON.stringify(phase1_output, null, 2),

              step2_output: typeof step2?.text === 'string'
                ? step2.text
                : JSON.stringify(step2?.text, null, 2),

              styles: styles
            }
          })
        }).catch(() => {});
      } catch (e) {
        console.error('[storyboard-init] ❌ 최종 세션 업데이트 실패', e);
      }
    }

    // 사용량 증가
    try {
      incrementUsageCount(username);
    } catch (e) {
      console.error('[storyboard-init] 사용량 증가 실패:', e);
    }

    console.log(`[storyboard-init] 🎉 전체 생성 완료 — 총 소요: ${(Date.now() - startTime) / 1000}s`);

  } catch (error) {
    console.error('[processStoryboardAsync] ❌ 오류 발생:', error);

    // 오류 발생 시 session 업데이트
    try {
      await updateSession(sessionId, {
        progress: 0,
        completed: true,
        error: error.message || '알 수 없는 오류'
      });
    } catch (e) {
      console.error('[updateSession] 오류 저장 실패:', e);
    }
  }
}

// 🔧 세션 업데이트 헬퍼 함수
async function updateSession(sessionId, data) {
  try {
    console.log(`[updateSession] 세션 업데이트:`, sessionId, data);

    await fetch(`http://localhost:3000/api/session/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, ...data })
    });

  } catch (e) {
    console.error('[updateSession] ❌ 업데이트 실패:', e);
  }
}

// api/storyboard-init.js - 🔥 비디오 폴링 + 진행률 업데이트 수정!

export const config = {
  maxDuration: 9000,
};

import fs from 'fs';
import path from 'path';
import { safeCallGemini } from '../src/utils/apiHelpers.js';
import sessionStore from '../src/utils/sessionStore.js';

const API_BASE = process.env.VITE_API_BASE_URL 
  ? (process.env.VITE_API_BASE_URL.startsWith('http') 
      ? process.env.VITE_API_BASE_URL 
      : `https://upnexx.ai${process.env.VITE_API_BASE_URL}`)
  : 'http://localhost:3000';

console.log('[storyboard-init] API_BASE:', API_BASE);

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';

// ============================================================
// 원본 함수들
// ============================================================

const PROMPT_FILE_MAPPING = {
  'product': 'new_product_prompt_1120.txt',
  'service': 'new_service_prompt_1120.txt',
  'manual': 'new_manual_prompt_1120.txt'
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

function detectProductCompositingScenes(fullOutput, videoPurpose) {
  const scenes = [];
  
  if (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education') {
    const regex = /S#(\d+)[^:]*:[^[]*\[PRODUCT COMPOSITING SCENE\]/gi;
    const matches = [...fullOutput.matchAll(regex)];
    
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

function getPromptFile(videoPurpose, mode = 'auto') {
  if (mode === 'manual') return 'manual';
  if (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education') return 'product';
  if (videoPurpose === 'service' || videoPurpose === 'brand') return 'service';
  return 'product';
}

const USERS_FILE = path.join(process.cwd(), 'config', 'users.json');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return {};
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[storyboard-init] 사용자 데이터 로드 오류:', error);
    return {};
  }
}

function saveUsers(users) {
  try {
    const data = JSON.stringify(users, null, 2);
    fs.writeFileSync(USERS_FILE, data, 'utf8');
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
    return true;
  }
  return false;
}

function checkUsageLimit(username) {
  try {
    if (!username) return { allowed: false, message: '사용자 정보가 없습니다.' };
    const users = loadUsers();
    const user = users[username];
    if (!user) return { allowed: false, message: '존재하지 않는 사용자입니다.' };
    checkAndResetDaily(user);
    if (user.usageCount >= user.dailyLimit) {
      return { allowed: false, message: `일일 사용 한도(${user.dailyLimit}회)를 초과했습니다.` };
    }
    return { allowed: true, user };
  } catch (error) {
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
    }
  } catch (error) {
    console.error('[storyboard-init] 사용 횟수 증가 오류:', error);
  }
}

function saveGeminiResponse(promptKey, step, formData, fullResponse) {
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
      formData: formData || {},
      response: fullResponse,
      timestamp: new Date().toISOString(),
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(filePath, JSON.stringify(responseData, null, 2), 'utf-8');
    return { success: true, fileName };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function parseUnifiedConceptJSON(text, mode = 'auto') {
  try {
    const expectedConceptCount = mode === 'manual' ? 1 : 3;
    let conceptMatches = [];
    
    if (mode === 'manual') {
      // const manualConceptPattern = /Section\s*2[\s.:]*[^\n]*(?:Cinematic|Storyboard)[^\n]*/i;
      const manualConceptPattern = /(Section\s*2|Cinematic|Storyboard)/i;
      const match = text.match(manualConceptPattern);
      if (match) {
        conceptMatches = [{
          0: match[0],
          1: '1',
          2: 'Manual Video Concept',
          index: match.index,
          input: text
        }];
      }
    } else {
      const conceptPattern = /###\s*(\d+)\.\s*컨셉:\s*(.+)/g;
      conceptMatches = [...text.matchAll(conceptPattern)];
    }
    
    if (conceptMatches.length === 0) return null;
    
    const concepts = [];
    const conceptsToProcess = conceptMatches.slice(0, expectedConceptCount);
    
    for (let i = 0; i < conceptsToProcess.length; i++) {
      const conceptMatch = conceptsToProcess[i];
      const conceptNum = parseInt(conceptMatch[1]);
      const conceptName = conceptMatch[2].trim();
      const startIdx = conceptMatch.index;
      let endIdx = text.length;
      if (i < conceptsToProcess.length - 1) {
        endIdx = conceptsToProcess[i + 1].index;
      }
      const conceptText = text.substring(startIdx, endIdx);
      
      const bigIdeaMatch = conceptText.match(/Big Idea:\s*(.+)/);
      const bigIdea = bigIdeaMatch ? bigIdeaMatch[1].trim() : '';
      const styleMatch = conceptText.match(/Style:\s*(.+)/);
      const style = styleMatch ? styleMatch[1].trim() : '';
      
      let scenePattern;
      if (mode === 'manual') {
        scenePattern = /S#(\d+)\s*\(([^)]+)\)/g;
      } else {
        scenePattern = /###\s*S#(\d+)\s*\(([^)]+)\)/g;
      }
      
      const sceneMatches = [...conceptText.matchAll(scenePattern)];
      const conceptData = {
        concept_name: conceptName,
        big_idea: bigIdea,
        style: style
      };
      
      for (let j = 0; j < sceneMatches.length; j++) {
        const sceneNum = parseInt(sceneMatches[j][1]);
        const timecode = sceneMatches[j][2].trim();
        const sceneStartIdx = sceneMatches[j].index;
        const sceneEndIdx = j < sceneMatches.length - 1 ? sceneMatches[j + 1].index : conceptText.length;
        const sceneText = conceptText.substring(sceneStartIdx, sceneEndIdx);
        
        const visualDescMatch = sceneText.match(/Visual Description:\s*(.+?)(?=JSON|###|S#\d+|$)/s);
        const visualDescription = visualDescMatch ? visualDescMatch[1].trim() : '';
        const jsonBlocks = extractJSONBlocks(sceneText);
        
        if (jsonBlocks.length >= 3) {
          try {
            const imagePromptJSON = JSON.parse(jsonBlocks[0]);
            const motionPromptJSON = JSON.parse(jsonBlocks[1]);
            const copyJSON = JSON.parse(jsonBlocks[2]);
            
            conceptData[`scene_${sceneNum}`] = {
              title: `Scene ${sceneNum}`,
              timecode: timecode,
              visual_description: visualDescription,
              image_prompt: imagePromptJSON,
              motion_prompt: motionPromptJSON,
              copy: copyJSON
            };
          } catch (e) {
            console.error(`JSON 파싱 실패 (씬 ${sceneNum}):`, e.message);
          }
        }
      }
      
      concepts.push(conceptData);
    }
    
    return { concepts };
  } catch (error) {
    console.error('[parseUnifiedConceptJSON] 오류:', error);
    return null;
  }
}

function extractJSONBlocks(text) {
  const jsonBlocks = [];
  const backtickPattern = /```(?:json|python)?\s*\n([\s\S]*?)\n```/g;
  let backtickMatches = [...text.matchAll(backtickPattern)];
  const plainJSONPattern = /(?:^|\n)JSON\s*\n(\{[\s\S]*?\n\})\s*(?=\n(?:JSON|###|```|S#\d+|$))/gm;
  let plainMatches = [...text.matchAll(plainJSONPattern)];
  const copyPattern = /(?:^|\n)JSON\s*\n```copy\s*\n([\s\S]*?)\n```/gm;
  let copyMatches = [...text.matchAll(copyPattern)];
  
  const allMatches = [];
  backtickMatches.forEach(match => {
    const content = match[1].trim();
    if (content.startsWith('{')) {
      allMatches.push({ index: match.index, content: content, type: 'backtick' });
    }
  });
  plainMatches.forEach(match => {
    allMatches.push({ index: match.index, content: match[1].trim(), type: 'plain' });
  });
  copyMatches.forEach(match => {
    const copyText = match[1].trim();
    const copyJSON = JSON.stringify({ copy: copyText });
    allMatches.push({ index: match.index, content: copyJSON, type: 'copy' });
  });
  allMatches.sort((a, b) => a.index - b.index);
  allMatches.forEach(match => {
    jsonBlocks.push(match.content);
  });
  return jsonBlocks;
}

export { parseUnifiedConceptJSON, extractJSONBlocks };

// ============================================================
// 진행률 추적
// ============================================================

async function updateSession(sessionId, updateData) {
  try {
    if (updateData.progress) {
      sessionStore.updateProgress(sessionId, updateData.progress);
    }
    if (updateData.status) {
      sessionStore.updateStatus(sessionId, updateData.status, updateData.result, updateData.error);
    }
    return true;
  } catch (error) {
    console.error('[updateSession] Error:', error);
    return false;
  }
}

function calculateProgress(phase, stepProgress = 0) {
  const phases = {
    GEMINI: { start: 0, weight: 15 },
    IMAGE: { start: 15, weight: 25 },
    VIDEO: { start: 40, weight: 40 },
    COMPOSE: { start: 80, weight: 20 }
  };
  const phaseInfo = phases[phase];
  if (!phaseInfo) return 0;
  return Math.floor(phaseInfo.start + (phaseInfo.weight * stepProgress / 100));
}

// ============================================================
// 자동화 함수
// ============================================================
async function generateImage(imagePrompt, sceneNumber, conceptId, username, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[generateImage] 씬 ${sceneNumber} 시도 ${attempt}/${maxRetries} (컨셉: ${conceptId})`);
      
      const response = await fetch(`${API_BASE}/api/storyboard-render-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({
          imagePrompt,
          sceneNumber,
          conceptId
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      console.log(`[generateImage] 응답:`, JSON.stringify(result));
      
      const imageUrl = result.url || result.imageUrl;
      
      // 🔥 fallback 이미지 체크 - 재시도
      if (result.fallback === true || !imageUrl || imageUrl.includes('via.placeholder.com')) {
        console.log(`[generateImage] ⚠️ 씬 ${sceneNumber} fallback 이미지 감지 - 재시도 필요`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
          continue;
        }
        throw new Error('이미지 생성 실패 (fallback)');
      }
      
      if (!result.success || !imageUrl) throw new Error('이미지 생성 실패');
      
      console.log(`[generateImage] ✅ 씬 ${sceneNumber} 성공: ${imageUrl.substring(0, 60)}...`);
      return imageUrl;
      
    } catch (error) {
      console.error(`[generateImage] ❌ 씬 ${sceneNumber} 시도 ${attempt} 실패:`, error.message);
      if (attempt >= maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
    }
  }
  throw new Error('이미지 생성 최대 재시도 초과');
}


async function generateVideo(imageUrl, motionPrompt, sceneNumber, formData) {
  const response = await fetch(`${API_BASE}/api/image-to-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl,
      prompt: motionPrompt?.prompt || 'smooth camera movement',
      negativePrompt: motionPrompt?.negative_prompt || 'blurry',
      duration: '5',
      formData
    })
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (!result.success || !result.task?.taskId) throw new Error('비디오 생성 실패');
  return result.task.taskId;
}

// 🔥 수정된 pollVideoStatus - 진행률 업데이트 추가
async function pollVideoStatus(taskId, sceneNumber, sessionId, currentVideoIndex, totalVideos, maxAttempts = 120) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  console.log(`[pollVideoStatus] 🚀 폴링 시작: ${taskId} (${currentVideoIndex}/${totalVideos})`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const apiKey = process.env.FREEPIK_API_KEY || process.env.VITE_FREEPIK_API_KEY;
      
      // 🔥🔥🔥 핵심 수정: kling-v2-1-pro → kling-v2-1 🔥🔥🔥
      // Freepik API 공식 문서에 따르면:
      // - POST (생성): /ai/image-to-video/kling-v2-1-pro
      // - GET (조회): /ai/image-to-video/kling-v2-1/{task-id}
      const response = await fetch(`${FREEPIK_API_BASE}/ai/image-to-video/kling-v2-1/${taskId}`, {
        method: 'GET',
        headers: {
          'x-freepik-api-key': apiKey,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        // 404가 아닌 경우에만 로그 출력 (404는 일시적일 수 있음)
        if (response.status !== 404) {
          console.log(`[pollVideoStatus] ⚠️ HTTP ${response.status} (시도 ${attempt}/${maxAttempts})`);
        } else if (attempt <= 3 || attempt % 12 === 0) {
          // 404는 처음 3번과 1분마다만 로그
          console.log(`[pollVideoStatus] ⏳ 대기 중... (시도 ${attempt}/${maxAttempts}, ${Math.floor(attempt * 5 / 60)}분 경과)`);
        }
        await sleep(5000);
        continue;
      }

      const result = await response.json();
      const status = result.data?.status?.toUpperCase();

      // 🔥 로그 추가: 상태 출력 (30초마다)
      if (attempt % 6 === 0) {
        console.log(`[pollVideoStatus] 📊 상태: ${status} (${Math.floor(attempt * 5 / 60)}분 ${(attempt * 5) % 60}초 경과)`);
        
        const videoProgress = ((currentVideoIndex - 1) / totalVideos) * 100;
        const session = sessionStore.getSession(sessionId);
        if (session) {
          await updateSession(sessionId, {
            progress: {
              phase: 'VIDEO',
              percentage: calculateProgress('VIDEO', videoProgress),
              currentStep: `비디오 ${currentVideoIndex}/${totalVideos} 생성 중... (${Math.floor(attempt * 5 / 60)}분 경과)`
            }
          });
        }
      }

      if (status === 'COMPLETED') {
        if (result.data?.generated?.length > 0) {
          const videoUrl = result.data.generated[0];
          console.log(`[pollVideoStatus] ✅ 완료: ${taskId.substring(0, 8)}... → ${videoUrl.substring(0, 50)}...`);
          return videoUrl;
        }
      }
      
      if (status === 'FAILED' || status === 'ERROR') {
        console.error(`[pollVideoStatus] ❌ 실패: ${taskId}`);
        throw new Error('비디오 생성 실패');
      }

      await sleep(5000);
    } catch (error) {
      if (error.message === '비디오 생성 실패') throw error;
      
      // 네트워크 에러 등은 재시도
      if (attempt % 12 === 0) {
        console.log(`[pollVideoStatus] ⚠️ 에러 발생, 재시도 중... (${attempt}/${maxAttempts})`);
      }
      await sleep(5000);
    }
  }
  
  console.error(`[pollVideoStatus] ❌ 타임아웃: ${taskId} (${Math.floor(maxAttempts * 5 / 60)}분 경과)`);
  throw new Error('비디오 폴링 타임아웃');
}

// ============================================================
// 메인 함수
// ============================================================

async function processStoryboardAsync(body, username, sessionId) {
  const startTime = Date.now();
  
  try {
    const usageCheck = checkUsageLimit(username);
    if (!usageCheck.allowed) {
      await updateSession(sessionId, {
        status: 'error',
        error: { message: usageCheck.message },
        progress: { phase: 'ERROR', percentage: 0, currentStep: usageCheck.message }
      });
      return;
    }

    const {
      brandName, industryCategory, productServiceCategory, productServiceName,
      videoLength, videoPurpose, coreTarget, coreDifferentiation,
      aspectRatio, aspectRatioCode, imageUpload, mode, userdescription
    } = body;

    console.log("🔥 [SERVER] BODY RECEIVED:", body);
    console.log("🔥 [SERVER] userdescription =", userdescription);

    await updateSession(sessionId, {
      progress: {
        phase: 'GEMINI',
        percentage: calculateProgress('GEMINI', 0),
        currentStep: 'Gemini API 호출 준비 중...'
      }
    });


    // PHASE 1: Gemini (0-15%)
    const promptFile = getPromptFile(videoPurpose, mode);
    const promptFileName = PROMPT_FILE_MAPPING[promptFile];
    const promptFilePath = path.join(process.cwd(), 'public', promptFileName);
    if (!fs.existsSync(promptFilePath)) throw new Error(`프롬프트 파일을 찾을 수 없습니다: ${promptFileName}`);

    let promptTemplate = fs.readFileSync(promptFilePath, 'utf-8');
    const promptVariables = {
      brandName: brandName || '',
      industryCategory: industryCategory || '',
      productServiceCategory: productServiceCategory || '',
      productServiceName: productServiceName || '',
      videoPurpose: videoPurpose || 'product',
      videoLength: videoLength || '10초',
      coreTarget: coreTarget || '',
      coreDifferentiation: coreDifferentiation || '',
      videoRequirements: body.videoRequirements || '없음',
      brandLogo: (imageUpload && imageUpload.url && (videoPurpose === 'service' || videoPurpose === 'brand')) ? '업로드됨' : '없음',
      productImage: (imageUpload && imageUpload.url && (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education')) ? '업로드됨' : '없음',
      aspectRatioCode: mapAspectRatio(aspectRatioCode || aspectRatio),
      userdescription: userdescription || ''
    };
    console.log("[DEBUG] RECEIVED userdescription:", userdescription);

    for (const [key, value] of Object.entries(promptVariables)) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      promptTemplate = promptTemplate.replace(placeholder, value);
    }

    await updateSession(sessionId, {
      progress: {
        phase: 'GEMINI',
        percentage: calculateProgress('GEMINI', 10),
        currentStep: 'Gemini 모델에 프롬프트 전송 중...'
      }
    });
    
    const geminiResponse = await safeCallGemini(promptTemplate, {
      label: 'UNIFIED-storyboard-init',
      maxRetries: 3,
      isImageComposition: false
    });
    
    const fullOutput = geminiResponse.text;
    await updateSession(sessionId, {
      progress: {
        phase: 'GEMINI',
        percentage: calculateProgress('GEMINI', 100),
        currentStep: '스토리보드 데이터 파싱 완료'
      }
    });
    
    saveGeminiResponse(promptFile, 'unified', body, fullOutput);
    const sceneCountPerConcept = getSceneCount(videoLength);
    const compositingScenes = detectProductCompositingScenes(fullOutput, videoPurpose);
    const mcJson = parseUnifiedConceptJSON(fullOutput, mode);
    if (!mcJson || !mcJson.concepts || mcJson.concepts.length === 0) throw new Error('JSON 파싱 실패');

    console.log('[storyboard-init] ✅ Gemini 파싱 성공:', mcJson.concepts.length, '개 컨셉');

    // PHASE 2: 이미지 생성 (15-40%)
    await updateSession(sessionId, {
      progress: {
        phase: 'IMAGE',
        percentage: calculateProgress('IMAGE', 0),
        currentStep: '이미지 생성 준비 중...'
      }
    });

    const styles = [];
    for (let conceptIdx = 0; conceptIdx < mcJson.concepts.length; conceptIdx++) {
      const concept = mcJson.concepts[conceptIdx];
      const images = [];
      
      for (let sceneNum = 1; sceneNum <= sceneCountPerConcept; sceneNum++) {
        const sceneKey = `scene_${sceneNum}`;
        const scene = concept[sceneKey];
        if (!scene) continue;

        try {
          const imagePrompt = {
            ...scene.image_prompt,
            aspect_ratio: mapAspectRatio(scene.image_prompt?.aspect_ratio || body.aspectRatioCode || 'widescreen_16_9')
          };
          console.log('[DEBUG] imagePrompt before generateImage:', {
            concept: conceptIdx + 1,
            sceneNum,
            prompt: scene.image_prompt?.prompt
          });
          const imageUrl = await generateImage(imagePrompt, sceneNum, conceptIdx + 1, username);
          console.log(`[storyboard-init] 🖼️ 씬 ${sceneNum} 이미지 생성 완료: ${imageUrl}`);
          images.push({
            sceneNumber: sceneNum,
            imageUrl: imageUrl,
            videoUrl: null,
            title: scene.title || `씬 ${sceneNum}`,
            prompt: scene.image_prompt?.prompt || '',
            motionPrompt: scene.motion_prompt,
            copy: scene.copy?.copy || '',
            status: 'image_done'
          });

          const progress = ((conceptIdx * sceneCountPerConcept + sceneNum) / (mcJson.concepts.length * sceneCountPerConcept)) * 100;
          await updateSession(sessionId, {
            progress: {
              phase: 'IMAGE',
              percentage: calculateProgress('IMAGE', progress),
              currentStep: `이미지 ${sceneNum}/${sceneCountPerConcept} 생성 완료 (컨셉 ${conceptIdx + 1})`
            }
          });
        } catch (error) {
          console.error(`이미지 생성 실패 (씬 ${sceneNum}):`, error);
          images.push({
            sceneNumber: sceneNum,
            imageUrl: null,
            videoUrl: null,
            status: 'image_failed',
            error: error.message
          });
        }
      }

      styles.push({
        id: conceptIdx + 1,
        conceptId: conceptIdx + 1,
        conceptName: concept.concept_name,
        big_idea: concept.big_idea || '',
        style: concept.style || '',
        images: images
      });
    }

    await updateSession(sessionId, {
      progress: {
        phase: 'IMAGE',
        percentage: calculateProgress('IMAGE', 100),
        currentStep: `모든 이미지 생성 완료`
      }
    });

    // PHASE 3: 비디오 생성 (40-80%)
    await updateSession(sessionId, {
      progress: {
        phase: 'VIDEO',
        percentage: calculateProgress('VIDEO', 0),
        currentStep: '비디오 생성 준비 중...'
      }
    });

    let totalVideos = 0;
    let completedVideos = 0;
    for (const style of styles) {
      totalVideos += style.images.filter(img => img.imageUrl).length;
    }

    console.log(`[storyboard-init] 총 ${totalVideos}개 비디오 생성 예정`);

    for (let styleIdx = 0; styleIdx < styles.length; styleIdx++) {
      const style = styles[styleIdx];
      for (let imgIdx = 0; imgIdx < style.images.length; imgIdx++) {
        const image = style.images[imgIdx];
        // 🔥 placeholder 이미지 체크
        if (!image.imageUrl || image.imageUrl.includes('via.placeholder.com')) {
          console.log(`[storyboard-init] ⚠️ 컨셉 ${styleIdx + 1} 씬 ${image.sceneNumber} - placeholder 이미지, 비디오 생성 건너뛰기`);
          image.status = 'skipped_placeholder';
          continue;
        }
        if (!image.imageUrl) continue;

        try {
          console.log(`[storyboard-init] 비디오 생성 중: 컨셉 ${styleIdx + 1}, 씬 ${image.sceneNumber}`);
          
          const taskId = await generateVideo(image.imageUrl, image.motionPrompt, image.sceneNumber, body);
          
          // 🔥 수정: sessionId, currentVideoIndex, totalVideos 전달
          const videoUrl = await pollVideoStatus(taskId, image.sceneNumber, sessionId, completedVideos + 1, totalVideos);

          image.videoUrl = videoUrl;
          image.status = 'video_done';
          completedVideos++;

          const progress = (completedVideos / totalVideos) * 100;
          await updateSession(sessionId, {
            progress: {
              phase: 'VIDEO',
              percentage: calculateProgress('VIDEO', progress),
              currentStep: `비디오 ${completedVideos}/${totalVideos} 생성 완료`
            }
          });
        } catch (error) {
          console.error(`비디오 생성 실패 (씬 ${image.sceneNumber}):`, error);
          image.status = 'video_failed';
          image.error = error.message;
        }
      }
    }

    await updateSession(sessionId, {
      progress: {
        phase: 'VIDEO',
        percentage: calculateProgress('VIDEO', 100),
        currentStep: `모든 비디오 생성 완료`
      }
    });

    console.log(`[storyboard-init] ✅ 비디오 생성 완료: ${completedVideos}/${totalVideos}`);

    // PHASE 4: 비디오 합성 (80-100%)
    await updateSession(sessionId, {
      progress: {
        phase: 'COMPOSE',
        percentage: calculateProgress('COMPOSE', 0),
        currentStep: '비디오 합성 준비 중...'
      }
    });

    const finalVideos = [];
    for (let styleIdx = 0; styleIdx < styles.length; styleIdx++) {
      const style = styles[styleIdx];
      const segments = style.images
        .filter(img => img.videoUrl)
        .map(img => ({
          videoUrl: img.videoUrl,
          sceneNumber: img.sceneNumber
        }));

      if (segments.length === 0) continue;

      try {
        console.log(`[storyboard-init] 비디오 합성 중: 컨셉 ${styleIdx + 1}`);
        const compileResponse = await fetch(`${API_BASE}/api/compile-videos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionId,
            concept: style.conceptName,
            segments: segments,
            videoLength: body.videoLength,
            formData: body,
            jsonMode: true,
          })
        });

        if (!compileResponse.ok) throw new Error(`HTTP ${compileResponse.status}`);
        const compileResult = await compileResponse.json();
        if (!compileResult.success || !compileResult.compiledVideoUrl) throw new Error('비디오 합성 실패');

        finalVideos.push({
          conceptId: style.conceptId,
          conceptName: style.conceptName,
          videoUrl: compileResult.compiledVideoUrl,
          metadata: compileResult.metadata
        });

        const progress = ((styleIdx + 1) / styles.length) * 100;
        await updateSession(sessionId, {
          progress: {
            phase: 'COMPOSE',
            percentage: calculateProgress('COMPOSE', progress),
            currentStep: `컨셉 ${styleIdx + 1}/${styles.length} 합성 완료`
          }
        });
      } catch (error) {
        console.error(`컨셉 ${styleIdx + 1} 합성 실패:`, error);
      }
    }

    // 완료
    const compositingInfo = analyzeCompositingInfo(body, compositingScenes);
    const metadata = {
      promptFile: promptFile,
      promptFileName: promptFileName,
      mode: mode || 'auto',
      videoPurpose,
      videoLength,
      sceneCountPerConcept,
      aspectRatio: mapAspectRatio(aspectRatio || aspectRatioCode),
      generatedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
      geminiModel: "gemini-2.5-flash",
      brandName,
      totalConcepts: styles.length,
      compositingScenes: compositingScenes.length,
      hasImageUpload: !!(imageUpload && imageUpload.url),
      compositingInfo: compositingInfo,
      finalVideos: finalVideos
    };

    incrementUsageCount(username);
    
    const finalStoryboard = {
      success: true,
      styles,
      finalVideos,
      metadata,
      compositingInfo,
      fullOutput: fullOutput,
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
    
    await updateSession(sessionId, {
      status: 'completed',
      progress: {
        phase: 'COMPLETE',
        percentage: 100,
        currentStep: `🎉 최종 완성! ${finalVideos.length}개 비디오 생성 완료!`
      },
      result: finalStoryboard
    });
    
    // 🔥 신규 추가: 프로젝트에 스토리보드 저장
    if (body.projectId && username) {
      try {
        console.log(`[storyboard-init] 📁 프로젝트에 스토리보드 저장 시작: ${body.projectId}`);
        
        const saveResponse = await fetch(`${API_BASE}/nexxii/api/projects/${body.projectId}/storyboard`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-username': username
          },
          body: JSON.stringify({
            storyboard: finalStoryboard,
            formData: body // formData도 함께 저장
          })
        });
    
        if (saveResponse.ok) {
          const saveResult = await saveResponse.json();
          console.log(`[storyboard-init] ✅ 프로젝트 저장 성공:`, saveResult);
        } else {
          const errorText = await saveResponse.text();
          console.error(`[storyboard-init] ❌ 프로젝트 저장 실패 (${saveResponse.status}):`, errorText);
        }
      } catch (saveError) {
        console.error('[storyboard-init] ❌ 프로젝트 저장 오류:', saveError);
        // 저장 실패해도 전체 프로세스는 성공으로 처리
      }
    }
    
    console.log('[storyboard-init] ✅ 전체 자동화 완료!');

  } catch (error) {
    console.error('[storyboard-init] ❌ 오류 발생:', error);
    await updateSession(sessionId, {
      status: 'error',
      error: { message: error.message || '오류 발생', stack: error.stack },
      progress: {
        phase: 'ERROR',
        percentage: 0,
        currentStep: '오류: ' + (error.message || '알 수 없는 오류')
      }
    });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const username = req.headers['x-username'] || 'anonymous';
  const sessionId = req.body.sessionId || `session_${Date.now()}_${username}`;

  // 🔥 추가: 세션 즉시 생성
  let session = sessionStore.getSession(sessionId);
  if (!session) {
    console.log(`[storyboard-init] 🆕 세션 생성: ${sessionId}`);
    sessionStore.createSession(sessionId, {
      username: username,
      formData: req.body,
      startedAt: Date.now()
    });
  } else {
    console.log(`[storyboard-init] ✅ 기존 세션 확인: ${sessionId}`);
  }

  res.status(202).json({
    success: true,
    sessionId: sessionId,
    message: '🚀 전체 자동화 파이프라인 시작'
  });

  processStoryboardAsync(req.body, username, sessionId).catch(err => {
    console.error('[storyboard-init] 백그라운드 처리 실패:', err);
  });
}

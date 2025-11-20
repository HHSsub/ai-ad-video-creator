// api/storyboard-init.js

export const config = {
  maxDuration: 9000,
};

import fs from 'fs';
import path from 'path';
import { safeCallGemini } from '../src/utils/apiHelpers.js';

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
  console.log(`[getPromptFile] videoPurpose: ${videoPurpose}, mode: ${mode}`);
  
  if (mode === 'manual') {
    console.log('[getPromptFile] → 매뉴얼 프롬프트');
    return 'manual';
  }
  
  if (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education') {
    console.log('[getPromptFile] → 제품용 프롬프트');
    return 'product';
  } else if (videoPurpose === 'service' || videoPurpose === 'brand') {
    console.log('[getPromptFile] → 서비스용 프롬프트');
    return 'service';
  }
  
  console.log('[getPromptFile] → 기본값 (제품용)');
  return 'product';
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
      console.log('[saveGeminiResponse] gemini_responses 폴더 생성');
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

    console.log(`[saveGeminiResponse] ✅ Gemini 응답 저장 완료: ${fileName}`);
    return {
      success: true,
      fileName
    };

  } catch (error) {
    console.error('[saveGeminiResponse] ❌ Gemini 응답 저장 실패:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

function parseUnifiedConceptJSON(text, mode = 'auto') {
  try {
    console.log('[parseUnifiedConceptJSON] 파싱 시작, mode:', mode);
    
    const expectedConceptCount = mode === 'manual' ? 1 : 3;
    
    // 1. 컨셉 블록 추출 - mode에 따라 다른 패턴 사용
    let conceptMatches = [];
    
    if (mode === 'manual') {
      // manual 모드: Section 2 패턴 찾기 (대소문자 무시, 공백 유연하게)
      const manualConceptPattern = /Section\s*2[\s.:]*[^\n]*(?:Cinematic|Storyboard)[^\n]*/i;
      const match = text.match(manualConceptPattern);
      
      if (match) {
        console.log('[parseUnifiedConceptJSON] Manual 모드 - Section 2 발견:', match[0]);
        // Section 2를 찾았으면 matchAll 형식과 호환되는 매치 객체 생성
        conceptMatches = [{
          0: match[0],
          1: '1', // 컨셉 번호 1로 설정
          2: 'Manual Video Concept', // 기본 컨셉 이름
          index: match.index,
          input: text
        }];
      }
    } else {
      // auto 모드: 기존 패턴 사용
      const conceptPattern = /###\s*(\d+)\.\s*컨셉:\s*(.+)/g;
      conceptMatches = [...text.matchAll(conceptPattern)];
    }
    
    if (conceptMatches.length === 0) {
      console.error('[parseUnifiedConceptJSON] 컨셉 헤더를 찾을 수 없음');
      const debugPath = path.join(process.cwd(), 'debug_unified_response.txt');
      fs.writeFileSync(debugPath, text, 'utf-8');
      console.log('[parseUnifiedConceptJSON] 응답 저장:', debugPath);
      return null;
    }
    
    console.log(`[parseUnifiedConceptJSON] ${conceptMatches.length}개 컨셉 발견 (기대: ${expectedConceptCount}개)`);
    
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
      
      console.log(`[parseUnifiedConceptJSON] 컨셉 ${conceptNum}: ${conceptName}`);
      
      const bigIdeaMatch = conceptText.match(/Big Idea:\s*(.+)/);
      const bigIdea = bigIdeaMatch ? bigIdeaMatch[1].trim() : '';
      
      const styleMatch = conceptText.match(/Style:\s*(.+)/);
      const style = styleMatch ? styleMatch[1].trim() : '';
      
      // 2. 씬 블록 추출
      const scenePattern = /###\s*S#(\d+)\s*\(([^)]+)\)/g;
      const sceneMatches = [...conceptText.matchAll(scenePattern)];
      
      console.log(`[parseUnifiedConceptJSON] 컨셉 ${conceptNum} - 발견된 씬: ${sceneMatches.length}개`);
      
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
        
        console.log(`[parseUnifiedConceptJSON]   처리 중: S#${sceneNum} (${timecode})`);
        
        // Visual Description 추출
        const visualDescMatch = sceneText.match(/Visual Description:\s*(.+?)(?=JSON|###|$)/s);
        const visualDescription = visualDescMatch ? visualDescMatch[1].trim() : '';
        
        // 🔥🔥🔥 개선된 JSON 블록 추출 (백틱 있는/없는 형식 모두 지원)
        const jsonBlocks = extractJSONBlocks(sceneText);
        
        console.log(`[parseUnifiedConceptJSON]   S#${sceneNum}: JSON 블록 ${jsonBlocks.length}개 발견`);
        
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
            
            console.log(`[parseUnifiedConceptJSON]   → S#${sceneNum} 파싱 성공`);
          } catch (e) {
            console.error(`[parseUnifiedConceptJSON] JSON 파싱 실패 (컨셉 ${conceptNum}, 씬 ${sceneNum}):`, e.message);
            console.error('[parseUnifiedConceptJSON] JSON 블록 내용:');
            jsonBlocks.forEach((block, idx) => {
              console.error(`  블록 ${idx + 1}:`, block.substring(0, 200));
            });
          }
        } else {
          console.warn(`[parseUnifiedConceptJSON] 씬 ${sceneNum}에서 3개의 JSON 블록을 찾지 못함 (${jsonBlocks.length}개 발견)`);
          
          // 🔥 디버깅: 실제 텍스트 일부 출력
          console.log(`[parseUnifiedConceptJSON] 씬 텍스트 샘플 (처음 500자):`);
          console.log(sceneText.substring(0, 500));
        }
      }
      
      const sceneKeys = Object.keys(conceptData).filter(k => k.startsWith('scene_'));
      console.log(`[parseUnifiedConceptJSON] 컨셉 ${conceptNum} 최종 씬 수: ${sceneKeys.length}개`);
      
      concepts.push(conceptData);
    }
    
    console.log(`[parseUnifiedConceptJSON] ✅ 파싱 완료: ${concepts.length}개 컨셉`);
    concepts.forEach((c, idx) => {
      const sceneCount = Object.keys(c).filter(k => k.startsWith('scene_')).length;
      console.log(`  컨셉 ${idx + 1} (${c.concept_name}): ${sceneCount}개 씬`);
    });
    
    return { concepts };
    
  } catch (error) {
    console.error('[parseUnifiedConceptJSON] 전체 파싱 오류:', error);
    console.error('[parseUnifiedConceptJSON] 스택:', error.stack);
    return null;
  }
}

/**
 * 🔥 JSON 블록 추출 함수 (백틱 있는/없는 형식 모두 지원)
 * @param {string} text - 파싱할 텍스트
 * @returns {string[]} - 추출된 JSON 문자열 배열
 */
function extractJSONBlocks(text) {
  const jsonBlocks = [];
  
  // 패턴 1: 백틱으로 감싸진 JSON (```json ... ``` 또는 ```python ... ```)
  const backtickPattern = /```(?:json|python)?\s*\n([\s\S]*?)\n```/g;
  let backtickMatches = [...text.matchAll(backtickPattern)];
  
  // 패턴 2: "JSON" 단어 다음에 오는 순수 JSON (백틱 없음)
  // "JSON\n{...}" 형식
  const plainJSONPattern = /(?:^|\n)JSON\s*\n(\{[\s\S]*?\n\})\s*(?=\n(?:JSON|###|```|$))/gm;
  let plainMatches = [...text.matchAll(plainJSONPattern)];
  
  // 패턴 3: "JSON" 단어 다음에 "```copy" 형식 (특수 케이스)
  const copyPattern = /(?:^|\n)JSON\s*\n```copy\s*\n([\s\S]*?)\n```/gm;
  let copyMatches = [...text.matchAll(copyPattern)];
  
  console.log(`[extractJSONBlocks] 백틱 매치: ${backtickMatches.length}, 순수 JSON 매치: ${plainMatches.length}, Copy 매치: ${copyMatches.length}`);
  
  // 모든 매치를 위치 순서대로 정렬
  const allMatches = [];
  
  backtickMatches.forEach(match => {
    const content = match[1].trim();
    // 백틱 안에 {로 시작하는 JSON인지 확인
    if (content.startsWith('{')) {
      allMatches.push({
        index: match.index,
        content: content,
        type: 'backtick'
      });
    }
  });
  
  plainMatches.forEach(match => {
    allMatches.push({
      index: match.index,
      content: match[1].trim(),
      type: 'plain'
    });
  });
  
  // Copy 패턴 처리 (copy 키를 가진 JSON으로 변환)
  copyMatches.forEach(match => {
    const copyText = match[1].trim();
    const copyJSON = JSON.stringify({ copy: copyText });
    allMatches.push({
      index: match.index,
      content: copyJSON,
      type: 'copy'
    });
  });
  
  // 위치 순서대로 정렬
  allMatches.sort((a, b) => a.index - b.index);
  
  // JSON 문자열만 추출
  allMatches.forEach(match => {
    console.log(`[extractJSONBlocks]   매치 타입: ${match.type}, 위치: ${match.index}, 내용 시작: ${match.content.substring(0, 50)}...`);
    jsonBlocks.push(match.content);
  });
  
  return jsonBlocks;
}

// 🔥🔥🔥 ES Module export로 변경
export {
  parseUnifiedConceptJSON,
  extractJSONBlocks
};

async function updateSession(sessionId, data) {
  try {
    console.log(`[updateSession] 진행률: ${data.progress}%, 메시지: ${data.message || ''}`);
    await fetch(`http://localhost:3000/api/session/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, ...data })
    });
  } catch (e) {
    console.error('[updateSession] 실패:', e);
  }
}

async function processStoryboardAsync(body, username, sessionId) {
  const startTime = Date.now();
  
  try {
    const usageCheck = checkUsageLimit(username);
    
    if (!usageCheck.allowed) {
      console.warn('[storyboard-init] 사용 한도 초과:', username);
      await updateSession(sessionId, {
        error: usageCheck.message,
        progress: 0,
        completed: true
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
      imageUpload,
      mode,
      userDescription
    } = body;

    console.log('[storyboard-init] 🚀 요청 수신:', {
      brandName,
      videoLength,
      videoPurpose,
      mode: mode || 'auto',
      aspectRatio: aspectRatio || aspectRatioCode
    });

    const promptFile = getPromptFile(videoPurpose, mode);
    const promptFileName = PROMPT_FILE_MAPPING[promptFile];
    const promptFilePath = path.join(process.cwd(), 'public', promptFileName);

    if (!fs.existsSync(promptFilePath)) {
      console.error(`[storyboard-init] 프롬프트 파일 없음:`, promptFilePath);
      await updateSession(sessionId, {
        error: `프롬프트 파일을 찾을 수 없습니다: ${promptFileName}`,
        progress: 0,
        completed: true
      });
      return;
    }

    console.log(`[storyboard-init] 📝 프롬프트 파일 로드: ${promptFileName}`);
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
      userdescription: userDescription || ''
    };

    console.log('[storyboard-init] 🔄 변수 치환:', promptVariables);

    for (const [key, value] of Object.entries(promptVariables)) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      promptTemplate = promptTemplate.replace(placeholder, value);
    }

    console.log(`[storyboard-init] ✅ 변수 치환 완료`);

    await updateSession(sessionId, {
      progress: 20,
      message: '통합 컨셉 생성 중...'
    });

    console.log(`[storyboard-init] 📡 통합 Gemini API 호출 시작`);
    console.log('[storyboard-init] ⏰ 타임스탬프:', new Date().toISOString());
    console.log('[storyboard-init] 📝 프롬프트 길이:', promptTemplate.length, 'chars');
    
    const geminiResponse = await safeCallGemini(promptTemplate, {
      label: 'UNIFIED-storyboard-init',
      maxRetries: 3,
      isImageComposition: false
    });

    await updateSession(sessionId, {
      progress: 30,
      message: 'AI 응답 대기 중... (최대 5분 소요)'
    });
    
    const fullOutput = geminiResponse.text;
    console.log("[storyboard-init] ✅ 통합 응답 완료:", fullOutput.length, "chars");
    console.log('[storyboard-init] ⏰ 소요 시간:', (Date.now() - startTime) / 1000, '초');
    
    await updateSession(sessionId, {
      progress: 60,
      message: '응답 파싱 중...'
    });
    
    console.log('\n========== UNIFIED FULL RESPONSE ==========');
    console.log(fullOutput);
    console.log('==========================================\n');

    saveGeminiResponse(
      promptFile,
      'unified',
      body,
      fullOutput
    );
    console.log('[storyboard-init] 💾 응답 저장 완료');

    const sceneCountPerConcept = getSceneCount(videoLength);
    console.log(`[storyboard-init] 📊 컨셉당 씬 수: ${sceneCountPerConcept}개`);

    const compositingScenes = detectProductCompositingScenes(fullOutput, videoPurpose);
    console.log('[storyboard-init] 🎯 감지된 합성 씬:', compositingScenes);

    const mcJson = parseUnifiedConceptJSON(fullOutput, mode);
    console.log("[storyboard-init] 📊 JSON 파싱 결과:", mcJson);

    // ✅ 추가
    await updateSession(sessionId, {
      progress: 80,
      message: '이미지 프롬프트 생성 중...'
    });
        
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
              timecode: scene.timecode || `00:${String((i-1)*2).padStart(2,'0')}-00:${String(i*2).padStart(2,'0')}`,
              visual_description: scene.visual_description || '',
              prompt: scene.image_prompt?.prompt || `${concept.concept_name} scene ${i}`,
              negative_prompt: scene.image_prompt?.negative_prompt || "blurry, low quality, watermark, text, logo",
              motion_prompt: scene.motion_prompt?.prompt || "subtle camera movement",
              copy: scene.copy?.copy || `씬 ${i}`,
              compositingContext: isCompositingScene ? 
                `[PRODUCT COMPOSITING SCENE] ${concept.concept_name} scene ${i}` : 
                `${concept.concept_name} scene ${i}`,
              isCompositing: isCompositingScene,
              compositingInfo: isCompositingScene ? {
                compositingContext: compositingScenes.find(cs => cs.sceneNumber === i)?.context || '[PRODUCT COMPOSITING SCENE]',
                explicit: compositingScenes.find(cs => cs.sceneNumber === i)?.explicit || false,
                videoPurpose: videoPurpose
              } : null,
              aspect_ratio: scene.image_prompt?.image?.size || mapAspectRatio(aspectRatio || aspectRatioCode),
              guidance_scale: scene.image_prompt?.guidance_scale || 7.5,
              seed: scene.image_prompt?.seed || Math.floor(10000 + Math.random() * 90000),
              size: scene.image_prompt?.image?.size || mapAspectRatio(aspectRatio || aspectRatioCode),
              width: getWidthFromAspectRatio(mapAspectRatio(aspectRatio || aspectRatioCode)),
              height: getHeightFromAspectRatio(mapAspectRatio(aspectRatio || aspectRatioCode)),
              styling: scene.image_prompt?.styling || {
                style: scene.image_prompt?.styling?.style || 'photo',
                color: scene.image_prompt?.styling?.color || 'color',
                lighting: scene.image_prompt?.styling?.lighting || 'natural'
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
          big_idea: concept.big_idea || '',
          concept_description: concept.big_idea || `${videoPurpose} 광고를 위한 ${concept.concept_name} 접근법`,
          style: concept.style || 'Commercial Photography',
          headline: concept.concept_name,
          description: concept.big_idea || `${videoPurpose} 광고를 위한 ${concept.concept_name} 접근법`,
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

    const compositingInfo = analyzeCompositingInfo(body, compositingScenes);
    console.log('[storyboard-init] 🎨 합성 정보:', compositingInfo);

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
      fullOutputLength: fullOutput.length,
      brandName,
      totalConcepts: styles.length,
      compositingScenes: compositingScenes.length,
      hasImageUpload: !!(imageUpload && imageUpload.url),
      compositingInfo: compositingInfo
    };

    incrementUsageCount(username);
    const finalStoryboard = {
      success: true,
      styles,
      metadata,
      compositingInfo,
      fullOutput: fullOutput,
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
    
    console.log('[storyboard-init] 📊 최종 storyboard 객체:', {
      conceptCount: styles.length,
      sceneCount: styles[0]?.images?.length || 0,
      totalImages: styles.length * (styles[0]?.images?.length || 0)
    });
    
    await updateSession(sessionId, {
      progress: 100,
      message: '✅ 스토리보드 생성 완료!',
      completed: true,
      storyboard: finalStoryboard
    });
    
    console.log('[storyboard-init] ✅ 백그라운드 처리 완료 - 세션에 저장됨');

  } catch (error) {
    console.error('[storyboard-init] ❌ 오류 발생:', error);
    console.error('[storyboard-init] 스택 트레이스:', error.stack);

    await updateSession(sessionId, {
      error: '스토리보드 생성 중 오류가 발생했습니다. 관리자에게 문의하세요.',
      progress: 0,
      completed: true
    });
  }
}

export default async function handler(req, res) {
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

  const username = req.headers['x-username'] || 'anonymous';
  console.log(`[storyboard-init] 📥 요청 수신 (사용자: ${username})`);

  const sessionId = req.body.sessionId || `session_${Date.now()}_${username}`;
  console.log(`[storyboard-init] 📝 세션 ID: ${sessionId}`);

  res.status(202).json({
    success: true,
    sessionId: sessionId,
    message: '스토리보드 생성이 시작되었습니다'
  });

  processStoryboardAsync(req.body, username, sessionId).catch(err => {
    console.error('[storyboard-init] 백그라운드 처리 실패:', err);
  });
}

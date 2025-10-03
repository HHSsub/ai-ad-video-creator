// api/storyboard-init.js - 이미지 생성 문제 완벽 수정

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
    }
  } catch (error) {
    console.error('[storyboard-init] 사용 횟수 증가 오류:', error);
  }
}

function extractConceptBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let currentBlock = null;
  
  lines.forEach((line, index) => {
    if (line.match(/^\d+\.\s*컨셉:/)) {
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
            const imagePromptJSON = JSON.parse(jsonBlocks[0][1].trim());
            const motionPromptJSON = JSON.parse(jsonBlocks[1][1].trim());
            const copyJSON = JSON.parse(jsonBlocks[2][1].trim());
            
            conceptData[`scene_${sceneNum}`] = {
              title: `Scene ${sceneNum}`,
              image_prompt: imagePromptJSON,
              motion_prompt: motionPromptJSON,
              copy: copyJSON
            };
          } catch (e) {
            console.error(`[parseMultiConceptJSON] JSON 파싱 실패 (컨셉 ${conceptNum}, 씬 ${sceneNum}):`, e.message);
          }
        } else {
          console.warn(`[parseMultiConceptJSON] 씬 ${sceneNum}에서 3개의 JSON 블록을 찾지 못함`);
        }
      }
      
      concepts.push(conceptData);
    }
    
    return { concepts };
    
  } catch (error) {
    console.error('[parseMultiConceptJSON] 전체 파싱 오류:', error);
    return null;
  }
}

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
    const username = req.headers['x-username'] || 'anonymous';
    console.log(`[storyboard-init] 📥 요청 수신 (사용자: ${username})`);

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
      compositingInfo,
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

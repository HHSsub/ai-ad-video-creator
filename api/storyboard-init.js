// api/storyboard-init.js - 완전 복구 (Part 1) - 영상설명 필드만 제거, 나머지 모든 로직 유지
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { apiKeyManager } from '../src/utils/apiKeyManager.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🔥 프롬프트 파일 매핑 - 제품/서비스 분기
const PROMPT_FILE_MAPPING = {
  'step1_product': 'Prompt_step1_product.txt',  // 대문자 P 추가
  'step1_service': 'Prompt_step1_service.txt',
  'step2_product': 'Prompt_step2_product.txt',
  'step2_service': 'Prompt_step2_service.txt'
};

// 영상 길이에 따른 씬 수 결정
function getSceneCount(videoLength) {
  const lengthNumber = parseInt(videoLength);
  if (lengthNumber <= 15) return 3;
  if (lengthNumber <= 30) return 4;
  if (lengthNumber <= 60) return 6;
  return 8;
}

// 종횡비 코드 매핑
function mapAspectRatio(aspectRatio) {
  console.log(`[mapAspectRatio] 입력: ${aspectRatio}`);
  
  if (!aspectRatio || typeof aspectRatio !== 'string') {
    console.log('[mapAspectRatio] → 기본값: widescreen_16_9');
    return 'widescreen_16_9';
  }

  const cleanRatio = aspectRatio.toLowerCase().trim();
  
  if (cleanRatio.includes('16:9') || cleanRatio.includes('가로')) {
    console.log('[mapAspectRatio] → widescreen_16_9');
    return 'widescreen_16_9';
  }
  
  if (cleanRatio.includes('1:1') || cleanRatio.includes('정사각형')) {
    console.log('[mapAspectRatio] → square_1_1');
    return 'square_1_1';
  }
  
  if (cleanRatio.includes('9:16') || cleanRatio.includes('세로')) {
    console.log('[mapAspectRatio] → portrait_9_16');
    return 'portrait_9_16';
  }

  console.log('[mapAspectRatio] 기본값: widescreen_16_9');
  return 'widescreen_16_9';
}

// 🔥 해상도 매핑 함수들 (복구)
function getWidthFromAspectRatio(aspectRatio) {
  const resolutions = {
    'widescreen_16_9': 1344,
    'vertical_9_16': 768,
    'square_1_1': 1024,
  };
  return resolutions[aspectRatio] || 1344;
}

function getHeightFromAspectRatio(aspectRatio) {
  const resolutions = {
    'widescreen_16_9': 768,
    'vertical_9_16': 1344,
    'square_1_1': 1024,
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

      // PRODUCT COMPOSITING SCENE 감지
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

      // 암시적 합성 씬 감지 (제품이 필요한 상황)
      if ((videoPurpose === 'product' || videoPurpose === 'conversion') && 
          currentSceneNumber && 
          (line.includes('제품') || 
           line.includes('product') || 
           line.includes('상품'))) {
        
        const hasExplicitCompositing = compositingScenes.some(cs => cs.sceneNumber === currentSceneNumber && cs.explicit);
        if (!hasExplicitCompositing) {
          compositingScenes.push({
            sceneNumber: currentSceneNumber,
            lineNumber: i + 1,
            content: line.trim(),
            type: 'product_compositing',
            explicit: false,
            context: `제품 노출 씬 ${currentSceneNumber}`,
            videoPurpose: videoPurpose
          });
        }
      }
    }

    console.log(`[detectProductCompositingScenes] 감지된 합성 씬: ${compositingScenes.length}개`);
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
  finalPrompt = finalPrompt.replace('{phase1_output}', phase1Output);
  finalPrompt = finalPrompt.replace('{sceneCount}', sceneCount);
  finalPrompt = finalPrompt.replace('{brandName}', requestBody.brandName || '');
  finalPrompt = finalPrompt.replace('{videoPurpose}', requestBody.videoPurpose || '');
  
  return finalPrompt;
}

// JSON 파싱 함수
function parseMultiConceptJSON(text) {
  try {
    // JSON 블록 찾기
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // 직접 JSON 찾기
    const directMatch = text.match(/\{[\s\S]*\}/);
    if (directMatch) {
      return JSON.parse(directMatch[0]);
    }
    
    return null;
  } catch (error) {
    console.error('JSON 파싱 오류:', error);
    return null;
  }
}

// 안전한 Gemini API 호출
async function safeCallGemini(prompt, options = {}) {
  const { label = 'gemini-call', maxRetries = 3 } = options;
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // apiKeyManager에서 최적 키 선택
      const { key: apiKey, index: keyIndex } = apiKeyManager.selectBestGeminiKey();
      console.log(`[${label}] Gemini API 호출 시도 ${attempt}/${maxRetries} (키: ${keyIndex})`);
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      if (!text || text.length < 10) {
        throw new Error('Gemini 응답이 너무 짧습니다.');
      }
      console.log(`[${label}] 성공: ${text.length} chars`);
      // 성공 기록
      apiKeyManager.markKeySuccess('gemini', keyIndex);
      return { text };
    } catch (error) {
      lastError = error;
      console.log(`[${label}] 시도 ${attempt} 실패:`, error.message);
      // 에러 기록 (키 인덱스 있으면)
      if (error.keyIndex !== undefined) {
        apiKeyManager.markKeyError('gemini', error.keyIndex, error.message);
      }
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  throw new Error(`Gemini API 호출 실패: ${lastError.message}`);
}

// 합성 정보 분석
function analyzeCompositingInfo(formData, compositingScenes) {
  return {
    needsCompositing: compositingScenes.length > 0,
    hasProductImage: !!(formData.imageRef && formData.imageRef.url),
    hasBrandLogo: !!(formData.imageRef && formData.imageRef.url),
    scenes: compositingScenes,
    productImageData: formData.imageRef || null,
    brandLogoData: formData.imageRef || null,
    totalCompositingScenes: compositingScenes.length
  };
}

// 🔥 제품/서비스에 따른 프롬프트 파일 결정
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

// 🔥 Z+ 추가: 사용자 파일 경로 및 함수들
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

// 🔥 Z+ 추가: checkUsageLimit 함수 정의
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

    // 관리자는 무제한 사용
    if (user.role === 'admin') {
      console.log('[storyboard-init] 관리자 사용자:', username);
      return { allowed: true };
    }

    // 일일 리셋 체크
    const resetNeeded = checkAndResetDaily(user);
    
    // 사용 횟수 제한 확인
    const currentUsage = user.usageCount || 0;
    const usageLimit = user.usageLimit;

    if (usageLimit !== null && usageLimit !== undefined) {
      if (currentUsage >= usageLimit) {
        console.warn('[storyboard-init] 사용 횟수 초과:', username, currentUsage, '/', usageLimit);
        return { 
          allowed: false, 
          message: `일일 사용 횟수를 초과했습니다. (${currentUsage}/${usageLimit})` 
        };
      }
    }

    // 사용 횟수 증가
    user.usageCount = currentUsage + 1;
    
    if (resetNeeded || currentUsage < usageLimit) {
      saveUsers(users);
    }

    console.log('[storyboard-init] 사용 허용:', username, user.usageCount, '/', usageLimit || '무제한');
    return { allowed: true };

  } catch (error) {
    console.error('[storyboard-init] 사용 횟수 체크 오류:', error);
    return { allowed: false, message: '서버 오류가 발생했습니다.' };
  }
}

// 🔥 메인 핸들러 함수 (완전 복구)
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 🔥 사용 횟수 체크 추가 (여기만 추가)
  const username = req.headers['x-username'] || req.body?.username;
  
  if (username) {
    const usageCheck = checkUsageLimit(username);
    
    if (!usageCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: usageCheck.message || '사용 횟수를 초과했습니다.',
        usageLimitExceeded: true
      });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  const startTime = Date.now();

  try {
    const {
      brandName,
      industryCategory,
      productServiceCategory,
      productServiceName,
      videoPurpose,
      videoLength,
      coreTarget,
      coreDifferentiation,
      videoRequirements = '',
      imageRef = null,
      aspectRatioCode = 'widescreen_16_9'
    } = req.body;

    console.log(`[storyboard-init] 🚀 시작: ${brandName} - ${videoPurpose}`);

    // 🔥 필수 필드 검증
    const requiredFields = {
      brandName: '브랜드명',
      industryCategory: '산업 카테고리',
      productServiceCategory: '제품/서비스 카테고리',
      productServiceName: '제품명/서비스명',
      videoPurpose: '영상 목적',
      videoLength: '영상 길이',
      coreTarget: '핵심 타겟',
      coreDifferentiation: '핵심 차별점'
    };

    const missingFields = [];
    for (const [field, label] of Object.entries(requiredFields)) {
      if (!req.body[field]) {
        missingFields.push(label);
      }
    }

    if (missingFields.length > 0) {
      console.error(`[storyboard-init] 필수 필드 누락:`, missingFields);
      return res.status(400).json({
        success: false,
        error: `필수 필드가 누락되었습니다: ${missingFields.join(', ')}`
      });
    }

    // 🔥 제품/서비스 분기에 따른 프롬프트 파일 선택
    const promptFiles = getPromptFiles(videoPurpose);
    
    // 🔥 STEP1 프롬프트 파일 로드 (public 폴더 + 관리자 수정사항)
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

    // 🔥 STEP1 변수 치환
    const step1Variables = {
      brandName,
      industryCategory,
      productServiceCategory,
      productServiceName,
      videoPurpose,
      videoLength,
      coreTarget,
      coreDifferentiation,
      videoRequirements: videoRequirements || '특별한 요구사항 없음',
      imageRef: imageRef ? '업로드됨' : '업로드 안됨',
      aspectRatioCode: mapAspectRatio(aspectRatioCode)
    };

    // STEP1 프롬프트 템플릿에서 변수 치환
    for (const [key, value] of Object.entries(step1Variables)) {
      const placeholder = `{${key}}`;
      step1PromptTemplate = step1PromptTemplate.replace(new RegExp(placeholder, 'g'), value);
    }

    console.log(`[storyboard-init] ✅ STEP1 변수 치환 완료 (${Object.keys(step1Variables).length}개 변수)`);

    // 🔥 STEP1: Gemini API 호출
    console.log(`[storyboard-init] 📡 STEP1 Gemini API 호출 시작`);
    const step1 = await safeCallGemini(step1PromptTemplate, {
      label: 'STEP1-storyboard-init',
      maxRetries: 3,
      isImageComposition: false
    });

    const phase1_output = step1.text;
    console.log("[storyboard-init] ✅ STEP1 완료:", phase1_output.length, "chars");

    // 🔥 씬 수 계산
    const sceneCountPerConcept = getSceneCount(videoLength);
    console.log(`[storyboard-init] 📊 컨셉당 씬 수: ${sceneCountPerConcept}개`);

    // 🔥 PRODUCT COMPOSITING SCENE 감지
    const compositingScenes = detectProductCompositingScenes(phase1_output, videoPurpose);
    console.log('[storyboard-init] 🎯 감지된 합성 씬:', compositingScenes);

    // 🔥 컨셉 블록 추출
    const conceptBlocks = extractConceptBlocks(phase1_output);
    console.log(`[storyboard-init] 📋 추출된 컨셉 블록: ${conceptBlocks.length}개`);

    // 🔥 STEP2 프롬프트 파일 로드 (public 폴더 + 관리자 수정사항)
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

    // 🔥 STEP2: 상세 JSON 생성 (public 폴더 프롬프트 사용)
    const step2Prompt = buildFinalPrompt(phase1_output, conceptBlocks, req.body, sceneCountPerConcept, step2PromptContent);
    console.log('[storyboard-init] 📡 STEP2 Gemini API 호출 시작');
    console.log(`[storyboard-init] STEP2 프롬프트 길이: ${step2Prompt.length} chars`);

    const step2 = await safeCallGemini(step2Prompt, {
      label: 'STEP2-storyboard-init',
      maxRetries: 3,
      isImageComposition: false
    });

    console.log("[storyboard-init] ✅ STEP2 완료:", step2.text.length, "chars");

    // 🔥 멀티 컨셉 JSON 파싱
    const mcJson = parseMultiConceptJSON(step2.text);
    console.log("[storyboard-init] 📊 JSON 파싱 결과:", mcJson);

    let styles = [];
    if (mcJson && Array.isArray(mcJson.concepts) && mcJson.concepts.length > 0) {
      // 컨셉 데이터를 스타일 배열로 변환
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
              negative_prompt: scene.image_prompt?.negative_prompt || "blurry, low quality",
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
              } : null
            });
          }
        }

        return {
          id: index + 1,
          concept_id: index + 1,
          conceptId: index + 1,
          conceptName: concept.concept_name,
          style: concept.style,
          headline: `${concept.concept_name} 헤드라인`,
          description: `${videoPurpose} 광고를 위한 ${concept.concept_name} 접근법`,
          copy: `${concept.concept_name} 카피`,
          imagePrompts: imagePrompts,
          images: [],
          metadata: {
            videoPurpose: videoPurpose,
            conceptType: concept.concept_name,
            sceneCount: sceneCountPerConcept
          }
        };
      });
    }

    // 🔥 합성 정보 분석 (imageRef 사용)
    const compositingInfo = analyzeCompositingInfo(req.body, compositingScenes);
    console.log('[storyboard-init] 🎨 합성 정보:', compositingInfo);

    // 🔥 메타데이터 생성 (복구)
    const metadata = {
      promptFiles: promptFiles,
      promptFiles_step1: step1FileName,
      promptFiles_step2: step2FileName,
      videoPurpose,
      videoLength,
      sceneCountPerConcept,
      aspectRatio: mapAspectRatio(req.body.aspectRatio || aspectRatioCode),
      generatedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
      geminiModel: "gemini-2.5-flash",
      step1Length: phase1_output.length,
      step2Length: step2.text.length,
      brandName,
      totalConcepts: styles.length,
      compositingScenes: compositingScenes.length,
      hasImageUpload: !!imageRef
    };

    const processingTimeMs = Date.now() - startTime;
    console.log(`[storyboard-init] ✅ 전체 처리 완료: ${processingTimeMs}ms`);

    // 🔥 최종 응답 데이터 (복구)
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
        fallbackUsed: !mcJson || !mcJson.concepts || mcJson.concepts.length !== 6
      }
    };

    console.log(`[storyboard-init] 🎉 성공 완료:`, {
      styles: styles.length,
      totalScenes: styles.length * sceneCountPerConcept,
      compositingScenes: compositingScenes.length,
      processingTime: `${processingTimeMs}ms`
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

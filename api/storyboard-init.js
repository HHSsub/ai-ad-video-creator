// api/storyboard-init.js - 완전 복구 (Part 1) - 영상설명 필드만 제거, 나머지 모든 로직 유지
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { safeCallGemini, getApiKeyStatus } from '../src/utils/apiHelpers.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🔥 프롬프트 파일 매핑 - 제품/서비스 분기
const PROMPT_FILE_MAPPING = {
  'step1_product': 'step1_product.txt',
  'step1_service': 'step1_service.txt',
  'step2_product': 'step2_product.txt', 
  'step2_service': 'step2_service.txt'
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
  
  if (cleanRatio.includes('9:16') || (cleanRatio.includes('세로') && !cleanRatio.includes('4:5'))) {
    console.log('[mapAspectRatio] → portrait_9_16');
    return 'portrait_9_16';
  }
  
  if (cleanRatio.includes('4:5') || (cleanRatio.includes('세로') && cleanRatio.includes('4:5'))) {
    console.log('[mapAspectRatio] → portrait_4_5');
    return 'portrait_4_5';
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
    'portrait_4_5': 1024
  };
  return resolutions[aspectRatio] || 1344;
}

function getHeightFromAspectRatio(aspectRatio) {
  const resolutions = {
    'widescreen_16_9': 768,
    'vertical_9_16': 1344,
    'square_1_1': 1024,
    'portrait_4_5': 1280
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
      if (line.includes('[PRODUCT COMPOSITING SCENE]') && currentSceneNumber) {
        compositingScenes.push({
          sceneNumber: currentSceneNumber,
          context: line,
          explicit: true,
          videoPurpose: videoPurpose
        });
        console.log(`[detectProductCompositingScenes] 발견: Scene ${currentSceneNumber}`);
      }
    }
  } catch (error) {
    console.error('[detectProductCompositingScenes] 파싱 오류:', error);
  }

  // 기본 합성 씬 (2번째 씬)이 없으면 추가
  if (compositingScenes.length === 0) {
    compositingScenes.push({
      sceneNumber: 2,
      context: '[PRODUCT COMPOSITING SCENE] 기본 설정',
      explicit: false,
      videoPurpose: videoPurpose
    });
    console.log('[detectProductCompositingScenes] 기본 Scene 2 추가');
  }

  return compositingScenes;
}

// 컨셉 블록 추출
function extractConceptBlocks(phase1_output) {
  const conceptBlocks = [];
  const defaultConcepts = [
    { concept_name: '욕망의 시각화', style: 'Dreamy Ethereal Photography' },
    { concept_name: '이질적 조합의 미학', style: 'Modern Surrealist Photography' },
    { concept_name: '핵심 가치의 극대화', style: 'Dynamic Action Photography' },
    { concept_name: '기회비용의 시각화', style: 'Gritty Cinematic Realism' },
    { concept_name: '트렌드 융합', style: 'Vibrant Candid Flash Photography' },
    { concept_name: '파격적 반전', style: 'Dramatic Film Noir Still' }
  ];

  try {
    const conceptPattern = /### (.+?):\s*(.+?)(?=\n###|\n\n|$)/gs;
    let match;
    
    while ((match = conceptPattern.exec(phase1_output)) !== null) {
      const conceptName = match[1].trim();
      const conceptContent = match[2].trim();
      
      conceptBlocks.push({
        concept_name: conceptName,
        content: conceptContent
      });
    }
  } catch (error) {
    console.error('[extractConceptBlocks] 파싱 오류:', error);
  }

  // 기본값 반환 (파싱 실패 시)
  if (conceptBlocks.length === 0) {
    console.log('[extractConceptBlocks] 기본 컨셉 사용');
    return defaultConcepts;
  }

  console.log(`[extractConceptBlocks] 추출된 컨셉: ${conceptBlocks.length}개`);
  return conceptBlocks;
}

// STEP2 프롬프트 구성 - public 폴더 프롬프트 사용 (복구)
function buildFinalPrompt(phase1_output, conceptBlocks, formData, sceneCountPerConcept, step2PromptContent) {
  // 🔥 관리자가 수정한 step2 프롬프트 내용 사용
  let finalPrompt = step2PromptContent;

  // 🔥 변수 치환
  const variables = {
    brandName: formData.brandName,
    industryCategory: formData.industryCategory,
    productServiceCategory: formData.productServiceCategory,
    productServiceName: formData.productServiceName,
    videoPurpose: formData.videoPurpose,
    videoLength: formData.videoLength,
    coreTarget: formData.coreTarget,
    coreDifferentiation: formData.coreDifferentiation,
    videoRequirements: formData.videoRequirements || '특별한 요구사항 없음',
    imageRef: formData.imageRef ? '업로드됨' : '업로드 안됨',
    aspectRatioCode: mapAspectRatio(formData.aspectRatio),
    phase1_output: phase1_output,
    sceneCountPerConcept: sceneCountPerConcept,
    sceneCount: sceneCountPerConcept // 추가 변수
  };

  // 프롬프트 템플릿에서 변수 치환
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    finalPrompt = finalPrompt.replace(new RegExp(placeholder, 'g'), value);
  }

  return finalPrompt;
}

// 🔥 멀티 컨셉 JSON 파싱 (완전 복구)
function parseMultiConceptJSON(responseText) {
  try {
    console.log('[parseMultiConceptJSON] JSON 파싱 시작');
    
    // JSON 블록 추출 시도
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                     responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      
      if (parsed.concepts && Array.isArray(parsed.concepts)) {
        console.log(`[parseMultiConceptJSON] JSON 파싱 성공: ${parsed.concepts.length}개 컨셉`);
        return parsed;
      }
    }

    console.warn('[parseMultiConceptJSON] JSON 형식 파싱 실패, 수동 파싱 시도');

    // 🔥 수동 파싱 로직 (복구)
    const concepts = [];
    const lines = responseText.split('\n');

    let currentConcept = null;
    let currentScene = null;
    let isInImagePrompt = false;
    let isInMotionPrompt = false;
    let isInCopy = false;
    let jsonBuffer = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 컨셉 시작 감지
      if (trimmed.includes('컨셉:') || trimmed.includes('Concept:') || trimmed.match(/^[\d]+\.\s/)) {
        if (currentConcept) {
          if (currentScene) currentConcept.scenes.push(currentScene);
          concepts.push(currentConcept);
        }
        
        const conceptName = trimmed.replace(/^\d+\.\s*/, '').replace(/컨셉:\s*/, '').replace(/Concept:\s*/, '').trim();
        currentConcept = {
          name: conceptName,
          style: getStyleFromConceptName(conceptName),
          scenes: []
        };
        currentScene = null;
        continue;
      }

      // 씬 시작 감지
      const sceneMatch = trimmed.match(/S#(\d+)|Scene\s*(\d+)|씬\s*(\d+)/i);
      if (sceneMatch && currentConcept) {
        if (currentScene) currentConcept.scenes.push(currentScene);
        
        currentScene = {
          scene_number: parseInt(sceneMatch[1] || sceneMatch[2] || sceneMatch[3], 10),
          image_prompt: '',
          motion_prompt: '',
          copy: ''
        };
        continue;
      }

      // JSON 블록 감지 및 처리
      if (trimmed.startsWith('{')) {
        isInImagePrompt = trimmed.includes('"prompt"');
        isInMotionPrompt = trimmed.includes('"motion"') || trimmed.includes('Motion');
        isInCopy = trimmed.includes('"copy"');
        jsonBuffer = line;
        
        if (trimmed.endsWith('}')) {
          // 한 줄 JSON
          try {
            const parsed = JSON.parse(trimmed);
            if (currentScene) {
              if (parsed.prompt) currentScene.image_prompt = parsed.prompt;
              if (parsed.motion || parsed.motionPrompt) currentScene.motion_prompt = parsed.motion || parsed.motionPrompt;
              if (parsed.copy) currentScene.copy = parsed.copy;
            }
          } catch (e) {
            console.warn('[parseMultiConceptJSON] 한 줄 JSON 파싱 실패:', e.message);
          }
          isInImagePrompt = isInMotionPrompt = isInCopy = false;
          jsonBuffer = '';
        }
        continue;
      }

      // 멀티라인 JSON 처리
      if ((isInImagePrompt || isInMotionPrompt || isInCopy) && jsonBuffer) {
        jsonBuffer += '\n' + line;
        
        if (trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(jsonBuffer);
            if (currentScene) {
              if (parsed.prompt) currentScene.image_prompt = parsed.prompt;
              if (parsed.motion || parsed.motionPrompt) currentScene.motion_prompt = parsed.motion || parsed.motionPrompt;
              if (parsed.copy) currentScene.copy = parsed.copy;
            }
          } catch (e) {
            console.warn('[parseMultiConceptJSON] 멀티라인 JSON 파싱 실패:', e.message);
          }
          isInImagePrompt = isInMotionPrompt = isInCopy = false;
          jsonBuffer = '';
        }
        continue;
      }
    }

    // 마지막 컨셉과 씬 추가
    if (currentScene && currentConcept) currentConcept.scenes.push(currentScene);
    if (currentConcept) concepts.push(currentConcept);

    if (concepts.length > 0) {
      console.log(`[parseMultiConceptJSON] 수동 파싱 성공: ${concepts.length}개 컨셉`);
      return { concepts };
    }

    throw new Error('컨셉을 찾을 수 없음');

  } catch (error) {
    console.error('[parseMultiConceptJSON] 전체 파싱 실패:', error.message);
    return null;
  }
}

// 🔥 스타일 구성 (완전 복구)
function buildStylesFromConceptJson(mcJson, sceneCount, compositingScenes, formData) {
  const styles = [];

  mcJson.concepts.forEach((concept, conceptIndex) => {
    const conceptId = conceptIndex + 1;
    
    // 이미지 프롬프트 구성
    const imagePrompts = [];
    
    if (concept.scenes && Array.isArray(concept.scenes)) {
      concept.scenes.forEach((scene, sceneIndex) => {
        const sceneNumber = scene.scene_number || (sceneIndex + 1);
        
        // 합성 컨텍스트 결정
        const isCompositingScene = compositingScenes.some(cs => cs.sceneNumber === sceneNumber);
        const compositingContext = isCompositingScene ? 
          `[PRODUCT COMPOSITING SCENE] ${scene.image_prompt}` : 
          scene.image_prompt;

        imagePrompts.push({
          sceneNumber: sceneNumber,
          title: `Scene ${sceneNumber}`,
          duration: 2,
          prompt: scene.image_prompt || `${concept.name} scene ${sceneNumber}. Insanely detailed, hyper-realistic, 8K, sharp focus, cinematic lighting.`,
          negative_prompt: "blurry, low quality, watermark, logo, text, cartoon, distorted",
          styling: { style: "photo", color: "color", lighting: "natural" },
          size: mapAspectRatio(formData.aspectRatio || 'widescreen_16_9'),
          width: getWidthFromAspectRatio(mapAspectRatio(formData.aspectRatio || 'widescreen_16_9')),
          height: getHeightFromAspectRatio(mapAspectRatio(formData.aspectRatio || 'widescreen_16_9')),
          guidance_scale: 7.5,
          seed: Math.floor(10000 + Math.random() * 90000),
          filter_nsfw: true,
          motion_prompt: scene.motion_prompt || "Subtle camera drift, slow and elegant movement.",
          copy: scene.copy || `씬 ${sceneNumber}`,
          timecode: `00:${String((sceneNumber-1)*2).padStart(2,'0')}-00:${String(sceneNumber*2).padStart(2,'0')}`,
          compositingContext: compositingContext,
          isCompositing: isCompositingScene,
          compositingInfo: isCompositingScene ? {
            compositingContext: compositingScenes.find(cs => cs.sceneNumber === sceneNumber)?.context || '[PRODUCT COMPOSITING SCENE]',
            explicit: compositingScenes.find(cs => cs.sceneNumber === sceneNumber)?.explicit || false,
            videoPurpose: formData.videoPurpose
          } : null
        });
      });
    }

    const styleFromName = getStyleFromConceptName(concept.name);
    
    styles.push({
      id: conceptId,
      concept_id: conceptId,
      conceptId: conceptId,
      conceptName: concept.name,
      style: concept.style || styleFromName,
      headline: `${concept.name} 헤드라인`,
      description: `${formData.videoPurpose} 광고를 위한 ${concept.name} 접근법`,
      copy: concept.scenes?.[0]?.copy || null,
      imagePrompts: imagePrompts,
      images: [],
      metadata: {
        videoPurpose: formData.videoPurpose,
        conceptType: concept.name,
        sceneCount: sceneCount
      }
    });
  });

  console.log(`[buildStylesFromConceptJson] 구성된 스타일: ${styles.length}개`);
  return styles;
}

// 컨셉명에서 스타일 매핑
function getStyleFromConceptName(conceptName) {
  const styleMap = {
    '욕망의 시각화': 'Dreamy Ethereal Photography',
    '이질적 조합의 미학': 'Modern Surrealist Photography',
    '핵심 가치의 극대화': 'Dynamic Action Photography',
    '기회비용의 시각화': 'Gritty Cinematic Realism',
    '트렌드 융합': 'Vibrant Candid Flash Photography',
    '파격적 반전': 'Dramatic Film Noir Still'
  };

  for (const [key, style] of Object.entries(styleMap)) {
    if (conceptName?.includes(key)) {
      return style;
    }
  }

  return 'Commercial Photography';
}

// 합성 정보 분석 (imageRef 사용)
function analyzeCompositingInfo(formData, compositingScenes) {
  return {
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

// 🔥 메인 핸들러 함수 (완전 복구)
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
      imageRef = null, // 🔥 imageRef로 통합
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
    if (mcJson && Array.isArray(mcJson.concepts) && mcJson.concepts.length === 6) {
      // 🔥 합성 정보 포함하여 styles 구성
      styles = buildStylesFromConceptJson(mcJson, sceneCountPerConcept, compositingScenes, req.body);
      console.log(`[storyboard-init] ✅ 스타일 구성 완료: ${styles.length}개`);
      console.log('[storyboard-init] ✅ multi-concept JSON 파싱 성공 (6 concepts)');
    } else {
      console.warn('[storyboard-init] ⚠️ multi-concept JSON 파싱 실패 → 기본 구조 생성');

      // 🔥 기본 구조 생성 (복구)
      const defaultConcepts = [
        { concept_name: '욕망의 시각화', style: 'Dreamy Ethereal Photography' },
        { concept_name: '이질적 조합의 미학', style: 'Modern Surrealist Photography' },
        { concept_name: '핵심 가치의 극대화', style: 'Dynamic Action Photography' },
        { concept_name: '기회비용의 시각화', style: 'Gritty Cinematic Realism' },
        { concept_name: '트렌드 융합', style: 'Vibrant Candid Flash Photography' },
        { concept_name: '파격적 반전', style: 'Dramatic Film Noir Still' }
      ];

      styles = defaultConcepts.map((concept, index) => {
        const imagePrompts = [];
        for (let i = 1; i <= sceneCountPerConcept; i++) {
          const isCompositingScene = compositingScenes.some(cs => cs.sceneNumber === i);
          imagePrompts.push({
            sceneNumber: i,
            title: `Scene ${i}`,
            duration: 2,
            prompt: `${concept.concept_name} placeholder scene ${i}. Insanely detailed, hyper-realistic, 8K, sharp focus, cinematic lighting. Shot by ARRI Alexa Mini with a 50mm lens.`,
            negative_prompt: "blurry, low quality, watermark, logo, text, cartoon, distorted",
            styling: { style: "photo", color: "color", lighting: "natural" },
            size: mapAspectRatio(req.body.aspectRatio || 'widescreen_16_9'),
            width: getWidthFromAspectRatio(mapAspectRatio(req.body.aspectRatio || 'widescreen_16_9')),
            height: getHeightFromAspectRatio(mapAspectRatio(req.body.aspectRatio || 'widescreen_16_9')),
            guidance_scale: 7.5,
            seed: Math.floor(10000 + Math.random() * 90000),
            filter_nsfw: true,
            motion_prompt: "Subtle camera drift, slow and elegant movement.",
            copy: `씬 ${i}`,
            timecode: `00:${String((i-1)*2).padStart(2,'0')}-00:${String(i*2).padStart(2,'0')}`,
            compositingContext: isCompositingScene ? 
              `[PRODUCT COMPOSITING SCENE] ${concept.concept_name} scene ${i}` : 
              `${concept.concept_name} scene ${i}`,
            // 🔥 합성 정보 추가
            isCompositing: isCompositingScene,
            compositingInfo: isCompositingScene ? {
              compositingContext: compositingScenes.find(cs => cs.sceneNumber === i)?.context || '[PRODUCT COMPOSITING SCENE]',
              explicit: compositingScenes.find(cs => cs.sceneNumber === i)?.explicit || false,
              videoPurpose: videoPurpose
            } : null
          });
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
      geminiModel: "gemini-2.5-pro",
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

    // 🔥 에러 타입별 처리 (복구)
    if (error.message.includes('API_KEY') || error.message.includes('GEMINI_API_KEY')) {
      errorResponse.error = 'Gemini API 키가 설정되지 않았습니다. 환경변수를 확인해주세요.';
      return res.status(500).json(errorResponse);
    }

    if (error.message.includes('quota') || error.message.includes('limit') || error.message.includes('429')) {
      errorResponse.error = 'API 사용량 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
      return res.status(429).json(errorResponse);
    }

    if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
      errorResponse.error = 'API 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
      return res.status(408).json(errorResponse);
    }

    return res.status(500).json(errorResponse);
  }
}

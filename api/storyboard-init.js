import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🔥 제품/서비스 프롬프트 파일 매핑
const PROMPT_FILE_MAPPING = {
  'step1_product': 'Prompt_step1_product.txt',
  'step1_service': 'Prompt_step1_service.txt',
  'step2_product': 'Prompt_step2_product.txt',
  'step2_service': 'Prompt_step2_service.txt'
};

// 🔥 API Key Pool (기존 고급 설정 유지)
const API_KEYS = process.env.GEMINI_API_KEY ?
  process.env.GEMINI_API_KEY.split(',').map(k => k.trim()) :
  [];

let keyIndex = 0;

function getNextApiKey() {
  if (API_KEYS.length === 0) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }
  const key = API_KEYS[keyIndex];
  keyIndex = (keyIndex + 1) % API_KEYS.length;
  console.log(`[storyboard-init][키풀] API 키 ${keyIndex + 1}/${API_KEYS.length} 사용`);
  return key;
}

// 🔥 안전한 Gemini 호출 (재시도 로직 포함)
async function safeCallGemini(prompt, options = {}) {
  const {
    label = 'gemini-call',
    maxRetries = 3,
    isImageComposition = false
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${label}] 시도 ${attempt}/${maxRetries}`);

      const apiKey = getNextApiKey();
      const tempGenAI = new GoogleGenerativeAI(apiKey);
      const model = tempGenAI.getGenerativeModel({
        model: "gemini-2.5-pro",
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        }
      });

      const result = await model.generateContent({
        contents: [{
          role: "user",
          parts: [{ text: prompt }]
        }]
      });

      if (!result.response) {
        throw new Error('Gemini API에서 응답을 받지 못했습니다.');
      }

      const responseText = result.response.text();

      if (!responseText) {
        throw new Error('Gemini API 응답이 비어있습니다.');
      }

      console.log(`[${label}] 성공 (${responseText.length} chars)`);
      return { text: responseText };

    } catch (error) {
      console.error(`[${label}] 시도 ${attempt} 실패:`, error.message);
      lastError = error;

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[${label}] ${delay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`${label} 최종 실패: ${lastError?.message || 'Unknown error'}`);
}

// 🔥 영상 길이별 씬 수 계산
function getSceneCount(videoLength) {
  const match = String(videoLength || '').match(/\d+/);
  if (!match) return 5;

  const seconds = parseInt(match[0], 10);
  if (seconds <= 10) return 5;
  if (seconds <= 20) return 10;
  if (seconds <= 30) return 15;
  return 5;
}

// 🔥 Seedream v4 지원 영상 비율 매핑
function mapAspectRatio(formData) {
  const aspectRatio = formData?.videoAspectRatio ||
    formData?.aspectRatio ||
    formData?.aspectRatioCode ||
    '가로 (16:9)';

  console.log(`[mapAspectRatio] 입력: "${aspectRatio}"`);

  const normalized = String(aspectRatio).toLowerCase().trim();

  if (normalized.includes('16:9') || normalized.includes('가로') || normalized.includes('widescreen')) {
    console.log('[mapAspectRatio] → widescreen_16_9');
    return 'widescreen_16_9';
  }

  if (normalized.includes('9:16') || normalized.includes('세로') || normalized.includes('vertical')) {
    console.log('[mapAspectRatio] → vertical_9_16');
    return 'vertical_9_16';
  }

  if (normalized.includes('1:1') || normalized.includes('정사각형') || normalized.includes('square')) {
    console.log('[mapAspectRatio] → square_1_1');
    return 'square_1_1';
  }

  if (normalized.includes('4:5') || normalized.includes('portrait')) {
    console.log('[mapAspectRatio] → portrait_4_5');
    return 'portrait_4_5';
  }

  console.log('[mapAspectRatio] 기본값: widescreen_16_9');
  return 'widescreen_16_9';
}

// 🔥 PRODUCT COMPOSITING SCENE 감지 (기존 로직 유지)
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

// 🔥 컨셉 블록 추출 (기존 로직 유지)
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
    // 실제 파싱 로직 (기존과 동일)
    const lines = phase1_output.split('\n');
    let currentConcept = null;

    for (const line of lines) {
      const conceptMatch = line.match(/컨셉:\s*(.+)/);
      if (conceptMatch) {
        const conceptName = conceptMatch[1].trim();
        const defaultMatch = defaultConcepts.find(dc =>
          conceptName.includes(dc.concept_name) || dc.concept_name.includes(conceptName)
        );

        if (defaultMatch) {
          currentConcept = {
            concept_name: defaultMatch.concept_name,
            style: defaultMatch.style,
            content: line
          };
          conceptBlocks.push(currentConcept);
        }
      } else if (currentConcept && line.trim()) {
        currentConcept.content += '\n' + line;
      }
    }
  } catch (error) {
    console.error('[extractConceptBlocks] 파싱 오류:', error);
  }

  // 부족한 컨셉은 기본값으로 채우기
  while (conceptBlocks.length < 6) {
    const defaultConcept = defaultConcepts[conceptBlocks.length];
    conceptBlocks.push({
      concept_name: defaultConcept.concept_name,
      style: defaultConcept.style,
      content: `${defaultConcept.concept_name} (기본 설정)`
    });
  }

  console.log(`[extractConceptBlocks] 추출된 컨셉: ${conceptBlocks.length}개`);
  return conceptBlocks.slice(0, 6);
}

// 🔥 STEP2 프롬프트 구성 (기존 로직 유지)
function buildFinalPrompt(phase1_output, conceptBlocks, formData, sceneCount) {
  const aspectRatio = mapAspectRatio(formData);

  return `
당신은 전문 비디오 디렉터이자 VFX 수퍼바이저입니다. 아래 스토리보드를 Seedream v4 API에 최적화된 JSON 형태로 변환해주세요.

=== INPUT ===
${phase1_output}

=== 출력 요구사항 ===
각 씬마다 다음 3개 JSON을 생성하세요:

1. Image Prompt (Seedream v4 호환):
{
  "prompt": "[7-part 구조의 상세 프롬프트]",
  "negative_prompt": "blurry, low quality, watermark, logo, text, cartoon, distorted",
  "num_images": 1,
  "size": "${aspectRatio}",
  "width": ${getWidthFromAspectRatio(aspectRatio)},
  "height": ${getHeightFromAspectRatio(aspectRatio)},
  "styling": {
    "style": "photo",
    "color": "color",
    "lighting": "natural"
  },
  "guidance_scale": 7.5,
  "seed": [랜덤 5자리 숫자],
  "filter_nsfw": true
}

2. Motion Prompt:
{
  "prompt": "[자연스럽고 우아한 카메라 움직임 설명]"
}

3. Scene Copy (한국어):
{
  "copy": "[씬의 메시지를 강화하는 15자 내외 카피]"
}

=== 중요 규칙 ===
- 각 컨셉마다 ${sceneCount}개 씬 생성
- [PRODUCT COMPOSITING SCENE] 표시된 씬은 제품 합성용
- 모든 움직임은 slow, elegant, subtle하게
- 텍스트나 로고 생성 금지

총 6개 컨셉 × ${sceneCount}씬 = ${6 * sceneCount}개 씬의 JSON을 생성하세요.
`;
}

// 🔥 해상도 매핑 함수들
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

// 🔥 멀티 컨셉 JSON 파싱 (기존 로직 유지)
function parseMultiConceptJSON(responseText) {
  try {
    // JSON 추출 시도
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // 수동 파싱 로직
    const concepts = [];
    const lines = responseText.split('\n');

    let currentConcept = null;
    let currentScene = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // 컨셉 시작 감지
      if (trimmed.includes('컨셉:') || trimmed.includes('Concept:')) {
        if (currentConcept) concepts.push(currentConcept);
        currentConcept = {
          name: trimmed,
          scenes: []
        };
        continue;
      }

      // 씬 시작 감지
      const sceneMatch = trimmed.match(/S#(\d+)|Scene\s+(\d+)/i);
      if (sceneMatch && currentConcept) {
        if (currentScene) currentConcept.scenes.push(currentScene);
        currentScene = {
          sceneNumber: parseInt(sceneMatch[1] || sceneMatch[2], 10),
          imagePrompt: null,
          motionPrompt: null,
          copy: null
        };
        continue;
      }

      // JSON 블록 감지
      if (trimmed.startsWith('{') && currentScene) {
        try {
          const jsonEnd = responseText.indexOf('}', responseText.indexOf(trimmed)) + 1;
          const jsonStart = responseText.indexOf(trimmed);
          const jsonStr = responseText.substring(jsonStart, jsonEnd);
          const parsed = JSON.parse(jsonStr);

          if (parsed.prompt) {
            currentScene.imagePrompt = parsed;
          } else if (parsed.copy) {
            currentScene.copy = parsed;
          } else {
            currentScene.motionPrompt = parsed;
          }
        } catch (parseError) {
          console.warn('[parseMultiConceptJSON] JSON 블록 파싱 실패:', parseError);
        }
      }
    }

    // 마지막 항목들 추가
    if (currentScene && currentConcept) currentConcept.scenes.push(currentScene);
    if (currentConcept) concepts.push(currentConcept);

    return { concepts };

  } catch (error) {
    console.error('[parseMultiConceptJSON] 전체 파싱 실패:', error);
    return null;
  }
}

// 🔥 컨셉 JSON에서 스타일 구성 (기존 로직 유지 + 합성 정보 추가)
function buildStylesFromConceptJson(mcJson, sceneCount, compositingScenes, formData) {
  const styles = [];

  mcJson.concepts.forEach((concept, index) => {
    const imagePrompts = [];

    // 각 씬에 대한 프롬프트 생성
    for (let i = 1; i <= sceneCount; i++) {
      const sceneData = concept.scenes?.find(s => s.sceneNumber === i);
      const isCompositingScene = compositingScenes.some(cs => cs.sceneNumber === i);

      const prompt = {
        sceneNumber: i,
        title: `Scene ${i}`,
        duration: 2,
        prompt: sceneData?.imagePrompt?.prompt || `${concept.name} scene ${i}. Insanely detailed, hyper-realistic, 8K, sharp focus, cinematic lighting. Shot by ARRI Alexa Mini with a 50mm lens.`,
        negative_prompt: "blurry, low quality, watermark, logo, text, cartoon, distorted",
        styling: { style: "photo", color: "color", lighting: "natural" },
        size: mapAspectRatio(formData),
        width: getWidthFromAspectRatio(mapAspectRatio(formData)),
        height: getHeightFromAspectRatio(mapAspectRatio(formData)),
        guidance_scale: 7.5,
        seed: Math.floor(10000 + Math.random() * 90000),
        filter_nsfw: true,
        motion_prompt: sceneData?.motionPrompt?.prompt || "Subtle camera drift, slow and elegant movement.",
        // 🔥 수정: copy 필드 올바른 추출
        copy: sceneData?.copy?.copy || sceneData?.copy || `씬 ${i}`, // copy.copy 또는 copy 직접 사용
        timecode: `00:${String((i-1)*2).padStart(2,'0')}-00:${String(i*2).padStart(2,'0')}`,
        // 🔥 합성 정보 추가
        isCompositingScene: isCompositingScene,
        compositingInfo: isCompositingScene ? {
          compositingContext: compositingScenes.find(cs => cs.sceneNumber === i)?.context || '[PRODUCT COMPOSITING SCENE]',
          explicit: compositingScenes.find(cs => cs.sceneNumber === i)?.explicit || false,
          videoPurpose: formData.videoPurpose
        } : null
      };

      imagePrompts.push(prompt);
    }

    styles.push({
      id: index + 1,
      concept_id: index + 1,
      conceptName: concept.name || `컨셉 ${index + 1}`,
      style: getStyleFromConceptName(concept.name) || 'Commercial Photography',
      headline: `${concept.name} 헤드라인`,
      description: `${formData.videoPurpose} 광고를 위한 ${concept.name} 접근법`,
      // 🔥 추가: 컨셉별 헤드라인 추출 (첫 번째 씬의 copy 또는 concept.headline 사용)
      conceptHeadline: concept.headline || concept.scenes?.[0]?.copy?.copy || concept.scenes?.[0]?.copy || null,
      imagePrompts: imagePrompts,
      images: [], // 이미지 생성 시 채워질 배열
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

// 🔥 컨셉명에서 스타일 매핑
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

// 🔥 합성 정보 분석 (변수 변경사항 반영: imageRef로 통합)
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

// 🔥 메인 핸들러 함수
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
      // brandLogo = null, // 제거
      // productImage = null, // 제거
      imageRef = null, // 🔥 imageRef로 통합
      aspectRatioCode = 'widescreen_16_9',
      promptType = 'step1_product' // 🔥 새로 추가된 필드
    } = req.body;

    console.log(`[storyboard-init] 🚀 시작: ${brandName} - ${videoPurpose} (프롬프트: ${promptType})`);
    console.log(`[storyboard-init] 요청 데이터:`, {
      brandName, videoPurpose, videoLength, promptType
    });

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

    // 🔥 프롬프트 파일 선택 및 로드
    const promptFileName = PROMPT_FILE_MAPPING[promptType];
    if (!promptFileName) {
      console.error(`[storyboard-init] 유효하지 않은 프롬프트 타입:`, promptType);
      return res.status(400).json({
        success: false,
        error: `유효하지 않은 프롬프트 타입: ${promptType}`
      });
    }

    const promptFilePath = path.join(process.cwd(), 'public', promptFileName);

    if (!fs.existsSync(promptFilePath)) {
      console.error(`[storyboard-init] 프롬프트 파일 없음:`, promptFilePath);
      return res.status(404).json({
        success: false,
        error: `프롬프트 파일을 찾을 수 없습니다: ${promptFileName}`
      });
    }

    console.log(`[storyboard-init] 📝 프롬프트 파일 로드: ${promptFileName}`);
    let promptTemplate = fs.readFileSync(promptFilePath, 'utf-8');

    // 🔥 변수 치환
    const variables = {
      brandName,
      industryCategory,
      productServiceCategory,
      productServiceName,
      videoPurpose,
      videoLength,
      coreTarget,
      coreDifferentiation,
      videoRequirements: videoRequirements || '특별한 요구사항 없음',
      // brandLogo: brandLogo ? '업로드됨' : '업로드 안됨', // 제거
      // productImage: productImage ? '업로드됨' : '업로드 안됨', // 제거
      imageRef: imageRef ? '업로드됨' : '업로드 안됨', // 🔥 imageRef만 사용
      aspectRatioCode
    };

    // 프롬프트 템플릿에서 변수 치환
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      promptTemplate = promptTemplate.replace(new RegExp(placeholder, 'g'), value);
    }

    console.log(`[storyboard-init] ✅ 변수 치환 완료 (${Object.keys(variables).length}개 변수)`);
    console.log(`[storyboard-init] 최종 프롬프트 길이: ${promptTemplate.length} chars`);

    // 🔥 STEP1: Gemini API 호출
    console.log(`[storyboard-init] 📡 STEP1 Gemini API 호출 시작`);
    const step1 = await safeCallGemini(promptTemplate, {
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

    // 🔥 STEP2: 상세 JSON 생성
    const step2Prompt = buildFinalPrompt(phase1_output, conceptBlocks, req.body, sceneCountPerConcept);
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
      console.log('[storyboard-init] ✅ multi-concept JSON 파싱 성공 (6 concepts)');
    } else {
      console.warn('[storyboard-init] ⚠️ multi-concept JSON 파싱 실패 → 기본 구조 생성');

      // 기본 구조 생성
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
            size: mapAspectRatio(req.body),
            width: getWidthFromAspectRatio(mapAspectRatio(req.body)),
            height: getHeightFromAspectRatio(mapAspectRatio(req.body)),
            guidance_scale: 7.5,
            seed: Math.floor(10000 + Math.random() * 90000),
            filter_nsfw: true,
            motion_prompt: "Subtle camera drift, slow and elegant movement.",
            copy: `씬 ${i}`,
            timecode: `00:${String((i-1)*2).padStart(2,'0')}-00:${String(i*2).padStart(2,'0')}`,
            // 🔥 합성 정보 추가
            isCompositingScene: isCompositingScene,
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
          conceptName: concept.concept_name,
          style: concept.style,
          headline: `${concept.concept_name} 헤드라인`,
          description: `${videoPurpose} 광고를 위한 ${concept.concept_name} 접근법`,
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

    // 🔥 합성 정보 분석
    const compositingInfo = analyzeCompositingInfo(req.body, compositingScenes);
    console.log('[storyboard-init] 🔥 합성 정보:', compositingInfo);

    // 🔥 메타데이터 생성
    const metadata = {
      promptType,
      promptFile: promptFileName,
      videoPurpose,
      videoLength,
      sceneCountPerConcept,
      aspectRatio: mapAspectRatio(req.body),
      generatedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
      geminiModel: "gemini-2.5-pro",
      keyPoolSize: API_KEYS.length,
      step1Length: phase1_output.length,
      step2Length: step2.text.length
    };

    // 🔥 최종 응답 데이터
    const responseData = {
      success: true,
      styles,
      metadata,
      compositingInfo,
      rawStep1Response: phase1_output,
      rawStep2Response: step2.text,
      processingTime: Date.now() - startTime,
      debugInfo: {
        promptType,
        promptFile: promptFileName,
        variablesReplaced: Object.keys(variables).length,
        conceptsParsed: mcJson?.concepts?.length || 0,
        compositingScenes: compositingScenes.length,
        totalScenes: styles.length * sceneCountPerConcept
      }
    };

    console.log(`[storyboard-init] 🎉 성공 완료:`, {
      styles: styles.length,
      totalScenes: styles.length * sceneCountPerConcept,
      compositingScenes: compositingScenes.length,
      processingTime: `${Date.now() - startTime}ms`
    });

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('[storyboard-init] ❌ 전체 오류:', error);

    const errorResponse = {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      debugInfo: {
        promptType: req.body?.promptType,
        videoPurpose: req.body?.videoPurpose,
        keyPoolSize: API_KEYS.length
      }
    };

    if (error.message.includes('API_KEY')) {
      errorResponse.error = 'Gemini API 키가 설정되지 않았습니다.';
      return res.status(500).json(errorResponse);
    }

    if (error.message.includes('quota') || error.message.includes('limit')) {
      errorResponse.error = 'API 사용량 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
      return res.status(429).json(errorResponse);
    }

    return res.status(500).json(errorResponse);
  }
}

import { GoogleGenerativeAI } from '@google/generative-ai';

// CORS 공통 유틸
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-freepik-api-key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { formData } = req.body || {};
    if (!formData) return res.status(400).json({ error: 'Form data is required' });

    // Gemini API 초기화 (원본과 동일 키 탐색)
    const geminiApiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!geminiApiKey) throw new Error('Gemini API key not found');

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // 1~3단계 수행 (원본과 동일 로직/재시도 패턴)
    const creativeBrief = await generateCreativeBrief(model, formData);
    const storyboardConcepts = await generateStoryboardConcepts(model, creativeBrief, formData);
    const imagePrompts = await generateImagePrompts(model, storyboardConcepts, formData);

    // 원본 styles를 그대로 복제
    const styles = [
      { name: 'Cinematic Professional', description: 'cinematic professional shot dramatic lighting high detail 8k corporate', colorPalette: '#1a365d,#2d3748,#4a5568,#e2e8f0' },
      { name: 'Modern Minimalist',      description: 'minimalist modern clean background simple composition contemporary',   colorPalette: '#ffffff,#f7fafc,#e2e8f0,#cbd5e0' },
      { name: 'Vibrant Dynamic',        description: 'vibrant energetic dynamic motion bright colors active lifestyle',     colorPalette: '#e53e3e,#dd6b20,#d69e2e,#38a169' },
      { name: 'Natural Lifestyle',      description: 'natural lifestyle photorealistic everyday life authentic people',     colorPalette: '#38a169,#68d391,#9ae6b4,#c6f6d5' },
      { name: 'Premium Luxury',         description: 'luxury premium elegant sophisticated high-end exclusive',             colorPalette: '#744210,#a0845c,#d6b573,#f7e6a3' },
      { name: 'Tech Innovation',        description: 'technology innovation futuristic digital modern tech startup',        colorPalette: '#2b6cb0,#3182ce,#4299e1,#63b3ed' }
    ];

    // 원본 lengthMap과 동일 규칙으로 imageCount 계산
    const imageCount = getImageCountByVideoLength(formData.videoLength);

    res.status(200).json({
      success: true,
      creativeBrief,
      storyboardConcepts,
      imagePrompts,   // 전체 프롬프트 (클라이언트에서 0..imageCount-1 만큼 사용)
      styles,         // 서버에서 finalPrompt 합성시 필요
      metadata: {
        brandName: formData.brandName,
        videoLength: formData.videoLength,
        videoPurpose: formData.videoPurpose,
        createdAt: new Date().toISOString(),
        totalStyles: styles.length,
        geminiModel: 'gemini-2.5-flash',
        processSteps: 3,
        imageCountPerStyle: imageCount
      }
    });

  } catch (error) {
    console.error('storyboard-init 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 원본과 동일: 영상 길이에 따른 이미지 수 계산
 */
function getImageCountByVideoLength(videoLength) {
  const lengthMap = {
    '10초': 5,
    '30초': 15,
    '60초': 30
  };
  return lengthMap[videoLength] || 15;
}

/**
 * 1단계: 원본 로직을 동일하게 복제(프롬프트/재시도 패턴 동일)
 */
async function generateCreativeBrief(model, formData) {
  try {
    const inputPromptTemplate = `당신은 업계 최상위 크리에이티브 디렉터(Creative Director)이자 브랜드 전략가(Brand Strategist)입니다. 사용자가 제공하는 핵심 정보에 기반해, 브랜드 목적과 타깃에 최적화된 광고 전략과 메시지를 설계하세요.

다음 정보를 기반으로 6장면의 스토리보드와 각 장면별 이미지 생성을 위한 구체적인 지침을 작성하세요:

{USER_INPUT}

각 장면별로 다음을 포함해야 합니다:
1. 장면 제목과 설명
2. 이미지 생성을 위한 구체적인 프롬프트
3. 장면 지속 시간
4. 시각적 요소 (색상, 구도, 분위기)
5. 텍스트 오버레이 내용

결과는 다음 단계에서 활용할 수 있는 형태로 제공해주세요.`;

    const userInputString = `
브랜드명: ${formData.brandName}
산업 카테고리: ${formData.industryCategory}
제품/서비스 카테고리: ${formData.productServiceCategory}
제품/서비스명: ${formData.productServiceName || '일반'}
영상 목적: ${formData.videoPurpose}
영상 길이: ${formData.videoLength}
핵심 타겟: ${formData.coreTarget}
핵심 차별점: ${formData.coreDifferentiation}
영상 요구사항: ${formData.videoRequirements || '없음'}
브랜드 로고: ${formData.brandLogo ? '업로드됨 - 영상에 포함 필요' : '없음'}
제품 이미지: ${formData.productImage ? '업로드됨 - 영상에 포함 필요' : '없음'}
    `;
    const finalPrompt = inputPromptTemplate.replace('{USER_INPUT}', userInputString.trim());

    let creativeBrief = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !creativeBrief) {
      try {
        attempts++;
        console.log(`1단계 Gemini API 시도 ${attempts}/${maxAttempts}...`);
        const result = await model.generateContent(finalPrompt);
        creativeBrief = result.response.text();
        console.log('1단계: 크리에이티브 브리프 생성 완료');
        break;
      } catch (geminiError) {
        console.error(`1단계 Gemini API 시도 ${attempts} 실패:`, geminiError.message);
        if (geminiError.status === 503 || (geminiError.message || '').includes('overloaded')) {
          if (attempts < maxAttempts) {
            const delay = Math.pow(2, attempts) * 1000;
            console.log(`모델 과부하 감지, ${delay/1000}초 후 재시도...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        if (attempts >= maxAttempts) {
          throw new Error('1단계: 크리에이티브 브리프 생성 실패 - Gemini API 최대 재시도 초과');
        }
      }
    }
    return creativeBrief;
  } catch (error) {
    console.error('1단계 크리에이티브 브리프 생성 오류:', error);
    throw new Error(`1단계 실패: ${error.message}`);
  }
}

/**
 * 2단계: 원본 로직 복제
 */
async function generateStoryboardConcepts(model, creativeBrief, formData) {
  try {
    const secondPromptTemplate = `당신은 최고 수준의 광고 영상 스토리보드 기획 전문가입니다. 사용자의 요청을 분석하여 최신 트렌드와 바이럴 요소까지 반영한 6가지 고정 컨셉의 스토리보드를 작성하세요.

컨셉 기획 및 스토리보드 작성 프로세스:
- 컨셉 1: 욕망의 시각화
- 컨셉 2: 이질적 조합의 미학
- 컨셉 3: 핵심 가치의 극대화
- 컨셉 4: 기회비용의 시각화
- 컨셉 5: 트렌드 융합
- 컨셉 6: 파격적 반전

출력 구조:
# [입력된 브랜드/상황] 광고 영상 스토리보드 기획안
---
## 1. 컨셉 기획 (총 6가지)
### **[컨셉명]**
- **테마**: [주제/테마 설명]
- **스토리라인**: [시작 - 전개 - 클라이맥스 - 결론]
- **타겟 오디언스**: [타겟 연령, 특징, 니즈]
- **감정/시각적 요소**: [강조할 감정 및 시각적 포인트]
- **설명**: [전략 설명. 200~400자]
- **참고 자료**: [데이터 소스]
---
## 2. 스토리보드 (총 6가지)
### **[컨셉명] (XX초, XX장면)**
- **장면 1 (0:00-0:02)**: [...]
- **장면 2 (0:02-0:04)**: [...]
**음향/음악**: [...]`;

    const combinedPrompt = `
다음은 1단계에서 생성된 ${formData.brandName}의 크리에이티브 브리프입니다:

${creativeBrief}

---

이제 위의 크리에이티브 브리프를 바탕으로 아래 지침에 따라 스토리보드를 생성해주세요:

${secondPromptTemplate}

브랜드/상황: ${formData.brandName} (${formData.industryCategory})
영상 길이: ${formData.videoLength}
`;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`2단계 Gemini API 시도 ${attempts}/${maxAttempts}...`);
        const result = await model.generateContent(combinedPrompt);
        const storyboardConcepts = result.response.text();
        console.log('2단계: 스토리보드 컨셉 생성 완료');
        return storyboardConcepts;
      } catch (geminiError) {
        console.error(`2단계 Gemini API 시도 ${attempts} 실패:`, geminiError.message);
        if (geminiError.status === 503 || (geminiError.message || '').includes('overloaded')) {
          if (attempts < maxAttempts) {
            const delay = Math.pow(2, attempts) * 1000;
            console.log(`모델 과부하 감지, ${delay/1000}초 후 재시도...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        if (attempts >= maxAttempts) {
          throw new Error('2단계: 스토리보드 컨셉 생성 실패 - Gemini API 최대 재시도 초과');
        }
      }
    }
  } catch (error) {
    console.error('2단계 스토리보드 컨셉 생성 오류:', error);
    throw new Error(`2단계 실패: ${error.message}`);
  }
}

/**
 * 3단계: 원본 로직 복제 (프롬프트 추출 로직 동일)
 */
async function generateImagePrompts(model, storyboardConcepts, formData) {
  try {
    const thirdPromptTemplate = `Role: You are an expert video director and VFX supervisor specializing in creating high-quality, professional video ads. Generate detailed image prompts for each scene that can be consumed by a text-to-image API.

### Output Requirements
For each scene, provide:
- **Image Prompt** (70-100 words, English) including camera/lens, composition, mise-en-scène with pose/direction/orientation, micro-detail keywords, lighting/time, color palette, style/tone, quality flags.

### Output Format
##Storyboard Image Prompts
### Scene 1 (0:00-0:02)
- **Image Prompt**: [...]
### Scene 2 (0:02-0:04)
- **Image Prompt**: [...]
Continue for all scenes...`;

    const combinedPrompt = `
다음은 2단계에서 생성된 ${formData.brandName}의 스토리보드 컨셉입니다:

${storyboardConcepts}

---

이제 위의 스토리보드를 바탕으로 아래 지침에 따라 Freepik API용 이미지 프롬프트를 생성해주세요:

${thirdPromptTemplate}

Brand/Product Context: ${formData.brandName} - ${formData.industryCategory} - ${formData.productServiceCategory}
Video Length: ${formData.videoLength}
Target Audience: ${formData.coreTarget}
Key Differentiation: ${formData.coreDifferentiation}
`;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`3단계 Gemini API 시도 ${attempts}/${maxAttempts}...`);
        const result = await model.generateContent(combinedPrompt);
        const imagePromptsText = result.response.text();
        console.log('3단계: Freepik용 이미지 프롬프트 생성 완료');
        const extractedPrompts = extractImagePromptsFromResponse(imagePromptsText);
        return extractedPrompts;
      } catch (geminiError) {
        console.error(`3단계 Gemini API 시도 ${attempts} 실패:`, geminiError.message);
        if (geminiError.status === 503 || (geminiError.message || '').includes('overloaded')) {
          if (attempts < maxAttempts) {
            const delay = Math.pow(2, attempts) * 1000;
            console.log(`모델 과부하 감지, ${delay/1000}초 후 재시도...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        if (attempts >= maxAttempts) {
          throw new Error('3단계: 이미지 프롬프트 생성 실패 - Gemini API 최대 재시도 초과');
        }
      }
    }
  } catch (error) {
    console.error('3단계 이미지 프롬프트 생성 오류:', error);
    throw new Error(`3단계 실패: ${error.message}`);
  }
}

// 원본과 동일한 패턴으로 이미지 프롬프트 추출
function extractImagePromptsFromResponse(responseText) {
  const prompts = [];
  const promptPattern = /\*\*Image Prompt\*\*:(.+?)(?=###|$)/gs;
  const matches = responseText.match(promptPattern);
  if (matches && matches.length > 0) {
    matches.forEach((match, index) => {
      const cleanPrompt = match.replace(/\*\*Image Prompt\*\*:/g, '').replace(/\*\*/g, '').trim();
      if (cleanPrompt.length > 50) {
        prompts.push({ sceneNumber: index + 1, prompt: cleanPrompt, title: `Scene ${index + 1}`, duration: 6 });
      }
    });
  }
  if (prompts.length === 0) {
    console.warn('Gemini 응답에서 이미지 프롬프트를 추출할 수 없어 기본 프롬프트 사용');
    return generateFallbackImagePrompts();
  }
  console.log(`${prompts.length}개의 이미지 프롬프트 추출 완료`);
  return prompts;
}

function generateFallbackImagePrompts() {
  return [
    { sceneNumber: 1, prompt: "professional commercial photography, brand introduction scene, high quality, cinematic lighting, 16:9 aspect ratio", title: "Scene 1", duration: 6 },
    { sceneNumber: 2, prompt: "professional product showcase, commercial photography, clean background, studio lighting, high detail, 16:9 aspect ratio", title: "Scene 2", duration: 6 },
    { sceneNumber: 3, prompt: "lifestyle photography, people using product, natural lighting, authentic moment, commercial style, 16:9 aspect ratio", title: "Scene 3", duration: 6 },
    { sceneNumber: 4, prompt: "close-up product detail, macro photography, professional lighting, high resolution, commercial quality, 16:9 aspect ratio", title: "Scene 4", duration: 6 },
    { sceneNumber: 5, prompt: "customer satisfaction scene, happy people, positive emotions, lifestyle photography, commercial style, 16:9 aspect ratio", title: "Scene 5", duration: 6 },
    { sceneNumber: 6, prompt: "brand logo finale, professional branding, clean design, corporate style, call to action, 16:9 aspect ratio", title: "Scene 6", duration: 6 }
  ];
}

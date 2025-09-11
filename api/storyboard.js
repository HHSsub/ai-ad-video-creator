import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { formData } = req.body;

    if (!formData) {
      return res.status(400).json({ error: 'Form data is required' });
    }

    console.log('3단계 연쇄 프롬프팅 시작:', {
      brandName: formData.brandName,
      industryCategory: formData.industryCategory,
      videoPurpose: formData.videoPurpose,
      videoLength: formData.videoLength
    });

    // Gemini API 초기화
    const geminiApiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!geminiApiKey) {
      throw new Error('Gemini API key not found');
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    // Freepik API 키 확인
    const freepikApiKey = process.env.FREEPIK_API_KEY || 
                          process.env.REACT_APP_FREEPIK_API_KEY || 
                          process.env.VITE_FREEPIK_API_KEY;

    if (!freepikApiKey) {
      throw new Error('Freepik API key not found');
    }

    // 1단계: 크리에이티브 브리프 생성 (내장 프롬프트 사용)
    console.log('1단계: 크리에이티브 브리프 생성 중...');
    const creativeBrief = await generateCreativeBrief(model, formData);

    // 2단계: 스토리보드 컨셉 생성 (내장 프롬프트 사용)
    console.log('2단계: 스토리보드 컨셉 생성 중...');
    const storyboardConcepts = await generateStoryboardConcepts(model, creativeBrief, formData);

    // 3단계: Freepik용 이미지 프롬프트 생성 (내장 프롬프트 사용)
    console.log('3단계: Freepik용 이미지 프롬프트 생성 중...');
    const imagePrompts = await generateImagePrompts(model, storyboardConcepts, formData);

    // 4단계: Freepik API로 실제 이미지 생성
    console.log('4단계: Freepik API로 이미지 생성 중...');
    const storyboardResults = await generateImagesWithFreepik(imagePrompts, freepikApiKey, formData);

    const response = {
      success: true,
      creativeBrief: creativeBrief,
      storyboardConcepts: storyboardConcepts,
      imagePrompts: imagePrompts,
      storyboard: storyboardResults,
      metadata: {
        brandName: formData.brandName,
        videoLength: formData.videoLength,
        videoPurpose: formData.videoPurpose,
        createdAt: new Date().toISOString(),
        totalStyles: storyboardResults.length,
        successCount: storyboardResults.filter(s => s.status === 'success').length,
        fallbackCount: storyboardResults.filter(s => s.status === 'fallback').length,
        geminiModel: 'gemini-2.5-flash-lite',
        processSteps: 4
      }
    };

    console.log('3단계 연쇄 프롬프팅 완료:', {
      creativeBriefLength: creativeBrief.length,
      conceptsGenerated: 6,
      imagePromptsGenerated: imagePrompts.length,
      finalImages: storyboardResults.length
    });

    res.status(200).json(response);

  } catch (error) {
    console.error('3단계 연쇄 프롬프팅 중 전체 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * 1단계: 내장 프롬프트를 활용한 크리에이티브 브리프 생성 (파일 읽기 없음)
 */
async function generateCreativeBrief(model, formData) {
  try {
    // Vercel 환경에서 파일 읽기 대신 내장 프롬프트 사용
    const inputPromptTemplate = `당신은 업계 최상위 크리에이티브 디렉터(Creative Director)이자 브랜드 전략가(Brand Strategist)입니다. 사용자가 제공하는 핵심 정보를 바탕으로 즉시 실행 가능한 수준의 광고 영상 전략 및 크리에이티브 브리프를 생성해야 합니다.

다음 정보를 기반으로 6장면의 스토리보드와 각 장면별 이미지 생성을 위한 구체적인 지침을 작성하세요:

{USER_INPUT}

각 장면별로 다음을 포함해야 합니다:
1. 장면 제목과 설명
2. 이미지 생성을 위한 구체적인 프롬프트
3. 장면 지속 시간
4. 시각적 요소 (색상, 구도, 분위기)
5. 텍스트 오버레이 내용

결과는 다음 단계에서 활용할 수 있는 형태로 제공해주세요.`;

    // 사용자 입력 데이터를 템플릿에 적용
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

    // Gemini API 호출 (재시도 로직 포함)
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
        
        if (geminiError.status === 503 || geminiError.message.includes('overloaded')) {
          if (attempts < maxAttempts) {
            const delay = Math.pow(2, attempts) * 1000;
            console.log(`모델 과부하 감지, ${delay/1000}초 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, delay));
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
 * 2단계: 내장 프롬프트를 활용한 스토리보드 컨셉 생성
 */
async function generateStoryboardConcepts(model, creativeBrief, formData) {
  try {
    // Vercel 환경에서 파일 읽기 대신 내장 프롬프트 사용
    const secondPromptTemplate = `당신은 최고 수준의 광고 영상 스토리보드 기획 전문가입니다. 사용자의 요청을 분석하여 웹 검색, 소셜 미디어(X, 인스타그램, 유튜브), 소비자 데이터, 시장 트렌드 등을 종합적으로 활용해 아래 6가지 고정 컨셉에 대한 기획 및 스토리보드를 작성합니다.

컨셉 기획 및 스토리보드 작성 프로세스:
아래 6가지 고정 컨셉 각각에 대해 기획 및 스토리보드를 작성합니다.
- 컨셉 1: 욕망의 시각화: 타겟 오디언스의 심리적 욕구(편리함, 럭셔리, 성공 등)를 분석해 이를 감각적이고 몰입감 높은 장면으로 구현.
- 컨셉 2: 이질적 조합의 미학: 브랜드 메시지와 관련 없는 이질적인 요소를 결합하여 신선한 충격과 주목도를 유발.
- 컨셉 3: 핵심 가치의 극대화: 브랜드의 핵심 강점(신선함, 친환경, 빠른 배송 등)을 시각적/감정적으로 과장하여 각인 효과를 극대화.
- 컨셉 4: 기회비용의 시각화: 제품/서비스를 사용하지 않았을 때 타겟이 겪을 손해(시간 낭비, 품질 저하 등)를 구체적으로 묘사하여 필요성 강조.
- 컨셉 5: 트렌드 융합: 최신 밈, 숏폼 트렌드, AI 등 바이럴 요소를 브랜드와 자연스럽게 융합하여 친밀감과 화제성 증폭.
- 컨셉 6: 파격적 반전: 예측 불가능한 스토리라인과 반전 요소를 활용하여 강한 인상과 유머러스한 재미를 선사.

출력 구조:
# [입력된 브랜드/상황] 광고 영상 스토리보드 기획안
---
## 1. 컨셉 기획 (총 6가지)
### **[컨셉명]**
- **테마**: [주제/테마 설명]
- **스토리라인**: [시작 - 전개 - 클라이맥스 - 결론]
- **타겟 오디언스**: [타겟 연령, 특징, 니즈]
- **감정/시각적 요소**: [강조할 감정 및 시각적 포인트]
- **설명**: [컨셉을 제안하게 된 근거 및 전략 설명. 200~400자]
- **참고 자료**: [데이터 소스]
---
## 2. 스토리보드 (총 6가지)
### **[컨셉명] (XX초, XX장면)**
- **장면 1 (0:00-0:02)**: [카메라 앵글, 구도, 동작, **배경**, 대사/내레이션] 효과음: [효과음 지시]
- **장면 2 (0:02-0:04)**: [카메라 앵글, 구도, 동작, **배경**, 대사/내레이션] 효과음: [효과음 지시]
- ...
- **장면 XX (XX-XX)**: [카메라 앵글, 구도, 동작, **배경**, 대사/내레이션] 효과음: [효과음 지시]
**음향/음악**: [전체적인 음악 톤, 효과음 특징]
---
... (총 6가지 컨셉에 대해 위 형식 반복) ...`;

    // 크리에이티브 브리프와 함께 두 번째 프롬프트 구성
    const combinedPrompt = `
다음은 1단계에서 생성된 ${formData.brandName}의 크리에이티브 브리프입니다:

${creativeBrief}

---

이제 위의 크리에이티브 브리프를 바탕으로 아래 지침에 따라 스토리보드를 생성해주세요:

${secondPromptTemplate}

브랜드/상황: ${formData.brandName} (${formData.industryCategory})
영상 길이: ${formData.videoLength}
`;

    // Gemini API 호출
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
        
        if (geminiError.status === 503 || geminiError.message.includes('overloaded')) {
          if (attempts < maxAttempts) {
            const delay = Math.pow(2, attempts) * 1000;
            console.log(`모델 과부하 감지, ${delay/1000}초 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, delay));
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
 * 3단계: 내장 프롬프트를 활용한 Freepik용 이미지 프롬프트 생성
 */
async function generateImagePrompts(model, storyboardConcepts, formData) {
  try {
    // Vercel 환경에서 파일 읽기 대신 내장 프롬프트 사용
    const thirdPromptTemplate = `Role: You are an expert video director and VFX supervisor specializing in creating high-quality, professional video ads. You will generate a detailed storyboard for a video ad, with a focus on creating image prompts for each scene. Each scene is precisely 2 seconds long. Your goal is to produce visually stunning and coherent storyboard visuals that can be used for pre-production planning.

### Input Details
- **Storyboard**: A series of scenes with time intervals, subject, action, environment, and an optional style.
- **Brand/Product Context**: A brief description of the brand/product and its core message.
- **Character Details** (if applicable):
  - **Ethnicity**: Specify or infer logically from the environment.
  - **Gender**: Male, female, non-binary, or infer based on the subject.
  - **Age**: A range (e.g., young adult) or infer.
  - **Face Shape**: A specific facial structure (e.g., oval, angular) or infer.
  - **Expression**: Emotional tone (e.g., determined, serene) or infer.
  - **Hairstyle/Hair Color**: Style and color or infer.
  - **Clothing**: Attire tied to the storyboard's atmosphere or infer.
  - **Action & Pose**: A static action or "frozen moment" that implies motion, with specific details on **direction, pose, and orientation**.
  - **Location**: The subject's specific position within the scene.
  - **Environment**: The overall setting.
- If any details are missing, infer them logically based on the storyboard atmosphere and context.

### Automatic Style Selection
Based on the Brand/Product Context and Storyboard atmosphere, automatically select the most suitable commercial ad style from the following options:
- **Clean and Minimalist**: For tech, beauty, luxury brands. Emphasizes product and clean design.
- **Vibrant and Hyper-Realistic**: For food, beverage, or youth-oriented brands. Emphasizes dynamic visuals and vivid colors.
- **Cinematic and Story-Driven**: For brand storytelling, automotive, or corporate ads. Emphasizes drama and narrative.
- **Documentary and Authentic**: For social causes, lifestyle brands, or to build trust. Emphasizes realism and genuine emotion.
- **Stylized and Artistic**: For creative, unique campaigns. Emphasizes an unconventional visual identity.

### Output Requirements
For each scene, you must provide a detailed image prompt.
- **Image Prompt** (70-100 words, English):
  - **Structure**:
    - **Camera/Lens**: Specify a professional camera and focal length (e.g., Canon EOS R5 with a 50mm lens).
    - **Composition**: Camera angle, shot type, and subject position.
    - **Mise-en-scène**: A detailed description of the subject, environment, and objects in a static, frozen moment. **Crucially, this must include specific pose, direction, and orientation details for both characters and objects.**
    - **Detail Level**: Explicitly include keywords like **insanely detailed, micro-details, hyper-realistic textures, visible skin pores, stitching on clothing, scratches on metal** to force the AI to render the finest details.
    - **Lighting/Time**: Time of day and specific lighting style (e.g., golden hour, neon).
    - **Color Palette**: The primary color tones.
    - **Style/Tone**: The automatically selected style is applied here (e.g., "Cinematic and Story-Driven, photorealistic, sharp focus").
    - **Quality/Parameters**: High-quality parameters to ensure a professional output (e.g., 4K, sharp focus, --s 250).
  - **Focus on Mise-en-scène**: This prompt must describe a still, visually rich image that captures a moment of intense static energy. Use descriptive nouns and adjectives to imply motion and narrative.
  - **Consistency**: Reuse key descriptions (e.g., character appearance, environment details) for scenes with the same elements to ensure visual continuity.

### Output Format
- Markdown, with each scene clearly labeled.

##Storyboard Image Prompts
### Scene 1 (0:00-0:02)
- **Image Prompt**: [Detailed prompt here]

### Scene 2 (0:02-0:04)
- **Image Prompt**: [Detailed prompt here]

Continue for all scenes...`;

    // 스토리보드 컨셉과 함께 세 번째 프롬프트 구성
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

    // Gemini API 호출
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`3단계 Gemini API 시도 ${attempts}/${maxAttempts}...`);
        
        const result = await model.generateContent(combinedPrompt);
        const imagePromptsText = result.response.text();
        console.log('3단계: Freepik용 이미지 프롬프트 생성 완료');
        
        // 생성된 텍스트에서 실제 이미지 프롬프트들 추출
        const extractedPrompts = extractImagePromptsFromResponse(imagePromptsText);
        return extractedPrompts;
        
      } catch (geminiError) {
        console.error(`3단계 Gemini API 시도 ${attempts} 실패:`, geminiError.message);
        
        if (geminiError.status === 503 || geminiError.message.includes('overloaded')) {
          if (attempts < maxAttempts) {
            const delay = Math.pow(2, attempts) * 1000;
            console.log(`모델 과부하 감지, ${delay/1000}초 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, delay));
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

/**
 * Gemini 응답에서 이미지 프롬프트들을 추출하는 함수
 */
function extractImagePromptsFromResponse(responseText) {
  const prompts = [];
  
  // "Image Prompt" 패턴으로 프롬프트 추출
  const promptPattern = /\*\*Image Prompt\*\*:(.+?)(?=###|$)/gs;
  const matches = responseText.match(promptPattern);
  
  if (matches && matches.length > 0) {
    matches.forEach((match, index) => {
      const cleanPrompt = match
        .replace(/\*\*Image Prompt\*\*:/g, '')
        .replace(/\*\*/g, '')
        .trim();
      
      if (cleanPrompt.length > 50) { // 유효한 프롬프트인지 확인
        prompts.push({
          sceneNumber: index + 1,
          prompt: cleanPrompt,
          title: `Scene ${index + 1}`,
          duration: 6 // Freepik 기본 길이
        });
      }
    });
  }
  
  // 추출된 프롬프트가 없으면 기본 프롬프트 생성
  if (prompts.length === 0) {
    console.warn('Gemini 응답에서 이미지 프롬프트를 추출할 수 없어 기본 프롬프트 사용');
    return generateFallbackImagePrompts();
  }
  
  console.log(`${prompts.length}개의 이미지 프롬프트 추출 완료`);
  return prompts;
}

/**
 * 기본 이미지 프롬프트 생성 (추출 실패시 사용)
 */
function generateFallbackImagePrompts() {
  return [
    {
      sceneNumber: 1,
      prompt: "professional commercial photography, brand introduction scene, high quality, cinematic lighting, 16:9 aspect ratio",
      title: "Scene 1",
      duration: 6
    },
    {
      sceneNumber: 2,
      prompt: "professional product showcase, commercial photography, clean background, studio lighting, high detail, 16:9 aspect ratio",
      title: "Scene 2", 
      duration: 6
    },
    {
      sceneNumber: 3,
      prompt: "lifestyle photography, people using product, natural lighting, authentic moment, commercial style, 16:9 aspect ratio",
      title: "Scene 3",
      duration: 6
    },
    {
      sceneNumber: 4,
      prompt: "close-up product detail, macro photography, professional lighting, high resolution, commercial quality, 16:9 aspect ratio",
      title: "Scene 4",
      duration: 6
    },
    {
      sceneNumber: 5,
      prompt: "customer satisfaction scene, happy people, positive emotions, lifestyle photography, commercial style, 16:9 aspect ratio",
      title: "Scene 5",
      duration: 6
    },
    {
      sceneNumber: 6,
      prompt: "brand logo finale, professional branding, clean design, corporate style, call to action, 16:9 aspect ratio",
      title: "Scene 6",
      duration: 6
    }
  ];
}

/**
 * 4단계: Freepik API로 실제 이미지 생성
 */
async function generateImagesWithFreepik(imagePrompts, freepikApiKey, formData) {
  const storyboardResults = [];
  
  // 6가지 스타일로 구성 (기존 스타일 유지)
  const styles = [
    {
      name: 'Cinematic Professional',
      description: 'cinematic professional shot dramatic lighting high detail 8k corporate',
      colorPalette: '#1a365d,#2d3748,#4a5568,#e2e8f0'
    },
    {
      name: 'Modern Minimalist',
      description: 'minimalist modern clean background simple composition contemporary',
      colorPalette: '#ffffff,#f7fafc,#e2e8f0,#cbd5e0'
    },
    {
      name: 'Vibrant Dynamic',
      description: 'vibrant energetic dynamic motion bright colors active lifestyle',
      colorPalette: '#e53e3e,#dd6b20,#d69e2e,#38a169'
    },
    {
      name: 'Natural Lifestyle',
      description: 'natural lifestyle photorealistic everyday life authentic people',
      colorPalette: '#38a169,#68d391,#9ae6b4,#c6f6d5'
    },
    {
      name: 'Premium Luxury',
      description: 'luxury premium elegant sophisticated high-end exclusive',
      colorPalette: '#744210,#a0845c,#d6b573,#f7e6a3'
    },
    {
      name: 'Tech Innovation',
      description: 'technology innovation futuristic digital modern tech startup',
      colorPalette: '#2b6cb0,#3182ce,#4299e1,#63b3ed'
    }
  ];

  // 각 스타일별로 이미지 생성
  for (let styleIndex = 0; styleIndex < styles.length; styleIndex++) {
    const style = styles[styleIndex];
    console.log(`스타일 ${styleIndex + 1}/${styles.length} 처리 중: ${style.name}`);

    try {
      const images = [];
      
      // 영상 길이에 따른 이미지 수 계산
      const imageCount = getImageCountByVideoLength(formData.videoLength);
      const promptsToUse = imagePrompts.slice(0, imageCount);
      
      for (let promptIndex = 0; promptIndex < promptsToUse.length; promptIndex++) {
        const imagePrompt = promptsToUse[promptIndex];
        
        try {
          // 스타일과 이미지 프롬프트 결합
          const finalPrompt = `${imagePrompt.prompt}, ${style.description}`;
          
          console.log(`스타일 ${style.name} - 이미지 ${promptIndex + 1} 생성 중...`);
          
          // Freepik API 호출
          const imageResult = await generateSingleImageWithFreepik(finalPrompt, freepikApiKey);
          
          if (imageResult.success) {
            images.push({
              id: `${style.name.toLowerCase().replace(/\s+/g, '-')}-${promptIndex + 1}`,
              title: imagePrompt.title,
              url: imageResult.url,
              thumbnail: imageResult.url,
              prompt: finalPrompt,
              duration: imagePrompt.duration,
              sceneNumber: imagePrompt.sceneNumber
            });
          }
          
        } catch (imageError) {
          console.error(`스타일 ${style.name} - 이미지 ${promptIndex + 1} 생성 실패:`, imageError.message);
          // 개별 이미지 실패는 무시하고 계속 진행
        }
        
        // API 호출 간격 조정
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      storyboardResults.push({
        style: style.name,
        description: style.description,
        colorPalette: style.colorPalette,
        images: images,
        searchQuery: generateSearchQuery(formData, style),
        status: images.length > 0 ? 'success' : 'fallback'
      });
      
      console.log(`${style.name} 스타일 완료: ${images.length}개 이미지`);
      
    } catch (error) {
      console.error(`${style.name} 스타일 처리 실패:`, error.message);
      
      // 실패시 플레이스홀더 이미지 사용
      const fallbackImages = generateFallbackImages(style.name, getImageCountByVideoLength(formData.videoLength));
      
      storyboardResults.push({
        style: style.name,
        description: style.description,
        colorPalette: style.colorPalette,
        images: fallbackImages,
        searchQuery: generateSearchQuery(formData, style),
        status: 'fallback',
        error: error.message
      });
    }
  }
  
  return storyboardResults;
}

/**
 * 영상 길이에 따른 이미지 수 계산
 */
function getImageCountByVideoLength(videoLength) {
  const lengthMap = {
    '10초': 5,   // 10초 ÷ 2초 = 5개
    '30초': 15,  // 30초 ÷ 2초 = 15개
    '60초': 30   // 60초 ÷ 2초 = 30개
  };
  
  return lengthMap[videoLength] || 15; // 기본값 15개
}

/**
 * Freepik API로 단일 이미지 생성
 */
async function generateSingleImageWithFreepik(prompt, apiKey) {
  try {
    // 프롬프트 정제 (800자 이내로 제한)
    const cleanPrompt = prompt
      .replace(/[^\w\s가-힣,.-]/g, '')
      .replace(/\s+/g, ' ')
      .substring(0, 800)
      .trim();

    if (cleanPrompt.length < 20) {
      throw new Error('프롬프트가 너무 짧습니다.');
    }

    console.log(`Freepik 이미지 생성 요청: ${cleanPrompt.substring(0, 100)}...`);

    // Freepik Text-to-Image API 호출
    const response = await fetch('https://api.freepik.com/v1/ai/text-to-image/flux-dev', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-freepik-api-key': apiKey
      },
      body: JSON.stringify({
        prompt: cleanPrompt,
        num_images: 1,
        aspect_ratio: 'widescreen_16_9'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Freepik API 실패 (${response.status}):`, errorText);
      throw new Error(`Freepik API 실패: ${response.status}`);
    }

    const result = await response.json();
    console.log('Freepik API 응답:', result);
    
    if (result.data && result.data.task_id) {
      // 폴링으로 결과 대기 (최적화된 폴링)
      const imageUrl = await pollForImageResultOptimized(result.data.task_id, apiKey);
      
      if (imageUrl) {
        return {
          success: true,
          url: imageUrl,
          taskId: result.data.task_id
        };
      }
    }
    
    throw new Error('이미지 생성 실패: 유효한 결과를 받지 못함');
    
  } catch (error) {
    console.error('Freepik 이미지 생성 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 최적화된 Freepik 이미지 생성 결과 폴링
 */
async function pollForImageResultOptimized(taskId, apiKey) {
  const maxAttempts = 10;
  const interval = 5000; // 5초 간격
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(`폴링 시도 ${attempt + 1}/${maxAttempts}: ${taskId}`);
      
      const response = await fetch(`https://api.freepik.com/v1/ai/text-to-image/flux-dev/${taskId}`, {
        method: 'GET',
        headers: {
          'x-freepik-api-key': apiKey,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`폴링 실패 (${response.status}):`, await response.text());
        
        if (response.status === 500) {
          console.log('500 에러 - 더 긴 대기 후 재시도');
          await new Promise(resolve => setTimeout(resolve, interval * 2));
          continue;
        }
        
        throw new Error(`Status check failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`폴링 결과 ${attempt + 1}:`, result.data?.status);
      
      if (result.data && result.data.status === 'COMPLETED') {
        console.log('COMPLETED 응답 전체 구조:', JSON.stringify(result.data, null, 2));
        
        // Freepik 공식 문서에 따른 정확한 구조
        let imageUrl = null;
        
        if (result.data.generated && Array.isArray(result.data.generated) && result.data.generated.length > 0) {
          // generated 배열의 첫 번째 요소가 직접 URL 문자열
          imageUrl = result.data.generated[0];
          console.log('Freepik 공식 구조에서 이미지 URL 추출:', imageUrl);
        }
        
        if (imageUrl && typeof imageUrl === 'string') {
          console.log('이미지 생성 완료!');
          return imageUrl;
        } else {
          console.log('COMPLETED 상태이지만 generated 배열에 URL 없음. 전체 응답:', result);
          // COMPLETED인데 URL이 없으면 한 번 더 대기 후 재시도
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      } else if (result.data && result.data.status === 'FAILED') {
        console.log('이미지 생성 실패:', result.data);
        throw new Error('Image generation failed');
      } else if (result.data && (result.data.status === 'CREATED' || result.data.status === 'IN_PROGRESS')) {
        console.log('아직 생성 중... 계속 대기');
      }

      // 대기 후 재시도
      await new Promise(resolve => setTimeout(resolve, interval));

    } catch (error) {
      console.error(`폴링 시도 ${attempt + 1} 실패:`, error.message);
      
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error('이미지 생성 타임아웃 - 50초 초과');
}

/**
 * 검색 쿼리 생성 (단순화)
 */
function generateSearchQuery(formData) {
  return `${formData.brandName} ${formData.industryCategory} advertisement`.trim();
}

/**
 * 대체 이미지 생성 (기존 로직 유지)
 */
function generateFallbackImages(styleName, count) {
  const placeholderImages = [
    'https://via.placeholder.com/800x450/3B82F6/FFFFFF?text=Business+Professional',
    'https://via.placeholder.com/800x450/10B981/FFFFFF?text=Product+Showcase',
    'https://via.placeholder.com/800x450/F59E0B/FFFFFF?text=Lifestyle+Scene',
    'https://via.placeholder.com/800x450/EF4444/FFFFFF?text=Call+To+Action',
    'https://via.placeholder.com/800x450/8B5CF6/FFFFFF?text=Brand+Identity',
    'https://via.placeholder.com/800x450/06B6D4/FFFFFF?text=Customer+Happy'
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `fallback-${styleName}-${i + 1}`,
    url: placeholderImages[i % placeholderImages.length],
    thumbnail: placeholderImages[i % placeholderImages.length],
    title: `${styleName} Scene ${i + 1}`,
    prompt: `${styleName} advertisement scene ${i + 1}`,
    duration: 6,
    sceneNumber: i + 1,
    isFallback: true,
    source: 'placeholder',
    note: 'Freepik API 대체 이미지'
  }));
}

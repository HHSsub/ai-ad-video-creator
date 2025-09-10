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

    console.log('스토리보드 생성 요청:', {
      brandName: formData.brandName,
      industryCategory: formData.industryCategory,
      videoPurpose: formData.videoPurpose,
      videoLength: formData.videoLength
    });

    // 1. Gemini API로 브리프 생성
    const geminiApiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!geminiApiKey) {
      throw new Error('Gemini API key not found');
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // 정확히 2.5 Flash로 수정

    // 프롬프트 템플릿 로드 및 처리
    const promptTemplate = await loadPromptTemplate();
    const processedPrompt = processPromptWithFormData(promptTemplate, formData);

    console.log('Gemini 2.5 Flash API 요청 시작...');
    
    // 재시도 로직 추가 (503 오류 대응)
    let creativeBrief = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts && !creativeBrief) {
      try {
        attempts++;
        console.log(`Gemini 2.5 Flash API 시도 ${attempts}/${maxAttempts}...`);
        
        const result = await model.generateContent(processedPrompt);
        creativeBrief = result.response.text();
        console.log('Gemini 2.5 Flash 브리프 생성 완료');
        break;
        
      } catch (geminiError) {
        console.error(`Gemini 2.5 Flash API 시도 ${attempts} 실패:`, geminiError.message);
        
        if (geminiError.status === 503 || geminiError.message.includes('overloaded')) {
          if (attempts < maxAttempts) {
            const delay = Math.pow(2, attempts) * 1000; // 지수 백오프: 2초, 4초, 8초
            console.log(`모델 과부하 감지, ${delay/1000}초 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            console.log('최대 재시도 횟수 도달, 대체 브리프 사용');
            creativeBrief = generateFallbackCreativeBrief(formData);
            break;
          }
        } else {
          // 503이 아닌 다른 오류는 즉시 대체 브리프 사용
          console.log('Gemini 2.5 Flash API 오류, 대체 브리프 사용:', geminiError.message);
          creativeBrief = generateFallbackCreativeBrief(formData);
          break;
        }
      }
    }

    // 2. 6가지 스타일별 이미지 생성
    const styles = [
      {
        name: 'Cinematic Professional',
        description: 'cinematic professional shot dramatic lighting high detail 8k corporate',
        searchTerms: ['business', 'professional', 'corporate'],
        colorPalette: '#1a365d,#2d3748,#4a5568,#e2e8f0'
      },
      {
        name: 'Modern Minimalist',
        description: 'minimalist modern clean background simple composition contemporary',
        searchTerms: ['minimalist', 'clean', 'modern'],
        colorPalette: '#ffffff,#f7fafc,#e2e8f0,#cbd5e0'
      },
      {
        name: 'Vibrant Dynamic',
        description: 'vibrant energetic dynamic motion bright colors active lifestyle',
        searchTerms: ['colorful', 'energetic', 'dynamic'],
        colorPalette: '#e53e3e,#dd6b20,#d69e2e,#38a169'
      },
      {
        name: 'Natural Lifestyle',
        description: 'natural lifestyle photorealistic everyday life authentic people',
        searchTerms: ['lifestyle', 'natural', 'people'],
        colorPalette: '#38a169,#68d391,#9ae6b4,#c6f6d5'
      },
      {
        name: 'Premium Luxury',
        description: 'luxury premium elegant sophisticated high-end exclusive',
        searchTerms: ['luxury', 'premium', 'elegant'],
        colorPalette: '#744210,#a0845c,#d6b573,#f7e6a3'
      },
      {
        name: 'Tech Innovation',
        description: 'technology innovation futuristic digital modern tech startup',
        searchTerms: ['technology', 'digital', 'innovation'],
        colorPalette: '#2b6cb0,#3182ce,#4299e1,#63b3ed'
      }
    ];

    const storyboardResults = [];
    const freepikApiKey = process.env.FREEPIK_API_KEY || process.env.REACT_APP_FREEPIK_API_KEY || process.env.VITE_FREEPIK_API_KEY;

    if (!freepikApiKey) {
      throw new Error('Freepik API key not found');
    }

    // 각 스타일별로 이미지 생성
    for (let i = 0; i < styles.length; i++) {
      const style = styles[i];
      console.log(`스타일 ${i + 1}/${styles.length} 처리 중: ${style.name}`);

      try {
        // 스타일별 프롬프트 생성
        const styledPrompts = generateStyledPrompts(formData, style, creativeBrief);
        
        // Freepik API로 이미지 생성
        const images = await generateImagesForStyle(styledPrompts, freepikApiKey, formData.videoLength);
        
        storyboardResults.push({
          style: style.name,
          description: style.description,
          colorPalette: style.colorPalette,
          images: images,
          prompt: styledPrompts.join(' | '),
          searchQuery: generateSearchQuery(formData, style),
          status: 'success'
        });

        console.log(`${style.name} 스타일 완료: ${images.length}개 이미지`);

      } catch (error) {
        console.error(`${style.name} 스타일 처리 실패:`, error.message);
        
        // 실패시 플레이스홀더 이미지 사용
        const fallbackImages = generateFallbackImages(style.name, getImageCountByDuration(formData.videoLength));
        
        storyboardResults.push({
          style: style.name,
          description: style.description,
          colorPalette: style.colorPalette,
          images: fallbackImages,
          prompt: `Fallback for ${style.name}`,
          searchQuery: generateSearchQuery(formData, style),
          status: 'fallback',
          error: error.message
        });
      }

      // API 호출 간격 조정
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const response = {
      success: true,
      creativeBrief: creativeBrief,
      storyboard: storyboardResults,
      metadata: {
        brandName: formData.brandName,
        videoLength: formData.videoLength,
        videoPurpose: formData.videoPurpose,
        createdAt: new Date().toISOString(),
        totalStyles: styles.length,
        successCount: storyboardResults.filter(s => s.status === 'success').length,
        fallbackCount: storyboardResults.filter(s => s.status === 'fallback').length,
        geminiModel: 'gemini-2.5-flash'
      }
    };

    console.log('스토리보드 생성 완료:', {
      totalStyles: response.metadata.totalStyles,
      successCount: response.metadata.successCount,
      fallbackCount: response.metadata.fallbackCount
    });

    res.status(200).json(response);

  } catch (error) {
    console.error('스토리보드 생성 중 전체 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// 프롬프트 템플릿 로드 함수
async function loadPromptTemplate() {
  // 기본 프롬프트 템플릿 (public/input_prompt.txt 내용 기반)
  return `당신은 업계 최상위 크리에이티브 디렉터(Creative Director)이자 브랜드 전략가(Brand Strategist)입니다. 사용자가 제공하는 핵심 정보를 바탕으로 즉시 실행 가능한 수준의 광고 영상 전략 및 크리에이티브 브리프를 생성해야 합니다.

다음 정보를 기반으로 6장면의 스토리보드와 각 장면별 이미지 생성을 위한 구체적인 지침을 작성하세요:

{USER_INPUT}

각 장면별로 다음을 포함해야 합니다:
1. 장면 제목과 설명
2. 이미지 생성을 위한 구체적인 프롬프트
3. 장면 지속 시간
4. 시각적 요소 (색상, 구도, 분위기)
5. 텍스트 오버레이 내용

결과는 실제 이미지 생성 API에서 바로 활용할 수 있는 형태로 제공해주세요.`;
}

// 폼 데이터로 프롬프트 처리
function processPromptWithFormData(template, formData) {
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

  return template.replace('{USER_INPUT}', userInputString.trim());
}

// 스타일별 프롬프트 생성
function generateStyledPrompts(formData, style, creativeBrief) {
  const baseElements = [
    formData.brandName,
    formData.industryCategory, 
    'advertisement'
  ];
  
  const targetPrompt = formData.coreTarget ? `targeting ${formData.coreTarget}` : '';
  const differentiationPrompt = formData.coreDifferentiation || '';
  
  // 영상 길이에 따른 장면 수 계산
  const sceneCount = getImageCountByDuration(formData.videoLength);
  
  // 다양한 장면별 시나리오 생성
  const sceneScenarios = [
    'opening brand introduction with logo',
    'product showcase detailed view',
    'lifestyle usage demonstration',
    'close-up product benefits',
    'customer satisfaction moment',
    'call to action with brand logo'
  ];
  
  const prompts = [];
  
  for (let i = 0; i < sceneCount; i++) {
    // 각 장면마다 다른 시나리오 사용
    const scenario = sceneScenarios[i % sceneScenarios.length];
    
    const sceneElements = [
      ...baseElements,
      `scene ${i + 1} of ${sceneCount}`,
      scenario,
      style.description,
      targetPrompt,
      differentiationPrompt,
      'high quality, professional, commercial photography'
    ].filter(Boolean);
    
    // 브랜드 로고나 제품 이미지 포함 (특정 장면에)
    if (i === 0 && formData.brandLogo) {
      sceneElements.push('featuring brand logo prominently');
    }
    if ((i === 1 || i === 3) && formData.productImage) {
      sceneElements.push('featuring product prominently');
    }
    
    prompts.push(sceneElements.join(', '));
  }
  
  return prompts;
}

// Freepik API로 이미지 생성
async function generateImagesForStyle(prompts, apiKey, videoLength) {
  const images = [];
  
  // 병렬 처리로 속도 개선 (최대 3개 동시)
  const batchSize = 3;
  const batches = [];
  
  for (let i = 0; i < prompts.length; i += batchSize) {
    batches.push(prompts.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    const batchPromises = batch.map(async (prompt, index) => {
      try {
        console.log(`배치 이미지 생성 중: ${prompt.substring(0, 50)}...`);
        
        // 프롬프트 단순화 (길이 제한)
        const cleanPrompt = prompt
          .replace(/[^\w\s,.-]/g, '') // 특수문자 제거
          .substring(0, 500) // 길이 제한
          .trim();
        
        console.log(`정제된 프롬프트: ${cleanPrompt}`);
        
        // Freepik API 이미지 생성 요청 (단순화된 파라미터)
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
            // 다른 파라미터 제거로 단순화
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`이미지 생성 실패 (${response.status}):`, errorText);
          throw new Error(`Image generation failed: ${response.status}`);
        }

        const result = await response.json();
        console.log('이미지 생성 응답:', result);

        if (result.data && result.data.task_id) {
          // 단순화된 폴링 (최대 10회, 5초 간격)
          const imageUrl = await pollForImageResultOptimized(result.data.task_id, apiKey);
          
          if (imageUrl) {
            return {
              id: `image-${Date.now()}-${index}`,
              url: imageUrl,
              thumbnail: imageUrl,
              title: `Scene ${index + 1}`,
              prompt: cleanPrompt,
              duration: getDurationPerImage(videoLength),
              sceneNumber: index + 1
            };
          }
        }
        
        throw new Error('No task_id received');

      } catch (error) {
        console.error(`배치 이미지 생성 실패:`, error);
        throw error;
      }
    });

    // 배치 실행 (병렬)
    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        images.push(result.value);
      } else {
        console.error(`배치 ${index} 실패:`, result.reason);
        // 실패한 경우에만 에러 기록, 계속 진행
      }
    });

    // 배치 간 짧은 대기
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return images;
}

// 최적화된 폴링 함수
async function pollForImageResultOptimized(taskId, apiKey) {
  const maxAttempts = 10;
  const interval = 5000;
  
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
      
      // 응답 구조 디버깅
      if (result.data && result.data.status === 'COMPLETED') {
        console.log('COMPLETED 응답 전체 구조:', JSON.stringify(result.data, null, 2));
        
        // Freepik 공식 문서에 따른 정확한 구조
        // generated 배열에 직접 URL 문자열이 들어있음
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

  throw new Error('Image generation timeout - 50초 초과');
}

// 영상 길이별 이미지 수 계산
function getImageCountByDuration(videoLength) {
  switch (videoLength) {
    case '10초': return 5;
    case '30초': return 15;  
    case '60초': return 30;
    default: return 15;
  }
}

// 이미지당 지속 시간 계산 (비디오 API 호환)
function getDurationPerImage(videoLength) {
  // Freepik API는 6초 또는 10초만 허용
  // 총 길이에 상관없이 각 세그먼트는 6초로 통일
  return 6;
}

// 검색 쿼리 생성
function generateSearchQuery(formData, style) {
  const industryKeywords = {
    '뷰티': 'beauty',
    '푸드': 'food',
    '게임': 'gaming',
    '테크': 'technology',
    '커피': 'coffee',
    '패션': 'fashion'
  };

  const industry = industryKeywords[formData.industryCategory] || 'business';
  const styleKeyword = style.searchTerms[0] || 'professional';
  
  return `${industry} ${styleKeyword} ${formData.brandName}`.trim();
}

/**
 * Gemini API 실패시 사용할 대체 브리프 생성
 */
function generateFallbackCreativeBrief(formData) {
  console.log('대체 크리에이티브 브리프 생성 중...');
  
  const brandName = formData.brandName || '브랜드';
  const industry = formData.industryCategory || '일반';
  const purpose = formData.videoPurpose || '브랜드 홍보';
  const length = formData.videoLength || '30초';
  const target = formData.coreTarget || '일반 소비자';
  const differentiation = formData.coreDifferentiation || '고품질 제품/서비스';

  return `
# ${brandName} 광고 영상 크리에이티브 브리프

## 프로젝트 개요
- **브랜드**: ${brandName}
- **업종**: ${industry}
- **영상 목적**: ${purpose}  
- **영상 길이**: ${length}
- **타겟 고객**: ${target}

## 핵심 메시지
${brandName}는 ${industry} 분야에서 ${differentiation}을(를) 통해 고객에게 특별한 가치를 제공합니다.

## 스토리보드 구성 (6장면)

### 장면 1: 오프닝 (0-${Math.ceil(parseInt(length)/6)}초)
- **컨셉**: 브랜드 로고와 함께 강렬한 첫인상
- **비주얼**: ${brandName} 로고, ${industry} 관련 배경
- **메시지**: "${brandName}와 함께하는 새로운 경험"

### 장면 2: 문제 제기 (${Math.ceil(parseInt(length)/6)}-${Math.ceil(parseInt(length)*2/6)}초)
- **컨셉**: 타겟 고객의 니즈나 불편함 제시
- **비주얼**: ${target}의 일상적인 고민 상황
- **메시지**: "이런 고민, 누구나 한 번쯤 해봤죠?"

### 장면 3: 솔루션 제시 (${Math.ceil(parseInt(length)*2/6)}-${Math.ceil(parseInt(length)*3/6)}초)
- **컨셉**: ${brandName}의 제품/서비스 소개
- **비주얼**: 제품/서비스의 핵심 기능 클로즈업
- **메시지**: "${differentiation}으로 해결하세요"

### 장면 4: 사용 장면 (${Math.ceil(parseInt(length)*3/6)}-${Math.ceil(parseInt(length)*4/6)}초)
- **컨셉**: 실제 사용하는 모습과 만족스러운 표정
- **비주얼**: ${target}이 제품/서비스를 사용하는 자연스러운 모습
- **메시지**: "이렇게 간편하고 효과적이에요"

### 장면 5: 혜택 강조 (${Math.ceil(parseInt(length)*4/6)}-${Math.ceil(parseInt(length)*5/6)}초)  
- **컨셉**: 사용 후의 긍정적인 변화와 만족감
- **비주얼**: 만족스러운 결과와 행복한 표정
- **메시지**: "${brandName}와 함께한 달라진 일상"

### 장면 6: 클로징 (${Math.ceil(parseInt(length)*5/6)}-${length}초)
- **컨셉**: 브랜드 로고와 구매 유도 메시지
- **비주얼**: ${brandName} 로고, 연락처/웹사이트
- **메시지**: "지금 바로 ${brandName}와 함께하세요!"

## 전체 톤앤매너
- **스타일**: ${industry} 업계에 적합한 전문적이면서도 친근한 분위기
- **색상**: 브랜드 컬러를 기반으로 한 일관된 컬러 팔레트
- **음악**: ${purpose}에 어울리는 감성적이고 기억에 남는 BGM
- **속도**: ${length} 길이에 맞는 적절한 템포와 리듬감

## 기술 사양
- **해상도**: 1920x1080 (Full HD)
- **비율**: 16:9 (가로형)
- **형식**: MP4, H.264 코덱
- **프레임레이트**: 30fps
- **예상 용량**: ${Math.ceil(parseInt(length) * 2)}MB

## 핵심 성공 지표
1. **브랜드 인지도**: ${brandName} 로고와 메시지의 명확한 전달
2. **타겟 반응**: ${target}의 공감과 관심 유도
3. **행동 유도**: ${purpose} 목적 달성을 위한 효과적인 CTA
4. **기억성**: 차별화된 메시지로 오래 기억되는 영상

*이 브리프는 Gemini 2.5 Flash API 대신 대체 시스템으로 생성되었습니다.*
`;
}

/**
 * 대체 이미지 생성 함수 (플레이스홀더용)
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
    duration: Math.ceil(parseInt('30') / count), // 기본 30초 기준
    sceneNumber: i + 1,
    isFallback: true,
    source: 'placeholder',
    note: 'Gemini API 대체 이미지'
  }));
}

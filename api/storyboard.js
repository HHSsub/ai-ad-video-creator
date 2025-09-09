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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 프롬프트 템플릿 로드 및 처리
    const promptTemplate = await loadPromptTemplate();
    const processedPrompt = processPromptWithFormData(promptTemplate, formData);

    console.log('Gemini API 요청 시작...');
    const result = await model.generateContent(processedPrompt);
    const creativeBrief = result.response.text();
    console.log('Gemini 브리프 생성 완료');

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
        fallbackCount: storyboardResults.filter(s => s.status === 'fallback').length
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
  const basePrompt = `${formData.brandName} ${formData.industryCategory} advertisement`;
  const stylePrompt = style.description;
  const targetPrompt = `targeting ${formData.coreTarget}`;
  
  // 영상 길이에 따른 장면 수 계산
  const sceneCount = getImageCountByDuration(formData.videoLength);
  
  const prompts = [];
  
  for (let i = 0; i < sceneCount; i++) {
    const scenePrompts = [
      `${basePrompt}, scene ${i + 1}/${sceneCount}`,
      stylePrompt,
      targetPrompt,
      `high quality, professional, commercial photography`,
      `${formData.coreDifferentiation}`
    ];
    
    // 브랜드 로고나 제품 이미지가 있는 경우 특정 장면에 포함
    if (i === 0 && formData.brandLogo) {
      scenePrompts.push('featuring brand logo prominently');
    }
    if (i === 2 && formData.productImage) {
      scenePrompts.push('featuring product prominently');
    }
    
    prompts.push(scenePrompts.join(', '));
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
  const maxAttempts = 10; // 30회 → 10회로 단축
  const interval = 5000; // 3초 → 5초로 조정
  
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
        
        // 500 에러면 잠시 더 대기 후 재시도
        if (response.status === 500) {
          console.log('500 에러 - 더 긴 대기 후 재시도');
          await new Promise(resolve => setTimeout(resolve, interval * 2));
          continue;
        }
        
        throw new Error(`Status check failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`폴링 결과 ${attempt + 1}:`, result.data?.status);
      
      if (result.data && result.data.status === 'COMPLETED' && result.data.result && result.data.result.length > 0) {
        console.log('이미지 생성 완료!');
        return result.data.result[0].url;
      } else if (result.data && result.data.status === 'FAILED') {
        throw new Error('Image generation failed');
      } else if (result.data && result.data.status === 'CREATED') {
        console.log('아직 생성 중... 계속 대기');
      }

      // 대기 후 재시도
      await new Promise(resolve => setTimeout(resolve, interval));

    } catch (error) {
      console.error(`폴링 시도 ${attempt + 1} 실패:`, error.message);
      
      // 마지막 시도가 아니면 계속
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

// 이미지당 지속 시간 계산
function getDurationPerImage(videoLength) {
  const totalSeconds = parseInt(videoLength);
  const imageCount = getImageCountByDuration(videoLength);
  return totalSeconds / imageCount;
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

// 빠른 대체 이미지 생성 함수 (타임아웃 방지용)
function generateQuickFallbackImages(styleName, count) {
  const unsplashImages = [
    'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=800&q=80&fit=crop'
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `quick-${styleName}-${i + 1}`,
    url: unsplashImages[i % unsplashImages.length],
    thumbnail: unsplashImages[i % unsplashImages.length],
    title: `${styleName} Scene ${i + 1}`,
    prompt: `${styleName} professional image`,
    duration: 2,
    sceneNumber: i + 1,
    isFallback: true,
    source: 'unsplash'
  }));
}

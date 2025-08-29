import { industryKeywords, ageGroupStyles, toneStyles } from './mock/patterns.js';

// 사용자 입력을 키워드로 매핑하는 함수
export const mapInputsToKeywords = (inputs) => {
  const { industryCategory, coreTarget, corePurpose, videoLength, coreDifferentiation, additionalRequirements } = inputs;
  
  const keywords = [
    ...(industryKeywords[industryCategory] || []),
    corePurpose,
    coreDifferentiation,
    ...(additionalRequirements ? [additionalRequirements] : [])
  ];
  
  // 타겟과 목적에 따른 스타일 결정
  const style = {
    pace: videoLength === '10초' ? 'fast' : videoLength === '30초' ? 'medium' : 'slow',
    music: corePurpose === '브랜드 인지도 강화' ? 'upbeat' : 'emotional',
    visual: industryCategory === '뷰티' ? 'elegant' : industryCategory === '테크' ? 'modern' : 'friendly',
    emotion: corePurpose === '구매 전환' ? 'urgent' : 'trustworthy'
  };
  
  return { keywords, style };
};

// 스토리보드 장면 생성 함수
export const generateStoryboardScenes = (inputs, brandClassification, mappedData) => {
  const { brandName, industryCategory, coreTarget, corePurpose, videoLength, coreDifferentiation } = inputs;
  const { keywords, style } = mappedData;
  
  // 영상 길이에 따른 장면 수 조정
  const sceneCount = videoLength === '10초' ? 3 : videoLength === '30초' ? 5 : 6;
  
  const baseScenes = [
    {
      scene: 1,
      duration: videoLength === '10초' ? "3초" : "4초",
      description: `${brandName} 로고 또는 제품이 ${style.visual} 스타일로 등장`,
      keywords: [keywords[0] || brandName, style.emotion],
      transition: "fade-in"
    },
    {
      scene: 2,
      duration: videoLength === '10초' ? "4초" : "5초", 
      description: `${coreTarget}이 ${industryCategory} 관련 상황에서 문제점 인식`,
      keywords: [keywords[1] || industryCategory, "문제해결"],
      transition: "cut"
    },
    {
      scene: 3,
      duration: videoLength === '10초' ? "3초" : "5초",
      description: `${brandName}의 ${coreDifferentiation} 소개 - ${corePurpose}에 맞는 톤으로 표현`,
      keywords: [keywords[2] || coreDifferentiation, "솔루션"],
      transition: "slide"
    }
  ];
  
  if (sceneCount > 3) {
    baseScenes.push({
      scene: 4,
      duration: "4초",
      description: `제품 사용 장면 - ${corePurpose} 달성하는 모습`,
      keywords: [keywords[3] || "사용성", "효과"],
      transition: "zoom"
    });
    
    if (sceneCount > 4) {
      baseScenes.push({
        scene: 5,
        duration: "4초",
        description: `고객 만족 및 긍정적 결과 표현`,
        keywords: [keywords[4] || "만족", "결과"],
        transition: "crossfade"
      });
      
      if (sceneCount > 5) {
        baseScenes.push({
          scene: 6,
          duration: "4초",
          description: `${brandName} 브랜드 메시지 및 CTA (Call to Action)`,
          keywords: [brandName, "행동유도"],
          transition: "fade-out"
        });
      }
    }
  }
  
  return baseScenes;
};

// 최종 JSON 프롬프트 생성
export const generateFinalPrompt = (inputs, brandClassification, scenes) => {
  return {
    project: {
      title: `${inputs.brandName} 광고 영상`,
      type: "advertisement_video",
      target_duration: inputs.videoLength,
      created_at: new Date().toISOString()
    },
    brand: {
      name: inputs.brandName,
      classification: brandClassification.classification,
      industry: inputs.industryCategory,
      differentiation: inputs.coreDifferentiation
    },
    target_audience: {
      core_target: inputs.coreTarget,
      purpose: inputs.corePurpose,
      additional_requirements: inputs.additionalRequirements
    },
    storyboard: {
      total_scenes: scenes.length,
      scenes: scenes
    },
    technical_specs: {
      resolution: "1080x1920",
      fps: 30,
      format: "mp4",
      audio: "background_music_with_voiceover"
    },
    // TODO: CapCut API 호출 위치
    api_integration: {
      status: "준비완료",
      endpoint: "CapCut API",
      note: "이 JSON 데이터를 CapCut API로 전송하여 실제 영상 생성"
    }
  };
};
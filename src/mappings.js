import { industryKeywords, ageGroupStyles, toneStyles } from './mock/patterns.js';

// 사용자 입력을 키워드로 매핑하는 함수
export const mapInputsToKeywords = (inputs) => {
  const { industry, ageGroup, tone, goal } = inputs;
  
  const keywords = [
    ...(industryKeywords[industry] || []),
    tone,
    goal
  ];
  
  const style = {
    ...ageGroupStyles[ageGroup],
    ...toneStyles[tone]
  };
  
  return { keywords, style };
};

// 스토리보드 장면 생성 함수
export const generateStoryboardScenes = (inputs, brandClassification, mappedData) => {
  const { brandName, industry, ageGroup, tone, goal } = inputs;
  const { keywords, style } = mappedData;
  
  const scenes = [
    {
      scene: 1,
      duration: "3초",
      description: `${brandName} 로고 또는 제품이 ${style.visual} 스타일로 등장`,
      keywords: [keywords[0], style.emotion],
      transition: "fade-in"
    },
    {
      scene: 2,
      duration: "4초", 
      description: `${ageGroup} 타겟 고객이 ${industry} 관련 상황에서 문제점 인식`,
      keywords: [keywords[1], "문제해결"],
      transition: "cut"
    },
    {
      scene: 3,
      duration: "5초",
      description: `${brandName}의 솔루션/제품 소개 - ${tone} 톤으로 표현`,
      keywords: [keywords[2], "솔루션"],
      transition: "slide"
    },
    {
      scene: 4,
      duration: "4초",
      description: `제품 사용 장면 - ${goal} 달성하는 모습`,
      keywords: [keywords[3], "사용성"],
      transition: "zoom"
    },
    {
      scene: 5,
      duration: "3초",
      description: `고객 만족 및 긍정적 결과 표현`,
      keywords: [keywords[4] || "만족", "결과"],
      transition: "crossfade"
    },
    {
      scene: 6,
      duration: "3초",
      description: `${brandName} 브랜드 메시지 및 CTA (Call to Action)`,
      keywords: [brandName, "행동유도"],
      transition: "fade-out"
    }
  ];
  
  return scenes;
};

// 최종 JSON 프롬프트 생성
export const generateFinalPrompt = (inputs, brandClassification, scenes) => {
  return {
    project: {
      title: `${inputs.brandName} 광고 영상`,
      type: "advertisement_video",
      target_duration: "22초",
      created_at: new Date().toISOString()
    },
    brand: {
      name: inputs.brandName,
      classification: brandClassification.classification,
      industry: inputs.industry
    },
    target_audience: {
      age_group: inputs.ageGroup,
      tone: inputs.tone,
      goal: inputs.goal
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
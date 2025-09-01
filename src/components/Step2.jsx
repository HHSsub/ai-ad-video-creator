// src/mappings.js
// Freepik API 결과를 CapCut API용 JSON으로 변환하는 매핑 로직

/**
 * 사용자 입력을 키워드로 매핑하는 함수 (기존 로직 유지 + Freepik 연동)
 */
export const mapToKeywords = (formData, freepikResults = null) => {
  // 기존 키워드 매핑 로직
  const baseKeywords = {
    industry: getIndustryKeywords(formData.industry),
    targetAge: getTargetAgeKeywords(formData.targetAge), 
    tone: getToneKeywords(formData.tone),
    goal: getGoalKeywords(formData.goal)
  };

  // Freepik 결과가 있다면 추가 키워드 추출
  if (freepikResults && freepikResults.imageResults) {
    const freepikKeywords = extractFreepikKeywords(freepikResults.imageResults);
    return {
      ...baseKeywords,
      freepikKeywords,
      visualElements: freepikResults.imageResults.map(img => ({
        sceneNumber: img.sceneNumber,
        imageUrl: img.imageUrl,
        tags: img.tags || [],
        searchQuery: img.searchQuery
      }))
    };
  }

  return baseKeywords;
};

/**
 * Freepik 이미지 결과에서 키워드 추출
 */
const extractFreepikKeywords = (imageResults) => {
  const allTags = [];
  
  imageResults.forEach(image => {
    if (image.tags && Array.isArray(image.tags)) {
      allTags.push(...image.tags);
    }
  });

  // 태그 빈도수 계산 및 상위 키워드 추출
  const tagFrequency = allTags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {});

  const topTags = Object.entries(tagFrequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([tag]) => tag);

  return topTags;
};

/**
 * 업종별 키워드 매핑 (기존 로직 확장)
 */
const getIndustryKeywords = (industry) => {
  const industryMap = {
    'IT/소프트웨어': ['기술', '혁신', '디지털', '스마트', '미래'],
    '패션/뷰티': ['스타일', '트렌드', '아름다움', '세련', '매력'],
    '식품/음료': ['맛있는', '신선한', '건강한', '프리미엄', '자연'],
    '자동차': ['성능', '안전', '혁신', '스타일', '신뢰'],
    '부동산': ['안정', '투자', '미래', '가치', '꿈'],
    '금융': ['신뢰', '안전', '성장', '미래', '안정'],
    '교육': ['성장', '미래', '꿈', '발전', '성취'],
    '헬스케어': ['건강', '케어', '안전', '신뢰', '웰빙'],
    '여행/레저': ['힐링', '추억', '경험', '자유', '행복'],
    '스포츠': ['열정', '도전', '성취', '건강', '역동']
  };
  
  return industryMap[industry] || ['품질', '가치', '신뢰'];
};

/**
 * 연령대별 키워드 매핑 (기존 로직 확장)
 */
const getTargetAgeKeywords = (targetAge) => {
  const ageMap = {
    '10대': ['활기', '꿈', '도전', '새로움', '친구'],
    '20대': ['열정', '도전', '성장', '자유', '개성'],
    '30대': ['성취', '안정', '품질', '가족', '커리어'],
    '40대': ['신뢰', '경험', '가족', '안정', '품격'],
    '50대 이상': ['품격', '경험', '신뢰', '여유', '지혜']
  };
  
  return ageMap[targetAge] || ['가치', '품질'];
};

/**
 * 광고 톤별 키워드 매핑 (기존 로직 확장)
 */
const getToneKeywords = (tone) => {
  const toneMap = {
    '감성적': ['따뜻한', '감동', '마음', '소중한', '진실'],
    '전문적': ['전문', '신뢰', '품질', '완벽', '정확'],
    '유머러스': ['즐거운', '재미', '유쾌', '활기', '밝은'],
    '고급스러운': ['프리미엄', '럭셔리', '품격', '세련', '특별'],
    '친근한': ['가까운', '편안한', '따뜻한', '친근', '자연스러운'],
    '역동적': ['활발한', '에너지', '역동', '파워', '강력한']
  };
  
  return toneMap[tone] || ['매력적인', '인상적인'];
};

/**
 * 목표별 키워드 매핑 (기존 로직 확장)
 */
const getGoalKeywords = (goal) => {
  const goalMap = {
    '브랜드 인지도 향상': ['기억에 남는', '독특한', '인상적인', '브랜드', '알려진'],
    '제품 판매 증진': ['구매', '선택', '베스트', '인기', '추천'],
    '신제품 출시': ['새로운', '최초', '혁신', '런칭', '신상'],
    '고객 유치': ['만족', '선택', '경험', '가입', '참여'],
    '브랜드 이미지 개선': ['변화', '새로운', '개선', '발전', '신뢰']
  };
  
  return goalMap[goal] || ['성공', '만족'];
};

/**
 * Freepik 결과를 포함한 6장면 스토리보드 생성 함수 (기존 로직 확장)
 */
export const generateStoryboard = (formData, freepikResults = null) => {
  const keywords = mapToKeywords(formData, freepikResults);
  
  // 기본 장면 구조 (6장면)
  const baseScenes = [
    {
      scene: 1,
      title: "오프닝 - 문제 제기",
      description: "타겟 고객의 니즈나 문제상황 제시",
      duration: "3-5초",
      transition: "페이드인"
    },
    {
      scene: 2,
      title: "제품/브랜드 소개",
      description: "솔루션으로서의 제품/브랜드 등장",
      duration: "5-7초", 
      transition: "슬라이드"
    },
    {
      scene: 3,
      title: "핵심 기능/혜택",
      description: "제품의 주요 기능이나 혜택 강조",
      duration: "5-7초",
      transition: "줌인"
    },
    {
      scene: 4,
      title: "사용 장면/결과",
      description: "실제 사용 모습이나 얻을 수 있는 결과",
      duration: "5-7초", 
      transition: "페이드"
    },
    {
      scene: 5,
      title: "차별화 포인트",
      description: "경쟁사 대비 차별화 요소 어필",
      duration: "3-5초",
      transition: "와이프"
    },
    {
      scene: 6,
      title: "클로징 - 행동 유도", 
      description: "브랜드 로고와 구매/참여 유도 메시지",
      duration: "3-5초",
      transition: "페이드아웃"
    }
  ];

  // Freepik 이미지가 있다면 각 장면에 매핑
  const scenes = baseScenes.map((scene, index) => {
    const freepikImage = freepikResults?.imageResults?.[index];
    
    return {
      ...scene,
      keywords: [
        ...keywords.industry.slice(0, 2),
        ...keywords.tone.slice(0, 2),
        formData.brandName
      ],
      // Freepik 이미지 정보 추가
      visualAssets: freepikImage ? {
        imageUrl: freepikImage.imageUrl,
        thumbnailUrl: freepikImage.thumbnailUrl,
        freepikId: freepikImage.freepikId,
        tags: freepikImage.tags || [],
        searchQuery: freepikImage.searchQuery,
        status: freepikImage.status
      } : null,
      // CapCut용 추가 메타데이터
      capcut_metadata: {
        template_style: keywords.tone[0] || 'modern',
        color_scheme: getToneColorScheme(formData.tone),
        animation_type: scene.transition,
        text_style: getTargetAgeTextStyle(formData.targetAge)
      }
    };
  });

  return scenes;
};

/**
 * 톤에 따른 컬러 스키마 매핑
 */
const getToneColorScheme = (tone) => {
  const colorMap = {
    '감성적': 'warm_pastel',
    '전문적': 'corporate_blue',
    '유머러스': 'bright_colorful', 
    '고급스러운': 'elegant_gold',
    '친근한': 'natural_green',
    '역동적': 'energetic_red'
  };
  
  return colorMap[tone] || 'modern_gradient';
};

/**
 * 연령대에 따른 텍스트 스타일 매핑
 */
const getTargetAgeTextStyle = (targetAge) => {
  const textStyleMap = {
    '10대': 'playful_bold',
    '20대': 'trendy_modern',
    '30대': 'clean_professional',
    '40대': 'classic_readable', 
    '50대 이상': 'elegant_traditional'
  };
  
  return textStyleMap[targetAge] || 'modern_clean';
};

/**
 * Freepik 결과를 포함한 최종 JSON 생성 (영상 제작 완성본)
 */
export const generateFinalPrompt = (formData, freepikResults = null) => {
  const storyboard = generateStoryboard(formData, freepikResults);
  const keywords = mapToKeywords(formData, freepikResults);
  
  const finalPrompt = {
    // 프로젝트 메타데이터
    project_info: {
      brand_name: formData.brandName,
      target_audience: formData.targetAge,
      industry: formData.industry,
      tone: formData.tone,
      goal: formData.goal,
      created_at: new Date().toISOString(),
      version: "2.0_freepik_video_complete"
    },

    // Freepik 연동 정보 (비디오 + 이미지)
    freepik_integration: {
      status: freepikResults ? "completed" : "not_available",
      total_resources: freepikResults?.statistics?.successfulResources || 0,
      videos_count: freepikResults?.statistics?.videosFound || 0,
      images_count: freepikResults?.statistics?.imagesFound || 0,
      total_scenes: freepikResults?.statistics?.totalScenes || 6,
      api_provider: "Freepik API",
      video_segments: freepikResults?.videoResults?.map(video => ({
        scene_number: video.sceneNumber,
        video_url: video.videoUrl,
        duration: video.duration,
        resource_type: video.resourceType,
        freepik_id: video.sourceResource?.freepikId,
        thumbnail: video.sourceResource?.thumbnailUrl
      })) || []
    },

    // 최종 영상 정보
    final_video: {
      total_duration: freepikResults?.finalVideo?.totalDuration || 30,
      resolution: freepikResults?.finalVideo?.resolution || "1920x1080",
      segments_count: freepikResults?.videoResults?.length || 0,
      thumbnail: freepikResults?.finalVideo?.thumbnail,
      status: "ready_to_compile",
      note: "Individual video segments from Freepik ready for compilation"
    },

    // 개별 영상 세그먼트 목록
    video_segments: freepikResults?.videoResults?.map((video, index) => ({
      segment_id: video.id,
      scene_number: video.sceneNumber,
      video_url: video.videoUrl,
      duration: video.duration,
      resource_type: video.resourceType,
      source_info: {
        freepik_id: video.sourceResource?.freepikId,
        search_query: video.sourceResource?.searchQuery,
        title: video.sourceResource?.title,
        tags: video.sourceResource?.tags || []
      },
      editing_notes: {
        transition_in: index === 0 ? "fade_in" : "cross_fade",
        transition_out: index === (freepikResults.videoResults.length - 1) ? "fade_out" : "cross_fade",
        text_overlay: storyboard[index]?.title || `장면 ${video.sceneNumber}`,
        duration_target: video.duration
      }
    })) || [],

    // 스토리보드 (Freepik 자료 포함)
    storyboard: storyboard,

    // 키워드 및 스타일 가이드
    creative_direction: {
      primary_keywords: keywords.industry.concat(keywords.tone).slice(0, 8),
      secondary_keywords: keywords.targetAge.concat(keywords.goal),
      freepik_derived_keywords: keywords.freepikKeywords || [],
      visual_style: {
        color_palette: getToneColorScheme(formData.tone),
        typography: getTargetAgeTextStyle(formData.targetAge),
        pacing: formData.tone === '역동적' ? 'fast_cuts' : 'smooth_transitions',
        brand_consistency: formData.brandName ? 'maintain_brand_colors' : 'creative_freedom'
      }
    },

    // 후처리 가이드
    post_production: {
      compilation_tool: "FFmpeg or similar video editor",
      audio_guide: {
        background_music: getMusicGenreByToneAndAge(formData.tone, formData.targetAge),
        voice_over: formData.tone === '전문적' ? 'professional_narrator' : 'friendly_conversational',
        sound_effects: formData.tone === '유머러스' ? 'playful_sfx' : 'minimal_clean'
      },
      text_overlays: storyboard.map((scene, index) => ({
        scene: index + 1,
        text: scene.title,
        duration: 2,
        position: "bottom_center",
        style: getTargetAgeTextStyle(formData.targetAge)
      })),
      final_output: {
        format: "mp4",
        quality: "1080p",
        target_size: "under_100MB",
        duration: freepikResults?.finalVideo?.totalDuration || 30
      }
    }
  };

  // 콘솔에 JSON 출력 (개발용)
  console.log('=== Freepik 완전 통합 영상 제작 JSON ===');
  console.log(JSON.stringify(finalPrompt, null, 2));
  
  return finalPrompt;
};formData.tone),
        typography: getTargetAgeTextStyle(formData.targetAge),
        animation_style: formData.tone === '역동적' ? 'fast_dynamic' : 'smooth_elegant',
        brand_consistency: formData.brandName ? 'maintain_brand_colors' : 'creative_freedom'
      }
    },

    // CapCut 템플릿 추천
    recommended_templates: generateTemplateRecommendations(formData, keywords),

    // 음악 및 사운드 가이드
    audio_guide: {
      music_genre: getMusicGenreByToneAndAge(formData.tone, formData.targetAge),
      voice_over: formData.tone === '전문적' ? 'professional_narrator' : 'friendly_conversational',
      sound_effects: formData.tone === '유머러스' ? 'playful_sfx' : 'minimal_clean'
    },

    // API 호출 설정 (실제 CapCut API 연동용)
    api_integration: {
      status: "ready_for_capcut_api",
      endpoint: "CapCut API v2",
      note: "이 JSON 데이터를 CapCut API로 전송하여 실제 영상 생성",
      // TODO: 실제 CapCut API 호출 위치
      call_instructions: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer CAPCUT_API_KEY"
        },
        payload: "이 전체 JSON 객체를 payload로 전송"
      }
    }
  };

  // 콘솔에 JSON 출력 (개발용)
  console.log('=== Freepik 통합 CapCut JSON 프롬프트 ===');
  console.log(JSON.stringify(finalPrompt, null, 2));
  
  return finalPrompt;
};

/**
 * CapCut 템플릿 추천 로직
 */
const generateTemplateRecommendations = (formData, keywords) => {
  const templates = [];
  
  // 업종별 템플릿 추천
  if (formData.industry === 'IT/소프트웨어') {
    templates.push('tech_showcase', 'app_demo', 'digital_transformation');
  } else if (formData.industry === '패션/뷰티') {
    templates.push('lifestyle_showcase', 'beauty_transformation', 'fashion_lookbook');
  } else if (formData.industry === '식품/음료') {
    templates.push('food_showcase', 'recipe_style', 'taste_experience');
  }
  
  // 톤별 템플릿 추천
  if (formData.tone === '역동적') {
    templates.push('dynamic_sports', 'energy_burst', 'action_packed');
  } else if (formData.tone === '고급스러운') {
    templates.push('luxury_elegant', 'premium_showcase', 'sophisticated_brand');
  }
  
  return templates.slice(0, 3); // 최대 3개 추천
};

/**
 * 톤과 연령대에 따른 음악 장르 추천
 */
const getMusicGenreByToneAndAge = (tone, targetAge) => {
  if (tone === '역동적' && (targetAge === '10대' || targetAge === '20대')) {
    return 'upbeat_electronic';
  } else if (tone === '감성적') {
    return 'emotional_piano';
  } else if (tone === '전문적') {
    return 'corporate_ambient';
  } else if (tone === '유머러스') {
    return 'playful_quirky';
  } else if (tone === '고급스러운') {
    return 'classical_elegant';
  }
  
  return 'modern_background';
};

// CapCut API 호출 함수 제거 - Freepik만 사용
// 대신 비디오 편집 가이드 함수 추가

/**
 * Freepik 비디오 세그먼트들을 하나의 영상으로 합치는 가이드 생성
 */
export const generateVideoCompilationGuide = (freepikResults) => {
  if (!freepikResults || !freepikResults.videoResults) {
    return null;
  }

  return {
    tool_recommendations: [
      "FFmpeg (command line)",
      "Adobe Premiere Pro",
      "DaVinci Resolve (free)",
      "OpenShot (free)"
    ],
    ffmpeg_command: generateFFmpegCommand(freepikResults.videoResults),
    timeline: freepikResults.videoResults.map((video, index) => ({
      start_time: freepikResults.videoResults.slice(0, index).reduce((sum, v) => sum + v.duration, 0),
      end_time: freepikResults.videoResults.slice(0, index + 1).reduce((sum, v) => sum + v.duration, 0),
      source_file: video.videoUrl,
      scene_title: video.sourceResource?.title || `장면 ${video.sceneNumber}`
    }))
  };
};

/**
 * FFmpeg 명령어 생성
 */
const generateFFmpegCommand = (videoResults) => {
  const inputs = videoResults.map((video, index) => 
    `-i "${video.videoUrl || 'placeholder.mp4'}"`
  ).join(' ');
  
  const filter = videoResults.map((_, index) => `[${index}:v]`).join('') + 
    `concat=n=${videoResults.length}:v=1:a=1[outv][outa]`;
  
  return `ffmpeg ${inputs} -filter_complex "${filter}" -map "[outv]" -map "[outa]" final_video.mp4`;
};

export default {
  mapToKeywords,
  generateStoryboard, 
  generateFinalPrompt,
  generateVideoCompilationGuide
};
// src/storyboardService.js
// Freepik API를 사용한 이미지 생성 및 스토리보드 처리 서비스

const FREEPIK_API_KEY = process.env.REACT_APP_FREEPIK_API_KEY;
const FREEPIK_API_BASE_URL = 'https://api.freepik.com/v1';

/**
 * 사용자 입력을 바탕으로 Freepik API를 통해 이미지를 검색하고 스토리보드를 생성
 * @param {Object} userInput - 사용자 입력 데이터
 * @param {Function} progressCallback - 진행 상황 업데이트 콜백 함수
 * @returns {Object} 생성된 이미지와 비디오 결과
 */
const processVideoCreation = async (userInput, progressCallback) => {
  try {
    // 1. 초기 설정 및 진행 상황 업데이트
    progressCallback({ 
      phase: 'setup', 
      completed: 10, 
      total: 100, 
      message: 'Freepik API를 통한 이미지 검색을 시작합니다...' 
    });

    // API 키 확인
    if (!FREEPIK_API_KEY) {
      throw new Error('Freepik API 키가 설정되지 않았습니다. 환경변수 REACT_APP_FREEPIK_API_KEY를 확인해주세요.');
    }

    // 입력 데이터 검증
    if (!userInput || !userInput.brandName) {
      throw new Error('필수 입력 데이터가 누락되었습니다.');
    }

    const imageResults = [];
    const videoResults = [];
    
    // 6개의 스토리보드 장면 생성 (프로젝트 기본 구조에 맞춤)
    const numScenes = 6;
    const searchQueries = generateSearchQueries(userInput, numScenes);

    // 2. 각 장면별 이미지 검색 및 다운로드
    for (let i = 0; i < numScenes; i++) {
      const currentProgress = 10 + ((i + 1) / numScenes) * 70;
      
      progressCallback({ 
        phase: 'images', 
        completed: currentProgress, 
        total: 100, 
        message: `장면 ${i + 1}/${numScenes}: "${searchQueries[i]}" 이미지 검색 중...` 
      });

      try {
        // Freepik API 비디오 검색 (우선순위)
        let searchResponse = await searchFreepikVideos(searchQueries[i]);
        let resourceType = 'video';
        
        // 비디오가 없으면 이미지로 대체
        if (!searchResponse || !searchResponse.data || searchResponse.data.length === 0) {
          console.log(`장면 ${i + 1}: 비디오가 없어 이미지로 대체합니다.`);
          searchResponse = await searchFreepikImages(searchQueries[i]);
          resourceType = 'image';
        }
        
        if (searchResponse && searchResponse.data && searchResponse.data.length > 0) {
          const selectedResource = searchResponse.data[0];
          
          const result = {
            id: `scene-${i + 1}`,
            sceneNumber: i + 1,
            searchQuery: searchQueries[i],
            resourceType: resourceType,
            // 비디오 우선, 없으면 이미지
            videoUrl: resourceType === 'video' ? selectedResource.video?.url : null,
            imageUrl: resourceType === 'image' ? selectedResource.image?.url : selectedResource.video?.thumbnail_url,
            thumbnailUrl: selectedResource.thumbnail_url || selectedResource.image?.thumbnail_url,
            title: selectedResource.title || `장면 ${i + 1}`,
            tags: selectedResource.tags || [],
            freepikId: selectedResource.id,
            duration: resourceType === 'video' ? (selectedResource.video?.duration || 5) : 5,
            status: 'completed'
          };

          imageResults.push(result);

          // 비디오 세그먼트 정보 생성
          const videoResult = {
            id: `video-${i + 1}`,
            sceneNumber: i + 1,
            sourceResource: result,
            videoUrl: result.videoUrl || result.imageUrl, // 비디오 우선, 없으면 이미지
            duration: result.duration,
            resourceType: result.resourceType,
            status: 'completed'
          };

          videoResults.push(videoResult);

        } else {
          console.warn(`장면 ${i + 1}에 대한 적절한 자료를 찾지 못했습니다:`, searchQueries[i]);
          
          // 기본 플레이스홀더 결과 사용
          const placeholderResult = {
            id: `scene-${i + 1}`,
            sceneNumber: i + 1,
            searchQuery: searchQueries[i],
            resourceType: 'none',
            videoUrl: null,
            imageUrl: null,
            thumbnailUrl: null,
            title: `장면 ${i + 1} (자료 없음)`,
            tags: [],
            freepikId: null,
            duration: 5,
            status: 'no_resource_found',
            error: 'No suitable video or image found'
          };

          imageResults.push(placeholderResult);
        }

      } catch (error) {
        console.error(`장면 ${i + 1} 자료 검색 중 오류:`, error);
        
        // 오류 상황에 대한 결과 추가
        imageResults.push({
          id: `scene-${i + 1}`,
          sceneNumber: i + 1,
          searchQuery: searchQueries[i],
          resourceType: 'error',
          videoUrl: null,
          imageUrl: null,
          duration: 5,
          status: 'error',
          error: error.message
        });
      }

      // 잠시 대기 (API 레이트 리미팅 방지)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 3. 최종 결과 준비
    progressCallback({ 
      phase: 'compilation', 
      completed: 90, 
      total: 100, 
      message: '스토리보드 생성 완료. 최종 데이터를 준비 중...' 
    });

    // 성공적으로 생성된 자료 개수 계산
    const successfulResources = imageResults.filter(item => item.status === 'completed').length;
    const totalDuration = videoResults.reduce((sum, video) => sum + video.duration, 0);

    const finalResult = {
      success: true,
      imageResults,
      videoResults,
      statistics: {
        totalScenes: numScenes,
        successfulResources,
        failedResources: numScenes - successfulResources,
        searchQueries: searchQueries,
        videosFound: videoResults.filter(v => v.resourceType === 'video').length,
        imagesFound: videoResults.filter(v => v.resourceType === 'image').length
      },
      finalVideo: {
        url: null, // Freepik에서는 개별 비디오 세그먼트만 제공
        totalDuration: totalDuration,
        resolution: '1920x1080',
        segments: videoResults.length,
        thumbnail: imageResults.find(item => item.imageUrl || item.videoUrl)?.thumbnailUrl || null,
        status: 'segments_ready', // 개별 세그먼트 준비 완료
        note: 'Freepik provides individual video segments. Use external tool for final compilation.'
      },
      metadata: {
        brandName: userInput.brandName,
        targetAge: userInput.targetAge,
        industry: userInput.industry,
        tone: userInput.tone,
        goal: userInput.goal,
        createdAt: new Date().toISOString(),
        apiProvider: 'Freepik'
      }
    };

    progressCallback({ 
      phase: 'completed', 
      completed: 100, 
      total: 100, 
      message: `Freepik 자료 생성 완료! ${successfulResources}/${numScenes} 자료 생성 성공` 
    });

    return finalResult;

  } catch (error) {
    console.error('스토리보드 생성 중 전체 오류:', error);
    
    progressCallback({ 
      phase: 'error', 
      completed: 0, 
      total: 100, 
      message: `오류 발생: ${error.message}` 
    });

    return {
      success: false,
      error: error.message,
      imageResults: [],
      videoResults: [],
      finalVideo: null
    };
  }
};

/**
 * Freepik API를 통한 이미지 검색 (비디오가 없을 때 대체용)
 * @param {string} query - 검색 쿼리
 * @returns {Object} 검색 결과
 */
const searchFreepikImages = async (query) => {
  const searchUrl = `${FREEPIK_API_BASE_URL}/resources`;
  
  const params = new URLSearchParams({
    locale: 'ko-KR',
    page: 1,
    limit: 3,
    order: 'latest',
    orientation: 'horizontal', // 비디오에 적합한 가로 이미지
    'filters[content_type]': 'photo', // 이미지만 검색
    query: query
  });

  const response = await fetch(`${searchUrl}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'X-Freepik-API-Key': FREEPIK_API_KEY, // 일관된 헤더명 사용
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Freepik 이미지 검색 실패 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data;
};

/**
 * 사용자 입력을 기반으로 각 장면별 검색 쿼리 생성
 * @param {Object} userInput - 사용자 입력 데이터
 * @param {number} numScenes - 생성할 장면 수
 * @returns {Array<string>} 검색 쿼리 배열
 */
const generateSearchQueries = (userInput, numScenes) => {
  const baseKeywords = [
    userInput.brandName || '',
    getIndustryKeywords(userInput.industry),
    getToneKeywords(userInput.tone),
    getTargetAgeKeywords(userInput.targetAge),
    getGoalKeywords(userInput.goal)
  ].filter(Boolean);

  // 기본 장면 구조 (6장면 기준)
  const sceneTemplates = [
    'product showcase introduction', // 제품 소개
    'lifestyle usage scene', // 라이프스타일 사용 장면
    'close up product detail', // 제품 디테일
    'user satisfaction happy', // 사용자 만족
    'brand logo professional', // 브랜드 로고
    'call to action purchase' // 행동 유도
  ];

  const queries = [];
  for (let i = 0; i < numScenes; i++) {
    const template = sceneTemplates[i] || 'product advertisement';
    const keywords = [...baseKeywords, template].join(' ');
    queries.push(keywords.trim());
  }

  return queries;
};

/**
 * 업종에 따른 키워드 매핑
 */
const getIndustryKeywords = (industry) => {
  const industryMap = {
    'IT/소프트웨어': 'technology digital software',
    '패션/뷰티': 'fashion beauty cosmetics',
    '식품/음료': 'food beverage culinary',
    '자동차': 'automotive car vehicle',
    '부동산': 'real estate property house',
    '금융': 'finance banking money',
    '교육': 'education learning study',
    '헬스케어': 'healthcare medical health',
    '여행/레저': 'travel leisure vacation',
    '스포츠': 'sports fitness exercise'
  };
  
  return industryMap[industry] || 'business commercial';
};

/**
 * 광고 톤에 따른 키워드 매핑
 */
const getToneKeywords = (tone) => {
  const toneMap = {
    '감성적': 'emotional heartwarming touching',
    '전문적': 'professional corporate business',
    '유머러스': 'fun playful cheerful',
    '고급스러운': 'luxury premium elegant',
    '친근한': 'friendly casual approachable',
    '역동적': 'dynamic energetic active'
  };
  
  return toneMap[tone] || 'modern contemporary';
};

/**
 * 타겟 연령대에 따른 키워드 매핑
 */
const getTargetAgeKeywords = (targetAge) => {
  const ageMap = {
    '10대': 'teenager young student',
    '20대': 'young adult millennial',
    '30대': 'adult professional working',
    '40대': 'mature adult family',
    '50대 이상': 'senior mature experienced'
  };
  
  return ageMap[targetAge] || 'adult person';
};

/**
 * 광고 목표에 따른 키워드 매핑
 */
const getGoalKeywords = (goal) => {
  const goalMap = {
    '브랜드 인지도 향상': 'brand awareness recognition',
    '제품 판매 증진': 'sales promotion purchase',
    '신제품 출시': 'new product launch introduction',
    '고객 유치': 'customer acquisition new user',
    '브랜드 이미지 개선': 'brand image improvement'
  };
  
  return goalMap[goal] || 'marketing advertisement';
};

/**
 * Freepik API를 통한 비디오 검색
 * @param {string} query - 검색 쿼리
 * @returns {Object} 검색 결과
 */
const searchFreepikVideos = async (query) => {
  const searchUrl = `${FREEPIK_API_BASE_URL}/resources`;
  
  const params = new URLSearchParams({
    locale: 'ko-KR',
    page: 1,
    limit: 3, // 비디오 옵션 중 선택
    order: 'latest',
    'filters[content_type]': 'video', // 비디오만 검색
    query: query
  });

  const response = await fetch(`${searchUrl}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'X-Freepik-API-Key': FREEPIK_API_KEY, // 일관된 헤더명 사용
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Freepik 비디오 검색 실패 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data;
};

export default { processVideoCreation };
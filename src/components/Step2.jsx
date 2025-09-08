import { useState } from 'react';
import PropTypes from 'prop-types';

const Spinner = () => (
  <div className="flex flex-col justify-center items-center text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600"></div>
    <p className="mt-4 text-lg text-gray-700 mt-4">
      Freepik API를 통해 그룹별 이미지를 가져오는 중입니다.
    </p>
    <p className="text-sm text-gray-500 mt-2">
      잠시만 기다려주세요. 각 스타일별로 이미지를 검색하고 있습니다.
    </p>
  </div>
);

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);

  const createStyledPrompts = async () => {
    try {
      const response = await fetch('./input_prompt.txt');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const basePromptTemplate = await response.text();

      const userInputString = 
        `- 브랜드명: ${formData.brandName}
         - 산업 카테고리: ${formData.industryCategory}
         - 제품/서비스: ${formData.productServiceName || '일반'}
         - 영상 목적: ${formData.videoPurpose}
         - 영상 길이: ${formData.videoLength}
         - 핵심 타겟: ${formData.coreTarget}
         - 핵심 차별점: ${formData.coreDifferentiation}
         - 브랜드 로고: ${formData.brandLogo ? '업로드됨' : '없음'}
         - 제품 이미지: ${formData.productImage ? '업로드됨' : '없음'}`;

      const basePrompt = basePromptTemplate.replace('{userInput}', userInputString);

      const visualStyles = [
        {
          name: 'Cinematic Professional',
          description: 'cinematic professional shot dramatic lighting high detail 8k corporate',
          searchTerms: ['cinematic', 'professional', 'corporate', 'high quality', 'business'],
          demoSeed: 'cinematic-professional'
        },
        {
          name: 'Modern Minimalist',
          description: 'minimalist modern clean background simple composition contemporary',
          searchTerms: ['minimalist', 'clean', 'simple', 'modern', 'contemporary'],
          demoSeed: 'minimalist-clean'
        },
        {
          name: 'Vibrant Dynamic',
          description: 'vibrant energetic dynamic motion bright colors active lifestyle',
          searchTerms: ['vibrant', 'energetic', 'colorful', 'dynamic', 'active'],
          demoSeed: 'vibrant-colorful'
        },
        {
          name: 'Natural Lifestyle',
          description: 'natural lifestyle photorealistic everyday life authentic people',
          searchTerms: ['natural', 'lifestyle', 'realistic', 'people', 'authentic'],
          demoSeed: 'natural-lifestyle'
        },
        {
          name: 'Premium Luxury',
          description: 'luxury premium elegant sophisticated high-end exclusive',
          searchTerms: ['luxury', 'premium', 'elegant', 'sophisticated', 'exclusive'],
          demoSeed: 'luxury-premium'
        },
        {
          name: 'Tech Innovation',
          description: 'technology innovation futuristic digital modern tech startup',
          searchTerms: ['technology', 'innovation', 'digital', 'tech', 'futuristic'],
          demoSeed: 'tech-innovation'
        }
      ];

      return visualStyles.map(style => ({
        style: style.name,
        prompt: `${basePrompt}\n\n### Visual Style Guidelines\n- Style: ${style.description}`,
        searchTerms: style.searchTerms,
        demoSeed: style.demoSeed
      }));
    } catch (e) {
      console.error("프롬프트 생성 중 오류:", e);
      throw new Error(`프롬프트 템플릿 파일을 불러오는 데 실패했습니다: ${e.message}`);
    }
  };

  // 개선된 검색어 생성 함수
  const generateSearchQuery = (formData, style) => {
    const industryMap = {
      '뷰티': 'beauty cosmetics skincare wellness',
      '푸드': 'food restaurant cuisine culinary',
      '게임': 'gaming technology entertainment digital',
      '테크': 'technology business innovation startup',
      '커피': 'coffee shop cafe lifestyle',
      '패션': 'fashion style clothing apparel',
      '여행': 'travel vacation tourism adventure',
      '헬스': 'fitness health wellness exercise',
      '금융': 'finance banking business money',
      '교육': 'education learning study academic'
    };

    const purposeMap = {
      '브랜드 인지도 강화': 'brand awareness marketing campaign',
      '구매 전환': 'sales conversion product showcase',
      '신제품 출시': 'product launch new release',
      '이벤트 홍보': 'event promotion marketing'
    };

    // 기본 검색어 구성
    const industryTerms = industryMap[formData.industryCategory] || 'business product';
    const purposeTerms = purposeMap[formData.videoPurpose] || 'marketing advertisement';
    const styleTerms = style.searchTerms.join(' ');
    
    // 브랜드명이나 제품명이 있으면 포함
    const brandTerms = [formData.brandName, formData.productServiceName]
      .filter(Boolean)
      .join(' ');

    // 최종 검색어 조합 (너무 길지 않게)
    const searchTerms = [industryTerms, styleTerms, purposeTerms]
      .filter(Boolean)
      .join(' ')
      .split(' ')
      .slice(0, 8) // 최대 8개 키워드
      .join(' ');

    return searchTerms.trim();
  };

  // 개선된 Freepik API 호출 함수
  const fetchImagesFromFreepik = async (searchQuery, count = 5) => {
    try {
      console.log('=== Freepik API 호출 시작 ===');
      console.log('검색어:', searchQuery);
      console.log('요청 이미지 수:', count);
      
      // 현재 도메인에 맞는 API 엔드포인트 구성
      const isProduction = window.location.hostname !== 'localhost';
      const apiBase = isProduction ? window.location.origin : 'http://localhost:3000';
      const endpoint = `${apiBase}/api/freepik-proxy`;
      
      console.log('API 엔드포인트:', endpoint);

      const requestBody = {
        searchQuery: searchQuery.trim(),
        count: Math.min(Math.max(1, count), 10) // 1-10 사이로 제한
      };

      console.log('요청 본문:', requestBody);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      console.log('응답 상태:', response.status);
      console.log('응답 헤더:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API 응답 오류:', errorText);
        
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch (e) {
          // JSON 파싱 실패시 원본 텍스트 사용
        }
        
        throw new Error(`API 호출 실패: ${errorMessage}`);
      }

      const data = await response.json();
      console.log('API 응답 데이터:', data);
      
      if (data.success && data.images && Array.isArray(data.images) && data.images.length > 0) {
        const validImages = data.images.filter(img => img.url);
        console.log(`성공: ${validImages.length}개 유효한 이미지 발견`);
        
        return validImages.map(img => ({
          id: img.id || Math.random().toString(36).substr(2, 9),
          url: img.url,
          thumbnail: img.thumbnail || img.url,
          title: img.title || 'Freepik Image',
          tags: img.tags || [],
          premium: img.premium || false
        }));
      } else {
        console.log('이미지 없음 또는 실패:', data);
        throw new Error(data.error || 'No valid images found');
      }
    } catch (error) {
      console.error('fetchImagesFromFreepik 오류:', error);
      throw error;
    }
  };

  // 대체 이미지 생성 함수 (더 많은 옵션)
  const generateFallbackImages = (style, count = 5) => {
    const fallbackSets = {
      'Cinematic Professional': [
        'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&q=80',
        'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
        'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80'
      ],
      'Modern Minimalist': [
        'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80'
      ],
      'Vibrant Dynamic': [
        'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800&q=80',
        'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80',
        'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&q=80'
      ]
    };

    const defaultImages = [
      'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&q=80',
      'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
      'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80',
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80'
    ];

    const images = fallbackSets[style] || defaultImages;
    return images.slice(0, count).map((url, index) => ({
      id: `fallback-${style}-${index}`,
      url: url,
      thumbnail: url,
      title: `${style} 대체 이미지 ${index + 1}`,
      tags: ['fallback', style.toLowerCase()],
      premium: false,
      isFallback: true
    }));
  };

  // 스타일별 이미지 처리 함수
  const processStyleWithImages = async (stylePrompt) => {
    const searchQuery = generateSearchQuery(formData, stylePrompt);
    
    try {
      console.log(`"${stylePrompt.style}" 스타일 처리 시작...`);
      const images = await fetchImagesFromFreepik(searchQuery, 5);
      
      return {
        ...stylePrompt,
        images,
        searchQuery,
        status: 'success',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`"${stylePrompt.style}" API 호출 실패:`, error.message);
      
      // 대체 이미지 사용
      const fallbackImages = generateFallbackImages(stylePrompt.style, 5);
      return {
        ...stylePrompt,
        images: fallbackImages,
        searchQuery,
        status: 'fallback_used',
        error: error.message,
        usedFallback: true,
        timestamp: new Date().toISOString()
      };
    }
  };

  const handleGenerateStoryboard = async () => {
    setIsLoading(true);
    setError(null);
    setDebugInfo(null);

    try {
      console.log('=== 스토리보드 생성 시작 ===');
      console.log('사용자 폼 데이터:', formData);

      const styledPrompts = await createStyledPrompts();
      console.log('생성된 스타일 프롬프트:', styledPrompts.length);

      const processedPrompts = [];
      let successCount = 0;
      let fallbackCount = 0;

      for (let i = 0; i < styledPrompts.length; i++) {
        const stylePrompt = styledPrompts[i];
        console.log(`\n=== 스타일 ${i+1}/${styledPrompts.length}: "${stylePrompt.style}" ===`);
        
        try {
          const processedStyle = await processStyleWithImages(stylePrompt);
          processedPrompts.push(processedStyle);
          
          if (processedStyle.status === 'success') {
            successCount++;
          } else {
            fallbackCount++;
          }
          
          console.log(`"${stylePrompt.style}" 완료 - 상태: ${processedStyle.status}, 이미지: ${processedStyle.images.length}개`);
        } catch (error) {
          console.error(`"${stylePrompt.style}" 처리 중 오류:`, error);
          
          // 완전 실패 케이스
          processedPrompts.push({
            ...stylePrompt,
            images: [],
            searchQuery: generateSearchQuery(formData, stylePrompt),
            status: 'failed',
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }

        // API 호출 간격 조정
        if (i < styledPrompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
        }
      }

      // 디버그 정보 설정
      setDebugInfo({
        totalStyles: styledPrompts.length,
        successCount,
        fallbackCount,
        failedCount: styledPrompts.length - successCount - fallbackCount,
        timestamp: new Date().toISOString()
      });

      console.log('\n=== 최종 결과 ===');
      console.log(`성공: ${successCount}, 대체: ${fallbackCount}, 실패: ${styledPrompts.length - successCount - fallbackCount}`);
      
      setStoryboard(processedPrompts);
      
      // 결과에 관계없이 다음 단계로 진행
      onNext();
      
    } catch (error) {
      console.error('전체 스토리보드 생성 실패:', error);
      setError(`스토리보드 생성 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <Spinner />
        {debugInfo && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">처리 현황</h4>
            <div className="text-sm text-blue-700">
              <p>성공: {debugInfo.successCount}개</p>
              <p>대체 이미지 사용: {debugInfo.fallbackCount}개</p>
              <p>실패: {debugInfo.failedCount}개</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">
        2단계: 스토리보드 생성
      </h2>

      <div className="bg-blue-50 p-6 rounded-lg mb-8">
        <h3 className="text-xl font-semibold mb-4 text-blue-800">입력된 정보 요약</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><strong>브랜드명:</strong> {formData.brandName}</div>
          <div><strong>산업 카테고리:</strong> {formData.industryCategory}</div>
          <div><strong>제품/서비스:</strong> {formData.productServiceName || '일반'}</div>
          <div><strong>영상 목적:</strong> {formData.videoPurpose}</div>
          <div><strong>영상 길이:</strong> {formData.videoLength}</div>
          <div><strong>핵심 타겟:</strong> {formData.coreTarget}</div>
          <div className="md:col-span-2"><strong>핵심 차별점:</strong> {formData.coreDifferentiation}</div>
        </div>
      </div>

      <div className="text-center mb-8">
        <p className="text-lg text-gray-700 mb-4">
          입력하신 정보를 바탕으로 6가지 스타일의 스토리보드를 생성합니다.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          각 스타일별로 Freepik API를 통해 관련 이미지를 수집하며, API 실패시 고품질 대체 이미지를 제공합니다.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <strong>오류 발생:</strong>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onPrev}
          className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="current

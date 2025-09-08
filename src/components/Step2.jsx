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
          searchTerms: ['business', 'professional', 'corporate'],
          demoSeed: 'cinematic-professional'
        },
        {
          name: 'Modern Minimalist',
          description: 'minimalist modern clean background simple composition contemporary',
          searchTerms: ['minimalist', 'clean', 'modern'],
          demoSeed: 'minimalist-clean'
        },
        {
          name: 'Vibrant Dynamic',
          description: 'vibrant energetic dynamic motion bright colors active lifestyle',
          searchTerms: ['colorful', 'energetic', 'dynamic'],
          demoSeed: 'vibrant-colorful'
        },
        {
          name: 'Natural Lifestyle',
          description: 'natural lifestyle photorealistic everyday life authentic people',
          searchTerms: ['lifestyle', 'natural', 'people'],
          demoSeed: 'natural-lifestyle'
        },
        {
          name: 'Premium Luxury',
          description: 'luxury premium elegant sophisticated high-end exclusive',
          searchTerms: ['luxury', 'premium', 'elegant'],
          demoSeed: 'luxury-premium'
        },
        {
          name: 'Tech Innovation',
          description: 'technology innovation futuristic digital modern tech startup',
          searchTerms: ['technology', 'digital', 'innovation'],
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

  // 간단한 검색어 생성 함수
  const generateSearchQuery = (formData, style) => {
    // 기본 산업 키워드
    const industryKeywords = {
      '뷰티': 'beauty',
      '푸드': 'food',
      '게임': 'gaming',
      '테크': 'technology',
      '커피': 'coffee',
      '패션': 'fashion',
      '여행': 'travel',
      '헬스': 'fitness',
      '금융': 'business',
      '교육': 'education'
    };

    const industryTerm = industryKeywords[formData.industryCategory] || 'business';
    const styleTerm = style.searchTerms[0] || 'professional';
    
    // 간단한 검색어로 구성 (너무 복잡하지 않게)
    return `${industryTerm} ${styleTerm}`;
  };

  // Freepik API 호출 함수 (단순화)
  const fetchImagesFromFreepik = async (searchQuery, count = 5) => {
    try {
      console.log('=== Freepik API 호출 ===');
      console.log('검색어:', searchQuery);
      
      // const endpoint = '/api/freepik-proxy';
      const endpoint = `/api/freepik/search?searchQuery=${encodeURIComponent(searchQuery)}&count=${count}`;
      console.log('엔드포인트:', endpoint);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'x-freepik-api-key': process.env.REACT_APP_FREEPIK_API_KEY // 또는 사용자 입력값
        }
      });

      console.log('응답 상태:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API 오류 응답:', errorText);
        throw new Error(`API 호출 실패: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('API 응답:', data);
      
      if (data.success && data.images && data.images.length > 0) {
        return data.images.map(img => ({
          id: img.id,
          url: img.url,
          thumbnail: img.thumbnail || img.url,
          title: img.title,
          tags: img.tags || []
        }));
      } else {
        throw new Error('이미지를 찾을 수 없습니다');
      }
    } catch (error) {
      console.error('API 호출 오류:', error);
      throw error;
    }
  };

  // 대체 이미지 생성 함수
  const generateFallbackImages = (style, count = 5) => {
    const unsplashImages = [
      'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&q=80',
      'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
      'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80',
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80'
    ];

    return unsplashImages.slice(0, count).map((url, index) => ({
      id: `fallback-${style}-${index}`,
      url: url,
      thumbnail: url,
      title: `${style} 대체 이미지 ${index + 1}`,
      tags: ['fallback'],
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
        status: 'success'
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
        usedFallback: true
      };
    }
  };

  const handleGenerateStoryboard = async () => {
    setIsLoading(true);
    setError(null);
    setDebugInfo(null);

    try {
      console.log('=== 스토리보드 생성 시작 ===');
      
      const styledPrompts = await createStyledPrompts();
      const processedPrompts = [];
      let successCount = 0;
      let fallbackCount = 0;

      for (let i = 0; i < styledPrompts.length; i++) {
        const stylePrompt = styledPrompts[i];
        console.log(`\n=== 스타일 ${i+1}/${styledPrompts.length}: "${stylePrompt.style}" ===`);
        
        const processedStyle = await processStyleWithImages(stylePrompt);
        processedPrompts.push(processedStyle);
        
        if (processedStyle.status === 'success') {
          successCount++;
        } else {
          fallbackCount++;
        }
        
        console.log(`"${stylePrompt.style}" 완료: ${processedStyle.images.length}개 이미지`);

        // API 호출 간격 조정 (1초 대기)
        if (i < styledPrompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setDebugInfo({
        totalStyles: styledPrompts.length,
        successCount,
        fallbackCount,
        failedCount: 0
      });

      console.log(`\n=== 최종 결과: 성공 ${successCount}, 대체 ${fallbackCount} ===`);
      
      setStoryboard(processedPrompts);
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
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          이전 단계
        </button>
        <button
          onClick={handleGenerateStoryboard}
          disabled={isLoading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              생성 중...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              스토리보드 생성
            </>
          )}
        </button>
      </div>
    </div>
  );
};

Step2.propTypes = {
  onNext: PropTypes.func.isRequired,
  onPrev: PropTypes.func.isRequired,
  formData: PropTypes.object.isRequired,
  setStoryboard: PropTypes.func.isRequired,
  setIsLoading: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired
};

export default Step2;

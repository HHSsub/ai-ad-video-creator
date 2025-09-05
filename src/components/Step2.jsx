import { useState } from 'react';
import PropTypes from 'prop-types';

const Spinner = () => (
  <div className="flex flex-col justify-center items-center text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    <p className="ml-4 text-lg text-gray-700 mt-4">
      Vercel API를 통해 Freepik에서 고품질 이미지를 가져오고 있습니다.
    </p>
    <p className="text-sm text-gray-500 mt-2">
      서버리스 함수로 CORS 문제없이 안전하게 처리됩니다.
    </p>
  </div>
);

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [error, setError] = useState(null);

  const createStyledPrompts = async () => {
    try {
      const response = await fetch('./input_prompt.txt'); 
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const basePromptTemplate = await response.text();

      const userInputString = `
        - 브랜드명: ${formData.brandName}
        - 산업 카테고리: ${formData.industryCategory}
        - 제품/서비스 카테고리: ${formData.productServiceCategory}
        - 제품명/서비스명: ${formData.productServiceName || '없음'}
        - 영상 목적: ${formData.videoPurpose}
        - 영상 길이: ${formData.videoLength}
        - 핵심 타겟: ${formData.coreTarget}
        - 핵심 차별점: ${formData.coreDifferentiation}
        - 영상요구사항: ${formData.videoRequirements || '없음'}
        - 브랜드 로고: ${formData.brandLogo ? '업로드됨' : '없음'}
        - 제품 이미지: ${formData.productImage ? '업로드됨' : '없음'}
      `;
      const basePrompt = basePromptTemplate.replace('{userInput}', userInputString);

      const visualStyles = [
        { 
          name: 'Cinematic', 
          description: 'cinematic shot dramatic lighting high detail 8k',
          searchTerms: ['cinematic', 'dramatic', 'professional', 'high quality'],
          demoSeed: 'cinematic-professional'
        },
        { 
          name: 'Minimalist', 
          description: 'minimalist style clean background simple composition',
          searchTerms: ['minimalist', 'clean', 'simple', 'modern'],
          demoSeed: 'minimalist-clean'
        },
        { 
          name: 'Vibrant and Energetic', 
          description: 'vibrant energetic dynamic motion bright colors',
          searchTerms: ['vibrant', 'energetic', 'colorful', 'dynamic'],
          demoSeed: 'vibrant-colorful'
        },
        { 
          name: 'Photorealistic', 
          description: 'photorealistic DSLR camera sharp focus natural lighting',
          searchTerms: ['realistic', 'professional', 'photography', 'natural'],
          demoSeed: 'realistic-photo'
        },
        { 
          name: 'Vintage', 
          description: 'vintage film retro color palette grainy texture 1980s',
          searchTerms: ['vintage', 'retro', '1980s', 'classic'],
          demoSeed: 'vintage-retro'
        },
        { 
          name: 'Futuristic', 
          description: 'futuristic sleek neon lights metallic textures high-tech',
          searchTerms: ['futuristic', 'modern', 'technology', 'sleek'],
          demoSeed: 'futuristic-tech'
        },
      ];

      return visualStyles.map(style => ({
        style: style.name,
        prompt: `${basePrompt}\n\n### Visual Style Guideline\n- Style: ${style.description}`,
        searchTerms: style.searchTerms,
        demoSeed: style.demoSeed
      }));

    } catch (e) {
      console.error("프롬프트 생성 중 오류:", e);
      throw new Error('프롬프트 템플릿 파일(input_prompt.txt)을 불러오는 데 실패했습니다.');
    }
  };

  // 검색어 생성 함수 (영어로 최적화)
  const generateSearchQuery = (formData, style) => {
    const industryMap = {
      '뷰티': 'beauty cosmetics',
      '푸드': 'food restaurant cuisine',
      '게임': 'gaming technology entertainment',
      '테크': 'technology business innovation',
      '카페': 'coffee shop cafe',
      '패션': 'fashion style clothing',
      '여행': 'travel vacation tourism',
      '헬스': 'fitness health wellness'
    };

    const productMap = {
      '스킨케어': 'skincare beauty product',
      '배달음식': 'food delivery service',
      '모바일게임': 'mobile gaming app',
      '클라우드서비스': 'cloud technology service',
      '원두커피': 'coffee beans premium'
    };

    const industry = industryMap[formData.industryCategory] || formData.industryCategory || 'business';
    const product = productMap[formData.productServiceCategory] || formData.productServiceCategory || 'product';
    const styleKeywords = style.searchTerms.slice(0, 2).join(' ');

    // 더 구체적이고 효과적인 검색어 조합
    return `${industry} ${product} ${styleKeywords} commercial advertisement marketing`.replace(/\s+/g, ' ').trim();
  };

  // Vercel API Route를 통한 Freepik API 호출
  const fetchFreepikThroughVercel = async (searchQuery, count = 5) => {
    try {
      // 현재 도메인 감지 (로컬 개발 vs 배포 환경)
      const apiUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000/api/freepik-proxy'
        : '/api/freepik-proxy';

      console.log(`API 호출: ${apiUrl}`);
      console.log(`검색어: ${searchQuery}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchQuery: searchQuery,
          count: count
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API 오류: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'API 호출 실패');
      }

      return result.images || [];

    } catch (error) {
      console.error('Vercel API 호출 오류:', error);
      throw error;
    }
  };

  // 데모 이미지 생성 (API 실패 시 대체)
  const generateFallbackImages = (searchQuery, count) => {
    const keywords = searchQuery.split(' ').slice(0, 2).join('-');
    const timestamp = Date.now();
    
    return Array.from({ length: count }, (_, i) => ({
      id: `fallback-${keywords}-${i}`,
      url: `https://picsum.photos/800/450?random=${timestamp + i}`,
      preview: `https://picsum.photos/400/225?random=${timestamp + i}`,
      title: `${searchQuery} - 샘플 이미지 ${i + 1}`,
      tags: searchQuery.split(' ').slice(0, 5)
    }));
  };

  const handleGenerateStyledImages = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const styledPrompts = await createStyledPrompts();
      const imageCountPerStyle = Math.ceil(parseInt(formData.videoLength) / 2);

      console.log('Vercel API를 통한 Freepik 이미지 생성 시작...');

      const storyboards = [];
      
      for (const styleData of styledPrompts) {
        try {
          console.log(`"${styleData.style}" 스타일 처리 중...`);
          
          const searchQuery = generateSearchQuery(formData, styleData);
          
          // Vercel API Route를 통해 Freepik API 호출
          let images;
          try {
            images = await fetchFreepikThroughVercel(searchQuery, imageCountPerStyle);
          } catch (apiError) {
            console.warn(`API 호출 실패, 대체 이미지 사용:`, apiError.message);
            images = generateFallbackImages(searchQuery, imageCountPerStyle);
          }
          
          storyboards.push({
            style: styleData.style,
            images: images,
            searchQuery: searchQuery,
            prompt: styleData.prompt,
            apiSource: images.length > 0 && images[0].url.includes('picsum') ? 'Fallback' : 'Freepik'
          });

          console.log(`"${styleData.style}" 완료: ${images.length}개 이미지`);
          
          // API 제한 방지를 위한 대기
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (styleError) {
          console.error(`"${styleData.style}" 스타일 처리 오류:`, styleError);
          
          // 스타일별 실패 시에도 대체 이미지로 처리
          const fallbackImages = generateFallbackImages(
            generateSearchQuery(formData, styleData), 
            imageCountPerStyle
          );
          
          storyboards.push({
            style: styleData.style,
            images: fallbackImages,
            searchQuery: generateSearchQuery(formData, styleData),
            prompt: styleData.prompt,
            error: styleError.message,
            apiSource: 'Fallback'
          });
        }
      }

      if (storyboards.length === 0) {
        throw new Error('모든 스타일에서 이미지 생성에 실패했습니다.');
      }

      console.log('모든 스타일 처리 완료:', storyboards);
      setStoryboard(storyboards);
      onNext();

    } catch (err) {
      console.error('스타일별 이미지 생성 중 오류 발생:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 bg-white rounded-lg shadow-xl border border-gray-200 min-h-[400px] flex flex-col justify-center">
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">다양한 스타일의 컨셉 이미지 생성</h2>
          <p className="text-gray-600 mb-4">
            Vercel API Routes를 통해 Freepik에서 고품질 이미지를 안전하게 가져옵니다.
          </p>
          
          <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
            <div className="flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-purple-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.414-4.414a2 2 0 00-2.828 0L13 7.586l-1.414-1.414a2 2 0 00-2.828 0l-.707.707a2 2 0 000 2.828L9.586 11M6 6l3 3m0 0l-3 3m3-3h12" />
              </svg>
              <h4 className="font-medium text-purple-900">Vercel + Freepik API 연동</h4>
            </div>
            <p className="text-sm text-purple-800">
              ✅ CORS 문제 완전 해결<br/>
              ✅ API 키 서버사이드 보안 처리<br/>
              ✅ 실제 Freepik 고품질 이미지 사용<br/>
              ⚡ API 실패 시 자동 대체 이미지 제공
            </p>
          </div>
          
          {/* 브랜드 정보 요약 */}
          <div className="mb-6 p-3 bg-gray-50 rounded-lg text-left">
            <h4 className="font-medium text-gray-800 mb-2">🎯 타겟 스토리보드 정보</h4>
            <div className="text-sm text-gray-600 grid grid-cols-2 gap-2">
              <div><strong>브랜드:</strong> {formData.brandName}</div>
              <div><strong>업종:</strong> {formData.industryCategory}</div>
              <div><strong>제품/서비스:</strong> {formData.productServiceCategory}</div>
              <div><strong>영상 길이:</strong> {formData.videoLength}</div>
              <div><strong>목적:</strong> {formData.videoPurpose}</div>
              <div><strong>타겟층:</strong> {formData.coreTarget}</div>
            </div>
          </div>
          
          {error && (
            <div className="my-4 p-3 bg-red-100 text-red-700 rounded-md">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <strong>오류 발생:</strong>
              </div>
              <p className="mt-1">{error}</p>
              <p className="text-sm mt-2">💡 Vercel에 환경변수 FREEPIK_API_KEY가 설정되어 있는지 확인해주세요.</p>
            </div>
          )}

          <div className="flex justify-center space-x-4 mt-10">
            <button
              onClick={onPrev}
              disabled={isLoading}
              className="px-8 py-3 bg-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-400 transition-colors duration-300 disabled:opacity-50"
            >
              이전 단계
            </button>
            <button
              onClick={handleGenerateStyledImages}
              disabled={isLoading}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-colors duration-300 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Freepik 이미지 생성하기
            </button>
          </div>

          {/* 추가 안내 */}
          <div className="mt-6 text-xs text-gray-500">
            <p>💡 배포 환경: {window.location.hostname === 'localhost' ? '로컬 개발' : 'Vercel 배포'}</p>
          </div>
        </div>
      )}
    </div>
  );
};

Step2.propTypes = {
  onNext: PropTypes.func.isRequired,
  onPrev: PropTypes.func.isRequired,
  formData: PropTypes.object.isRequired,
  setStoryboard: PropTypes.func.isRequired,
  setIsLoading: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired,
};

export default Step2;

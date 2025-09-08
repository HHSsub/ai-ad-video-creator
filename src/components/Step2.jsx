import { useState } from 'react';
import PropTypes from 'prop-types';

const Spinner = () => (
  <div className="flex flex-col justify-center items-center text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600"></div>
    <p className="mt-4 text-lg text-gray-700 mt-4">
      Vercel API를 통해 Freepik에서 그룹별 이미지를 가져오는 중입니다.
    </p>
    <p className="text-sm text-gray-500 mt-2">
      서버리스 환경의 CORS 문제로 인하여 서버리스 처리됩니다.
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

      const userInputString = 
        `- 브랜드명: ${formData.brandName}
         - 제품명/서비스명: ${formData.productServiceName || '일반'}
         - 영상 목적: ${formData.videoPurpose}
         - 영상 길이: ${formData.videoLength}
         - 핵심 타겟: ${formData.coreTarget}
         - 브랜드 로고: ${formData.brandLogo ? '업로드됨' : '없음'}
         - 제품 이미지: ${formData.productImage ? '업로드됨' : '없음'}`;

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
          searchTerms: ['vintage', 'retro', 'classic', 'film'],
          demoSeed: 'vintage-retro'
        },
        {
          name: 'Futuristic',
          description: 'futuristic sleek neon lights metallic textures high-tech',
          searchTerms: ['futuristic', 'modern', 'technology', 'sleek'],
          demoSeed: 'futuristic-tech'
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
      throw new Error(`프롬프트 템플릿 파일(input_prompt.txt)을 불러오는 데 실패했습니다: ${e.message}`);
    }
  };

  // 검색어 생성 함수 (물어이 설정)
  const generateSearchQuery = (formData, style) => {
    const industryMap = {
      '뷰티': 'beauty cosmetics skincare',
      '푸드': 'food restaurant cuisine',
      '게임': 'gaming technology entertainment',
      '테크': 'technology business innovation',
      '커피': 'coffee shop cafe',
      '패션': 'fashion style clothing',
      '여행': 'travel vacation tourism',
      '헬스': 'fitness health wellness'
    };

    const productMap = {
      '스킨케어': 'skincare beauty product',
      '배달음식': 'food delivery service',
      '모바일게임': 'mobile gaming app',
      '클라우드서비스': 'cloud technology service'
    };

    const baseTerms = [
      industryMap[formData.coreTarget] || 'business product',
      productMap[formData.productServiceName] || 'commercial product'
    ];

    const styleTerms = style.searchTerms.join(' ');
    const purposeTerms = 'commercial advertisement marketing';

    return `${baseTerms.join(' ')} ${styleTerms} ${purposeTerms}`;
  };

  const fetchImagesFromFreepik = async (searchQuery, count = 5) => {
    try {
      console.log('API 호출: /api/freepik-proxy');
      console.log('검색어:', searchQuery);
      
      // POST 메서드로 변경하고 body에 데이터 전송
      const endpoint = process.env.NEXT_PUBLIC_API_BASE_URL ? `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/freepik-proxy` : '/api/freepik-proxy';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchQuery,
          count
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.images && data.images.length > 0) {
        return data.images.map(img => ({
          url: img.url,
          thumbnail: img.thumbnail || img.url,
          title: img.title || 'Freepik Image'
        }));
      } else {
        throw new Error('No images found or API error');
      }
    } catch (error) {
      console.error('Vercel API 호출 오류:', error);
      throw error;
    }
  };

  const generateFallbackImages = (style, count = 5) => {
    const fallbackImages = [
      'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400',
      'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400',
      'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=400',
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400'
    ];

    return fallbackImages.slice(0, count).map((url, index) => ({
      url,
      thumbnail: url,
      title: `${style} 스타일 대체 이미지 ${index + 1}`
    }));
  };

  const processStyleWithImages = async (stylePrompt) => {
    const searchQuery = generateSearchQuery(formData, stylePrompt);
    
    try {
      const images = await fetchImagesFromFreepik(searchQuery, 5);
      return {
        ...stylePrompt,
        images,
        searchQuery
      };
    } catch (error) {
      console.error(`API 호출 실패, 대체 이미지 사용: ${error.message}`);
      const fallbackImages = generateFallbackImages(stylePrompt.style, 5);
      return {
        ...stylePrompt,
        images: fallbackImages,
        searchQuery,
        usedFallback: true
      };
    }
  };

  const handleGenerateStoryboard = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const styledPrompts = await createStyledPrompts();
      const processedPrompts = [];

      for (const stylePrompt of styledPrompts) {
        console.log(`"${stylePrompt.style}" 스타일 처리 중...`);
        const processedStyle = await processStyleWithImages(stylePrompt);
        processedPrompts.push(processedStyle);
        console.log(`"${stylePrompt.style}" 완료: ${processedStyle.images.length}개 이미지`);
      }

      setStoryboard(processedPrompts);
      onNext();
    } catch (error) {
      console.error('스토리보드 생성 실패:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Spinner />;
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
          <div><strong>제품/서비스:</strong> {formData.productServiceName || '일반'}</div>
          <div><strong>영상 목적:</strong> {formData.videoPurpose}</div>
          <div><strong>영상 길이:</strong> {formData.videoLength}</div>
          <div><strong>핵심 타겟:</strong> {formData.coreTarget}</div>
          <div><strong>브랜드 로고:</strong> {formData.brandLogo ? '업로드됨' : '없음'}</div>
        </div>
      </div>

      <div className="text-center mb-8">
        <p className="text-lg text-gray-700 mb-4">
          입력하신 정보를 바탕으로 6가지 스타일의 스토리보드를 생성합니다.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          각 스타일별로 Freepik API를 통해 관련 이미지를 수집합니다.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          <strong>오류:</strong> {error}
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onPrev}
          className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          이전 단계
        </button>
        <button
          onClick={handleGenerateStoryboard}
          disabled={isLoading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          {isLoading ? '생성 중...' : '스토리보드 생성'}
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

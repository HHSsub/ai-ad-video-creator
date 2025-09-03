import { useState } from 'react';
import PropTypes from 'prop-types';

// 로딩 중일 때 표시할 스피너 컴포넌트
const Spinner = () => (
  <div className="flex flex-col justify-center items-center text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    <p className="ml-4 text-lg text-gray-700 mt-4">
      AI가 여러가지 스타일의 광고 컨셉 이미지를 생성하고 있습니다.
    </p>
    <p className="text-sm text-gray-500 mt-2">
      요청하신 영상 길이에 따라 수십 장의 이미지를 생성하므로  
최대 2~3분까지 소요될 수 있습니다. 잠시만 기다려주세요.
    </p>
  </div>
);

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [error, setError] = useState(null);

  /**
   * 사용자 입력을 기반으로, 6가지 다른 스타일이 적용된 프롬프트 배열을 생성합니다.
   * @returns {Promise<Array<{style: string, prompt: string}>>} 각기 다른 스타일 설명이 포함된 프롬프트 객체 배열
   */
  const createStyledPrompts = async () => {
    // 1. public 폴더의 프롬프트 템플릿을 읽어옵니다.
    const response = await fetch('/input_prompt.txt');
    if (!response.ok) {
      throw new Error('프롬프트 템플릿 파일(input_prompt.txt)을 불러오는 데 실패했습니다.');
    }
    const basePromptTemplate = await response.text();

    // 2. Step1의 formData를 프롬프트에 삽입할 문자열로 변환합니다.
    const userInputString = `
      - 브랜드명: ${formData.brandName}
      - 산업/서비스 카테고리: ${formData.industryCategory}
      - 핵심 타겟: ${formData.coreTarget}
      - 핵심 목적: ${formData.corePurpose}
      - 영상 길이: ${formData.videoLength}
      - 핵심 차별점: ${formData.coreDifferentiation}
      - 추가 요구사항: ${formData.additionalRequirements || '없음'}
    `;
    const basePrompt = basePromptTemplate.replace('{userInput}', userInputString);

    // 3. 6가지의 서로 다른 시각적 스타일을 정의합니다.
    const visualStyles = [
      { name: 'Cinematic', description: 'A cinematic shot, dramatic lighting, high detail, 8k' },
      { name: 'Minimalist', description: 'Minimalist style, clean background, simple composition, focused on the subject' },
      { name: 'Vibrant and Energetic', description: 'Vibrant and energetic, dynamic motion, bright colors, abstract background' },
      { name: 'Photorealistic', description: 'A photorealistic image, as if taken with a DSLR camera, sharp focus, natural lighting' },
      { name: 'Vintage', description: 'Vintage film look, retro color palette, grainy texture, 1980s aesthetic' },
      { name: 'Futuristic', description: 'Futuristic and sleek, neon lights, metallic textures, high-tech feel' },
    ];

    // 4. 기본 프롬프트에 각 스타일 설명을 추가하여 6개의 최종 프롬프트를 생성합니다.
    const styledPrompts = visualStyles.map(style => ({
      style: style.name,
      prompt: `${basePrompt}\n\n### Visual Style Guideline\n- Style: ${style.description}`
    }));

    return styledPrompts;
  };

  /**
   * 백엔드에 여러 스타일의 이미지 생성을 한 번에 요청하는 메인 함수
   */
  const handleGenerateStyledImages = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. 6가지 스타일이 적용된 프롬프트 배열 생성
      const styledPrompts = await createStyledPrompts();

      // 2. 영상 길이에 따라 스타일별로 생성할 이미지 개수 계산 (길이의 절반)
      const imageCountPerStyle = Math.ceil(parseInt(formData.videoLength) / 2);

      // 3. 백엔드 API에 프롬프트 배열과 이미지 개수를 담아 요청
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${apiBaseUrl}/api/generate-styled-images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompts: styledPrompts, // {style, prompt} 객체 배열
          count: imageCountPerStyle,
        } ),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '이미지 생성 중 서버에서 오류가 발생했습니다.');
      }

      const result = await response.json();

      // 4. 백엔드로부터 받은 구조화된 결과를 storyboard 상태에 저장
      //    (백엔드 응답이 [{ style: 'Cinematic', images: [...] }, ...] 형태라고 가정)
      if (!result.storyboards || result.storyboards.length === 0) {
        throw new Error('서버로부터 생성된 이미지를 받아오지 못했습니다.');
      }
      setStoryboard(result.storyboards);

      // 5. 성공 시 다음 단계로 이동
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
          <p className="text-gray-600 mb-8">
            입력하신 정보를 바탕으로 AI가 6가지의 서로 다른 스타일로 광고 컨셉 이미지를 생성합니다.  

            생성된 이미지들을 보고 마음에 드는 스타일을 선택하게 됩니다.
          </p>
          
          {error && (
            <div className="my-4 p-3 bg-red-100 text-red-700 rounded-md">
              <p><strong>오류 발생:</strong> {error}</p>
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
              className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors duration-300 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              컨셉 이미지 생성 시작
            </button>
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

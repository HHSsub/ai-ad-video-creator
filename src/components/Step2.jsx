import { useState } from 'react';
import PropTypes from 'prop-types';

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

  const createStyledPrompts = async () => {
    try {
      // 경로를 절대 경로('/')에서 상대 경로('./')로 수정합니다.
      // 이렇게 하면 GitHub Pages의 하위 디렉토리에서도 파일을 올바르게 찾을 수 있습니다.
      const response = await fetch('./input_prompt.txt'); 
      if (!response.ok) {
        // 네트워크 오류나 404 오류에 대한 좀 더 상세한 정보를 포함합니다.
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const basePromptTemplate = await response.text();

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

      const visualStyles = [
        { name: 'Cinematic', description: 'A cinematic shot, dramatic lighting, high detail, 8k' },
        { name: 'Minimalist', description: 'Minimalist style, clean background, simple composition, focused on the subject' },
        { name: 'Vibrant and Energetic', description: 'Vibrant and energetic, dynamic motion, bright colors, abstract background' },
        { name: 'Photorealistic', description: 'A photorealistic image, as if taken with a DSLR camera, sharp focus, natural lighting' },
        { name: 'Vintage', description: 'Vintage film look, retro color palette, grainy texture, 1980s aesthetic' },
        { name: 'Futuristic', description: 'Futuristic and sleek, neon lights, metallic textures, high-tech feel' },
      ];

      const styledPrompts = visualStyles.map(style => ({
        style: style.name,
        prompt: `${basePrompt}\n\n### Visual Style Guideline\n- Style: ${style.description}`
      }));

      return styledPrompts;

    } catch (e) {
      console.error("프롬프트 생성 중 오류:", e);
      // 에러를 다시 던져서 handleGenerateStyledImages 함수에서 잡을 수 있도록 합니다.
      throw new Error('프롬프트 템플릿 파일(input_prompt.txt)을 불러오는 데 실패했습니다.');
    }
  };

  const handleGenerateStyledImages = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const styledPrompts = await createStyledPrompts();
      const imageCountPerStyle = Math.ceil(parseInt(formData.videoLength) / 2);
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${apiBaseUrl}/api/generate-styled-images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompts: styledPrompts,
          count: imageCountPerStyle,
        } ),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '이미지 생성 중 서버에서 오류가 발생했습니다.');
      }

      const result = await response.json();

      if (!result.storyboards || result.storyboards.length === 0) {
        throw new Error('서버로부터 생성된 이미지를 받아오지 못했습니다.');
      }
      setStoryboard(result.storyboards);

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

// gemini 활용
// import { useState } from 'react';
// import PropTypes from 'prop-types';
// import { GoogleGenerativeAI } from '@google/generative-ai';

// // --- 컴포넌트 외부 ---
// // API 키를 .env 파일에서 가져옵니다. Vite에서는 'VITE_' 접두사가 필요합니다.
// const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
// const FREEPIK_API_KEY = import.meta.env.VITE_FREEPIK_API_KEY;

// // Gemini API 클라이언트를 한 번만 초기화합니다.
// const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// const model = genAI.getGenerativeModel({ model: "gemini-pro" });
// // --- ---

// const Spinner = () => (
//   <div className="flex flex-col justify-center items-center text-center">
//     <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
//     <p className="ml-4 text-lg text-gray-700 mt-4">
//       AI가 여러가지 스타일의 광고 컨셉 이미지를 생성하고 있습니다.
//     </p>
//     <p className="text-sm text-gray-500 mt-2">
//       API를 직접 호출하므로 시간이 다소 걸릴 수 있습니다.  
// 잠시만 기다려주세요. (최대 2~3분)
//     </p>
//   </div>
// );

// const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
//   const [error, setError] = useState(null);

//   const handleGenerateStyledImages = async () => {
//     setIsLoading(true);
//     setError(null);

//     if (!GEMINI_API_KEY || !FREEPIK_API_KEY) {
//       setError("API 키가 설정되지 않았습니다. .env 파일을 확인해주세요.");
//       setIsLoading(false);
//       return;
//     }

//     try {
//       // 1. 프롬프트 템플릿 파일(.txt)을 읽어옵니다.
//       const response = await fetch('./input_prompt.txt');
//       if (!response.ok) throw new Error('프롬프트 템플릿 파일(input_prompt.txt)을 찾을 수 없습니다.');
//       const basePromptTemplate = await response.text();

//       const userInputString = `
//         - 브랜드명: ${formData.brandName}
//         - 산업/서비스 카테고리: ${formData.industryCategory}
//         - 핵심 타겟: ${formData.coreTarget}
//         - 핵심 목적: ${formData.corePurpose}
//         - 영상 길이: ${formData.videoLength}
//         - 핵심 차별점: ${formData.coreDifferentiation}
//         - 추가 요구사항: ${formData.additionalRequirements || '없음'}
//       `;
//       const basePrompt = basePromptTemplate.replace('{userInput}', userInputString);

//       // 2. 6가지 다른 시각적 스타일 정의
//       const visualStyles = [
//         { name: 'Cinematic', description: 'A cinematic shot, dramatic lighting, high detail, 8k' },
//         { name: 'Minimalist', description: 'Minimalist style, clean background, simple composition' },
//         { name: 'Vibrant and Energetic', description: 'Vibrant and energetic, dynamic motion, bright colors' },
//         { name: 'Photorealistic', description: 'A photorealistic image, DSLR camera, sharp focus' },
//         { name: 'Vintage', description: 'Vintage film look, retro color palette, grainy texture, 1980s' },
//         { name: 'Futuristic', description: 'Futuristic and sleek, neon lights, metallic textures' },
//       ];

//       const imageCountPerStyle = Math.ceil(parseInt(formData.videoLength) / 2);

//       // 3. 각 스타일에 대해 이미지 생성을 병렬로 처리
//       const storyboardPromises = visualStyles.map(async (style) => {
//         console.log(`- 스타일 "${style.name}" 처리 시작`);
        
//         // 3-1. Gemini를 통해 Freepik 검색어 생성
//         const geminiFullPrompt = `Based on the ad concept below, generate a concise, effective English search query for a stock image platform. Give me only the search query, nothing else.\n\nConcept:\n${basePrompt}\n\nVisual Style: ${style.description}`;
//         const result = await model.generateContent(geminiFullPrompt);
//         const geminiResponse = await result.response;
//         const freepikQuery = geminiResponse.text().trim();
//         console.log(`  - Gemini 생성 검색어 (${style.name}): ${freepikQuery}`);

//         // 3-2. 생성된 검색어로 Freepik API 호출
//         const freepikUrl = `https://api.freepik.com/v1/images?locale=en-US&page=1&limit=${imageCountPerStyle}&term=${encodeURIComponent(freepikQuery )}`;
//         const freepikResponse = await fetch(freepikUrl, {
//           headers: {
//             'Accept-Version': '1.0.0',
//             'X-Freepik-API-Key': FREEPIK_API_KEY,
//           },
//         });

//         if (!freepikResponse.ok) {
//           throw new Error(`Freepik API 오류 (${style.name}): ${freepikResponse.statusText}`);
//         }

//         const freepikData = await freepikResponse.json();
//         const imageUrls = freepikData.data.map(img => img.url.large);
//         console.log(`  - "${style.name}" 스타일 이미지 ${imageUrls.length}개 수신 완료`);

//         return { style: style.name, images: imageUrls };
//       });

//       // 4. 모든 스타일의 이미지 생성이 완료될 때까지 기다림
//       const storyboards = await Promise.all(storyboardPromises);

//       setStoryboard(storyboards);
//       onNext();

//     } catch (err) {
//       console.error('이미지 생성 중 오류 발생:', err);
//       setError(err.message);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   return (
//     <div className="p-8 bg-white rounded-lg shadow-xl border border-gray-200 min-h-[400px] flex flex-col justify-center">
//       {isLoading ? (
//         <Spinner />
//       ) : (
//         <div className="text-center">
//           <h2 className="text-2xl font-bold text-gray-800 mb-4">다양한 스타일의 컨셉 이미지 생성</h2>
//           <p className="text-gray-600 mb-8">
//             입력하신 정보를 바탕으로 AI가 6가지의 서로 다른 스타일로 광고 컨셉 이미지를 생성합니다.  

//             생성된 이미지들을 보고 마음에 드는 스타일을 선택하게 됩니다.
//           </p>
          
//           {error && (
//             <div className="my-4 p-3 bg-red-100 text-red-700 rounded-md">
//               <p><strong>오류 발생:</strong> {error}</p>
//             </div>
//           )}

//           <div className="flex justify-center space-x-4 mt-10">
//             <button onClick={onPrev} disabled={isLoading} className="px-8 py-3 bg-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-400 transition-colors duration-300 disabled:opacity-50">
//               이전 단계
//             </button>
//             <button onClick={handleGenerateStyledImages} disabled={isLoading} className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors duration-300 shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
//               컨셉 이미지 생성 시작
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// Step2.propTypes = {
//   onNext: PropTypes.func.isRequired,
//   onPrev: PropTypes.func.isRequired,
//   formData: PropTypes.object.isRequired,
//   setStoryboard: PropTypes.func.isRequired,
//   setIsLoading: PropTypes.func.isRequired,
//   isLoading: PropTypes.bool.isRequired,
// };

// export default Step2;


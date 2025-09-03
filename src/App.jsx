import { useState } from 'react';
import PropTypes from 'prop-types';

// 로딩 중일 때 표시할 스피너 컴포넌트
const Spinner = () => (
  <div className="flex justify-center items-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    <p className="ml-4 text-lg text-gray-700">AI가 열심히 이미지를 생성하고 있습니다...</p>
  </div>
);

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [error, setError] = useState(null);

  // 헬퍼 함수들 (스타일 결정 로직)
  const getTargetAgeTextStyle = (targetAge) => {
    if (targetAge.includes('10대') || targetAge.includes('20대')) return '트렌디하고 감각적인';
    if (targetAge.includes('30대') || targetAge.includes('40대')) return '세련되고 전문적인';
    return '안정적이고 신뢰감 있는';
  };

  const getMoodColorStyle = (tone) => {
    if (tone === '활기찬') return '밝고 채도가 높은 색감';
    if (tone === '차분한') return '부드럽고 안정적인 파스텔톤';
    if (tone === '고급스러운') return '깊고 풍부한 색감과 골드/실버 포인트';
    return '선명하고 깨끗한 색감';
  };

  // Gemini API(또는 백엔드)를 통해 프롬프트를 생성하고, 이를 Freepik에 전달하여 이미지를 생성하는 함수
  const handleGenerateStoryboard = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. 백엔드에 사용자 입력을 전달하여 스토리보드 생성을 요청합니다.
      // 백엔드 서버 주소는 환경 변수에서 가져옵니다.
      const response = await fetch(`${import.meta.env.REACT_APP_API_BASE_URL}/api/generate-storyboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '서버에서 오류가 발생했습니다.');
      }

      const result = await response.json();

      // 2. 백엔드로부터 받은 스토리보드 데이터(이미지 URL 등)를 상태에 저장합니다.
      // 백엔드 응답 형식에 따라 `result.storyboard` 부분은 달라질 수 있습니다.
      setStoryboard(result.storyboard);

      // 3. 다음 단계로 이동합니다.
      onNext();

    } catch (err) {
      console.error('스토리보드 생성 중 오류 발생:', err);
      setError(err.message || '스토리보드 생성에 실패했습니다. 네트워크 연결을 확인하거나 다시 시도해주세요.');
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
          <h2 className="text-2xl font-bold text-gray-800 mb-4">스토리보드 생성 준비 완료</h2>
          <p className="text-gray-600 mb-8">
            입력하신 정보를 바탕으로 AI가 광고 영상의 스토리보드를 생성합니다.  

            이 과정은 약 1~2분 정도 소요될 수 있습니다.
          </p>
          
          {error && (
            <div className="my-4 p-3 bg-red-100 text-red-700 rounded-md">
              <p><strong>오류 발생:</strong> {error}</p>
            </div>
          )}

          <div className="flex justify-center space-x-4 mt-10">
            <button
              onClick={onPrev}
              className="px-8 py-3 bg-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-400 transition-colors duration-300"
            >
              이전 단계
            </button>
            <button
              onClick={handleGenerateStoryboard}
              className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors duration-300 shadow-md"
            >
              스토리보드 생성 시작
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// PropTypes 추가
Step2.propTypes = {
  onNext: PropTypes.func.isRequired,
  onPrev: PropTypes.func.isRequired,
  formData: PropTypes.object.isRequired,
  setStoryboard: PropTypes.func.isRequired,
  setIsLoading: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired,
};

export default Step2;

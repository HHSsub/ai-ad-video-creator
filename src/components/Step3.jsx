import { useState, useEffect } from 'react';
import { mapInputsToKeywords, generateStoryboardScenes, generateFinalPrompt } from '../mappings.js';

const Step3 = ({ onPrev, formData, brandClassification }) => {
  const [mappedData, setMappedData] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [finalPrompt, setFinalPrompt] = useState(null);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    if (formData && brandClassification) {
      // 1. 입력 데이터를 키워드로 매핑
      const mapped = mapInputsToKeywords(formData);
      setMappedData(mapped);

      // 2. 스토리보드 장면 생성
      const generatedScenes = generateStoryboardScenes(formData, brandClassification, mapped);
      setScenes(generatedScenes);

      // 3. 최종 JSON 프롬프트 생성
      const prompt = generateFinalPrompt(formData, brandClassification, generatedScenes);
      setFinalPrompt(prompt);

      // 4. 콘솔에 출력 (개발용)
      console.log('=== AI 광고 영상 스토리보드 프롬프트 ===');
      console.log(JSON.stringify(prompt, null, 2));
    }
  }, [formData, brandClassification]);

  // JSON 복사 기능
  const copyToClipboard = () => {
    if (finalPrompt) {
      navigator.clipboard.writeText(JSON.stringify(finalPrompt, null, 2));
      alert('JSON 프롬프트가 클립보드에 복사되었습니다!');
    }
  };

  if (!mappedData || !scenes.length || !finalPrompt) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center">스토리보드 생성 중...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        3단계: 스토리보드 및 JSON 프롬프트 생성 완료
      </h2>

      {/* 매핑된 키워드 및 스타일 */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-lg font-semibold text-blue-800 mb-3">
          매핑된 키워드 및 스타일
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-800 mb-2">키워드:</h4>
            <div className="flex flex-wrap gap-2">
              {mappedData.keywords.map((keyword, index) => (
                <span 
                  key={index}
                  className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-800 mb-2">스타일 속성:</h4>
            <div className="text-sm space-y-1">
              <div><span className="font-medium">페이스:</span> {mappedData.style.pace}</div>
              <div><span className="font-medium">음악:</span> {mappedData.style.music}</div>
              <div><span className="font-medium">비주얼:</span> {mappedData.style.visual}</div>
              <div><span className="font-medium">감정:</span> {mappedData.style.emotion}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 스토리보드 장면들 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          생성된 스토리보드 (총 {scenes.length}개 장면)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scenes.map((scene, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-gray-800">장면 {scene.scene}</h4>
                <span className="text-sm text-gray-500">{scene.duration}</span>
              </div>
              <p className="text-gray-700 mb-3">{scene.description}</p>
              <div className="space-y-2">
                <div>
                  <span className="text-sm font-medium text-gray-600">키워드: </span>
                  {scene.keywords.map((keyword, idx) => (
                    <span key={idx} className="text-sm bg-gray-100 px-2 py-1 rounded mr-1">
                      {keyword}
                    </span>
                  ))}
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">전환효과:</span> {scene.transition}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* JSON 프롬프트 출력 */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            최종 JSON 프롬프트
          </h3>
          <div className="space-x-2">
            <button
              onClick={() => setShowJson(!showJson)}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm"
            >
              {showJson ? 'JSON 숨기기' : 'JSON 보기'}
            </button>
            <button
              onClick={copyToClipboard}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
            >
              클립보드 복사
            </button>
          </div>
        </div>

        {showJson && (
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-96">
            <pre className="text-sm whitespace-pre-wrap">
              {JSON.stringify(finalPrompt, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* API 연동 안내 */}
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="text-lg font-semibold text-yellow-800 mb-2">
          🚀 다음 단계: CapCut API 연동
        </h3>
        <p className="text-yellow-700 mb-2">
          위에서 생성된 JSON 프롬프트를 CapCut API로 전송하여 실제 영상을 생성할 수 있습니다.
        </p>
        <p className="text-sm text-yellow-600">
          {/* TODO: CapCut API 호출 위치 */}
          개발자 참고: mappings.js 파일의 generateFinalPrompt 함수에서 API 호출 코드를 추가하세요.
        </p>
      </div>

      {/* 네비게이션 */}
      <div className="flex justify-between">
        <button
          onClick={onPrev}
          className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          이전 단계
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          새로 시작
        </button>
      </div>

      {/* 프롬프트 요약 정보 */}
      <div className="mt-6 p-4 bg-gray-50 rounded-md">
        <h3 className="text-sm font-medium text-gray-700 mb-2">프롬프트 요약:</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <div><span className="font-medium">프로젝트:</span> {finalPrompt.project.title}</div>
          <div><span className="font-medium">브랜드 분류:</span> {finalPrompt.brand.classification}</div>
          <div><span className="font-medium">총 영상 길이:</span> {finalPrompt.project.target_duration}</div>
          <div><span className="font-medium">장면 수:</span> {finalPrompt.storyboard.total_scenes}개</div>
        </div>
      </div>
    </div>
  );
};

export default Step3;
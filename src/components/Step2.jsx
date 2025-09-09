import { useState } from 'react';
import PropTypes from 'prop-types';

const Spinner = () => (
  <div className="flex flex-col justify-center items-center text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600"></div>
    <p className="mt-4 text-lg text-gray-700">
      AI를 활용하여 스토리보드를 생성하는 중입니다.
    </p>
    <p className="text-sm text-gray-500 mt-2">
      Gemini AI가 브리프를 작성하고, Freepik API가 이미지를 생성합니다.
    </p>
  </div>
);

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('');
  const [progress, setProgress] = useState(0);

  const handleGenerateStoryboard = async () => {
    setIsLoading(true);
    setError(null);
    setDebugInfo(null);
    setProgress(0);

    try {
      console.log('=== 스토리보드 생성 시작 ===');
      setCurrentPhase('브리프 생성 중...');
      setProgress(10);

      // API 엔드포인트 호출
      const response = await fetch('/api/storyboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ formData }),
      });

      setProgress(30);
      setCurrentPhase('서버 응답 처리 중...');

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || 
          `서버 오류: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || '스토리보드 생성에 실패했습니다.');
      }

      setProgress(70);
      setCurrentPhase('스토리보드 데이터 처리 중...');

      // 응답 데이터 검증
      if (!data.storyboard || !Array.isArray(data.storyboard)) {
        throw new Error('잘못된 스토리보드 데이터입니다.');
      }

      console.log('스토리보드 생성 완료:', {
        총스타일: data.storyboard.length,
        성공: data.metadata?.successCount || 0,
        대체이미지: data.metadata?.fallbackCount || 0
      });

      // 디버그 정보 설정
      setDebugInfo({
        totalStyles: data.storyboard.length,
        successCount: data.metadata?.successCount || 0,
        fallbackCount: data.metadata?.fallbackCount || 0,
        creativeBrief: data.creativeBrief ? '생성됨' : '없음'
      });

      setProgress(90);
      setCurrentPhase('최종 처리 중...');

      // 스토리보드 데이터 설정
      setStoryboard(data.storyboard);
      
      setProgress(100);
      setCurrentPhase('완료!');

      // 잠시 대기 후 다음 단계로
      setTimeout(() => {
        onNext();
      }, 1000);

    } catch (error) {
      console.error('스토리보드 생성 실패:', error);
      
      let errorMessage = '스토리보드 생성 중 오류가 발생했습니다.';
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = '서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.';
      } else if (error.message.includes('404')) {
        errorMessage = '서버 API 엔드포인트가 존재하지 않습니다. 개발자에게 문의하세요.';
      } else if (error.message.includes('500')) {
        errorMessage = '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setError(errorMessage);
      setProgress(0);
      setCurrentPhase('');
      
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <Spinner />
        
        {/* 진행 상황 표시 */}
        {currentPhase && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium text-blue-800">{currentPhase}</h4>
              <span className="text-sm text-blue-600">{progress}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* 디버그 정보 */}
        {debugInfo && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-green-800 mb-2">처리 현황</h4>
            <div className="text-sm text-green-700 space-y-1">
              <p>총 스타일: {debugInfo.totalStyles}개</p>
              <p>성공: {debugInfo.successCount}개</p>
              <p>대체 이미지: {debugInfo.fallbackCount}개</p>
              <p>크리에이티브 브리프: {debugInfo.creativeBrief}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">
        2단계: AI 스토리보드 생성
      </h2>

      {/* 입력 정보 요약 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg mb-8 border border-blue-200">
        <h3 className="text-xl font-semibold mb-4 text-blue-800 flex items-center">
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          입력된 정보 요약
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-white p-3 rounded shadow-sm">
            <strong className="text-gray-700">브랜드명:</strong> 
            <span className="ml-2 text-gray-900 font-medium">{formData.brandName}</span>
          </div>
          <div className="bg-white p-3 rounded shadow-sm">
            <strong className="text-gray-700">산업 카테고리:</strong> 
            <span className="ml-2 text-gray-900">{formData.industryCategory}</span>
          </div>
          <div className="bg-white p-3 rounded shadow-sm">
            <strong className="text-gray-700">제품/서비스:</strong> 
            <span className="ml-2 text-gray-900">{formData.productServiceName || formData.productServiceCategory}</span>
          </div>
          <div className="bg-white p-3 rounded shadow-sm">
            <strong className="text-gray-700">영상 목적:</strong> 
            <span className="ml-2 text-gray-900">{formData.videoPurpose}</span>
          </div>
          <div className="bg-white p-3 rounded shadow-sm">
            <strong className="text-gray-700">영상 길이:</strong> 
            <span className="ml-2 text-gray-900 font-bold text-blue-600">{formData.videoLength}</span>
          </div>
          <div className="bg-white p-3 rounded shadow-sm">
            <strong className="text-gray-700">핵심 타겟:</strong> 
            <span className="ml-2 text-gray-900">{formData.coreTarget}</span>
          </div>
          <div className="md:col-span-2 bg-white p-3 rounded shadow-sm">
            <strong className="text-gray-700">핵심 차별점:</strong> 
            <span className="ml-2 text-gray-900">{formData.coreDifferentiation}</span>
          </div>
          
          {/* 업로드된 파일 정보 */}
          {(formData.brandLogo || formData.productImage) && (
            <div className="md:col-span-2 bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded border border-green-200">
              <strong className="text-green-700">업로드된 파일:</strong>
              <div className="mt-2 flex gap-4">
                {formData.brandLogo && (
                  <div className="flex items-center text-sm text-green-600">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    브랜드 로고
                  </div>
                )}
                {formData.productImage && (
                  <div className="flex items-center text-sm text-green-600">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    제품 이미지
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 생성 과정 설명 */}
      <div className="text-center mb-8">
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-lg border border-purple-200">
          <h4 className="text-lg font-semibold text-purple-800 mb-3">🤖 AI 스토리보드 생성 과정</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-white p-4 rounded shadow-sm">
              <div className="text-2xl mb-2">🧠</div>
              <div className="font-medium text-gray-800">1. AI 브리프 생성</div>
              <div className="text-gray-600">Gemini AI가 창의적인 광고 전략을 수립합니다</div>
            </div>
            <div className="bg-white p-4 rounded shadow-sm">
              <div className="text-2xl mb-2">🎨</div>
              <div className="font-medium text-gray-800">2. 스타일별 이미지</div>
              <div className="text-gray-600">6가지 스타일로 각각 다른 분위기의 이미지를 생성합니다</div>
            </div>
            <div className="bg-white p-4 rounded shadow-sm">
              <div className="text-2xl mb-2">📋</div>
              <div className="font-medium text-gray-800">3. 스토리보드 완성</div>
              <div className="text-gray-600">선택 가능한 완성된 스토리보드를 제공합니다</div>
            </div>
          </div>
        </div>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                스토리보드 생성 오류
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => setError(null)}
                  className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded hover:bg-red-200 transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 액션 버튼들 */}
      <div className="flex justify-between items-center">
        <button
          onClick={onPrev}
          className="flex items-center px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors shadow-md"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          이전 단계
        </button>

        <div className="text-center">
          <div className="text-sm text-gray-500 mb-2">
            예상 소요시간: 2-3분
          </div>
          <div className="text-xs text-gray-400">
            AI 처리 + 이미지 생성 + 스타일 구성
          </div>
        </div>

        <button
          onClick={handleGenerateStoryboard}
          disabled={isLoading}
          className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 disabled:hover:scale-100"
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
              🚀 AI 스토리보드 생성
            </>
          )}
        </button>
      </div>

      {/* 참고 사항 */}
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-yellow-800">참고사항</h4>
            <div className="text-sm text-yellow-700 mt-1 space-y-1">
              <p>• 업로드한 브랜드 로고와 제품 이미지는 자동으로 스토리보드에 반영됩니다.</p>
              <p>• API 호출 제한으로 인해 일부 이미지가 대체 이미지로 표시될 수 있습니다.</p>
              <p>• 생성 과정에서 오류가 발생하면 고품질 대체 이미지를 제공합니다.</p>
              <p>• 인터넷 연결 상태가 좋지 않으면 생성 시간이 더 오래 걸릴 수 있습니다.</p>
            </div>
          </div>
        </div>
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
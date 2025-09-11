import { useState } from 'react';
import Step1 from './components/Step1';
import Step2 from './components/Step2';
import Step3 from './components/Step3';
import Step4 from './components/Step4';

function App(){
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({});
  const [storyboard, setStoryboard] = useState(null);
  const [selectedConceptId, setSelectedConceptId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const next = () => setStep(s=> Math.min(4,s+1));
  const prev = () => setStep(s=> Math.max(1,s-1));

  // 디버깅을 위한 상태 로깅
  console.log('App 상태:', {
    step,
    formDataKeys: Object.keys(formData),
    hasStoryboard: !!storyboard,
    selectedConceptId,
    isLoading,
    storyboardStylesCount: storyboard?.styles?.length || 0
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6">
        {/* 진행 상태 표시 */}
        <div className="mb-6 flex items-center justify-center gap-4">
          <div className={`flex items-center ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}>1</div>
            <span className="ml-2 text-sm font-semibold">정보 입력</span>
          </div>
          
          <div className={`w-8 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
          
          <div className={`flex items-center ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}>2</div>
            <span className="ml-2 text-sm font-semibold">스토리보드</span>
          </div>
          
          <div className={`w-8 h-1 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
          
          <div className={`flex items-center ${step >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}>3</div>
            <span className="ml-2 text-sm font-semibold">영상 클립</span>
          </div>
          
          <div className={`w-8 h-1 ${step >= 4 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
          
          <div className={`flex items-center ${step >= 4 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step >= 4 ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}>4</div>
            <span className="ml-2 text-sm font-semibold">최종 완성</span>
          </div>
        </div>

        {/* 현재 단계별 컴포넌트 렌더링 */}
        {step === 1 && (
          <Step1
            formData={formData}
            setFormData={setFormData}
            onNext={() => {
              console.log('Step1 완료, formData:', formData);
              next();
            }}
          />
        )}
        
        {step === 2 && (
          <Step2
            formData={formData}
            setStoryboard={setStoryboard}
            storyboard={storyboard}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onPrev={prev}
            onNext={() => {
              console.log('Step2 완료, storyboard styles:', storyboard?.styles?.length);
              next();
            }}
          />
        )}
        
        {step === 3 && (
          <Step3
            storyboard={storyboard}
            selectedConceptId={selectedConceptId}
            setSelectedConceptId={setSelectedConceptId}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onPrev={prev}
            onNext={() => {
              if (!selectedConceptId) {
                alert('컨셉을 선택해주세요.');
                return;
              }
              console.log('Step3 완료, selectedConceptId:', selectedConceptId);
              next();
            }}
          />
        )}
        
        {step === 4 && (
          <Step4
            storyboard={storyboard}
            selectedConceptId={selectedConceptId}
            onPrev={prev}
            onReset={() => {
              // 전체 초기화
              setStep(1);
              setFormData({});
              setStoryboard(null);
              setSelectedConceptId(null);
              setIsLoading(false);
            }}
          />
        )}
      </div>
      
      {/* 로딩 오버레이 */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">처리 중입니다...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

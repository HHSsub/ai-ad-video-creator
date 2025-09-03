import { useState } from 'react';
import Step1 from './components/Step1.jsx';
import Step2 from './components/Step2.jsx';
import Step3 from './components/Step3.jsx';

function App() {
  // 현재 진행 단계를 관리하는 상태
  const [currentStep, setCurrentStep] = useState(1);
  
  // Step1에서 사용자가 입력한 폼 데이터를 관리하는 상태
  const [formData, setFormData] = useState({
    brandName: '',
    industryCategory: '',
    coreTarget: '',
    corePurpose: '',
    videoLength: '',
    coreDifferentiation: '',
    additionalRequirements: ''
  });

  // Step2에서 생성된 스토리보드 데이터를 관리하는 상태
  const [storyboard, setStoryboard] = useState(null);
  // Step3에서 최종 생성된 영상 URL을 관리하는 상태
  const [finalVideoUrl, setFinalVideoUrl] = useState('');
  // 로딩 상태 관리
  const [isLoading, setIsLoading] = useState(false);

  // 다음 단계로 진행하는 함수
  const handleNext = () => {
    setCurrentStep(prev => prev + 1);
  };

  // 이전 단계로 돌아가는 함수
  const handlePrev = () => {
    setCurrentStep(prev => prev - 1);
  };

  // 진행 상태를 시각적으로 보여주는 프로그레스 바 컴포넌트
  const ProgressBar = () => {
    const steps = [
      { number: 1, title: '기본 정보 입력' },
      { number: 2, title: '스토리보드 생성' },
      { number: 3, title: '최종 영상 제작' }
    ];

    return (
      <div className="mb-8">
        <div className="flex justify-center items-center space-x-4">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${currentStep >= step.number ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {step.number}
              </div>
              <div className="ml-2 text-sm">
                <div className={`font-medium ${currentStep >= step.number ? 'text-blue-600' : 'text-gray-400'}`}>
                  {step.title}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`ml-4 w-8 h-0.5 ${currentStep > step.number ? 'bg-blue-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🎬 AI 광고 영상 제작 도구</h1>
          <p className="text-lg text-gray-600">브랜드 정보를 입력하여 AI 광고 영상을 제작해보세요.</p>
        </div>

        <ProgressBar />

        <div className="max-w-6xl mx-auto">
          {currentStep === 1 && (
            <Step1 
              onNext={handleNext}
              formData={formData}
              setFormData={setFormData}
            />
          )}
          
          {currentStep === 2 && (
            <Step2 
              onNext={handleNext}
              onPrev={handlePrev}
              formData={formData}
              setStoryboard={setStoryboard}
              setIsLoading={setIsLoading}
              isLoading={isLoading}
            />
          )}

          {currentStep === 3 && (
            <Step3 
              onPrev={handlePrev}
              storyboard={storyboard}
              setFinalVideoUrl={setFinalVideoUrl}
              finalVideoUrl={finalVideoUrl}
              setIsLoading={setIsLoading}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

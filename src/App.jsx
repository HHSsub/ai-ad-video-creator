import { useState } from 'react';
import Step1 from './components/Step1.jsx';
import Step2 from './components/Step2.jsx';
import Step3 from './components/Step3.jsx';

function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    brandName: '',
    industryCategory: '',
    coreTarget: '',
    corePurpose: '',
    videoLength: '',
    coreDifferentiation: '',
    additionalRequirements: ''
  });
  const [brandClassification, setBrandClassification] = useState(null);

  // 단계 진행 함수
  const handleNext = () => {
    setCurrentStep(prev => prev + 1);
  };

  const handlePrev = () => {
    setCurrentStep(prev => prev - 1);
  };

  // 진행 상태 표시
  const ProgressBar = () => {
    const steps = [
      { number: 1, title: '기본 정보 입력' },
      { number: 2, title: '브랜드 분류' },
      { number: 3, title: '스토리보드 생성' }
    ];

    return (
      <div className="mb-8">
        <div className="flex justify-center items-center space-x-4">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                ${currentStep >= step.number 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-600'
                }
              `}>
                {step.number}
              </div>
              <div className="ml-2 text-sm">
                <div className={`font-medium ${
                  currentStep >= step.number ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  {step.title}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`ml-4 w-8 h-0.5 ${
                  currentStep > step.number ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
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
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            🎬 AI 광고 영상 제작 도구
          </h1>
          <p className="text-lg text-gray-600">
            브랜드 정보를 입력하면 CapCut API용 스토리보드 JSON을 자동 생성합니다
          </p>
        </div>

        {/* 진행 상태 표시 */}
        <ProgressBar />

        {/* 단계별 컴포넌트 렌더링 */}
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
              setBrandClassification={setBrandClassification}
            />
          )}
          
          {currentStep === 3 && (
            <Step3 
              onPrev={handlePrev}
              formData={formData}
              brandClassification={brandClassification}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

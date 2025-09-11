// 주의: 여기서는 “기존 코드 블럭”을 알 수 없으므로
// *** 아래 // EXISTING_CODE_START ~ // EXISTING_CODE_END 사이에 네 원래 App.jsx 내용 그대로 유지 ***
// 그 아래에 새 step 로직/라우팅만 최소 추가 예시
// 실제로 합칠 때는 중복 state/함수 충돌 조정 필요

// EXISTING_CODE_START
// (여기 기존 import, context, provider, 로깅, 테마, 유틸 등 전부 유지)
// 예: import React, { useState, useEffect } from 'react';
//     import SomeContextProvider from './context/SomeContextProvider';
//     ... (네 기존 코드)
// EXISTING_CODE_END

import { useState } from 'react';
import Step1 from './components/Step1';
import Step2 from './components/Step2';
import Step3 from './components/Step3';
import Step4 from './components/Step4';

function App(){
  // 기존에 이미 formData / step / loading 관리가 있다면 중복 제거
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({});
  const [storyboard, setStoryboard] = useState(null);
  const [selectedConceptId, setSelectedConceptId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const next = () => setStep(s=> Math.min(4,s+1));
  const prev = () => setStep(s=> Math.max(1,s-1));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6">
        <div className="mb-6 flex items-center gap-4 text-sm font-semibold">
          <div className={step===1?'text-blue-600':'text-gray-400'}>1 입력</div>
          <div className={step===2?'text-blue-600':'text-gray-400'}>2 스토리보드/이미지</div>
          <div className={step===3?'text-blue-600':'text-gray-400'}>3 영상클립</div>
          <div className={step===4?'text-blue-600':'text-gray-400'}>4 합치기/BGM</div>
        </div>

        {step===1 && (
          <Step1
            formData={formData}
            setFormData={setFormData}
            onNext={next}
          />
        )}
        {step===2 && (
          <Step2
            formData={formData}
            setStoryboard={setStoryboard}
            storyboard={storyboard}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onPrev={prev}
            onNext={next}
          />
        )}
        {step===3 && (
          <Step3
            storyboard={storyboard}
            selectedConceptId={selectedConceptId}
            setSelectedConceptId={setSelectedConceptId}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onPrev={prev}
            onNext={()=>{
              if(!selectedConceptId) return;
              next();
            }}
          />
        )}
        {step===4 && (
          <Step4
            storyboard={storyboard}
            selectedConceptId={selectedConceptId}
            onPrev={prev}
          />
        )}
      </div>
    </div>
  );
}

export default App;

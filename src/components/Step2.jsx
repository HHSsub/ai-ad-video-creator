import { useState, useEffect } from 'react';
import { classifyBrand } from '../mock/brands.js';
import { brandPatterns } from '../mock/patterns.js';

const Step2 = ({ onNext, onPrev, formData, setBrandClassification }) => {
  const [classification, setClassification] = useState(null);
  const [pattern, setPattern] = useState(null);

  useEffect(() => {
    if (formData.brandName) {
      const result = classifyBrand(formData.brandName);
      setClassification(result);
      setPattern(brandPatterns[result.classification]);
      setBrandClassification(result);
    }
  }, [formData.brandName, setBrandClassification]);

  const handleNext = () => {
    onNext();
  };

  if (!classification || !pattern) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center">브랜드 분류 중...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        2단계: 브랜드 분류 결과
      </h2>

      {/* 브랜드 분류 결과 */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-blue-800">
            브랜드: {formData.brandName}
          </h3>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            classification.isExisting 
              ? 'bg-green-100 text-green-800' 
              : 'bg-orange-100 text-orange-800'
          }`}>
            {pattern.title}
          </span>
        </div>
        
        <p className="text-gray-700 mb-4">{pattern.description}</p>
        
        <div className="space-y-2">
          <h4 className="font-medium text-gray-800">추천 전략:</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
            {pattern.strategies.map((strategy, index) => (
              <li key={index}>{strategy}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* 스타일 정보 */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">
          적용될 스타일
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">비주얼 스타일:</span>
            <span className="ml-2 text-gray-600">{pattern.visualStyle}</span>
          </div>
          <div>
            <span className="font-medium">톤 앤 매너:</span>
            <span className="ml-2 text-gray-600">{pattern.tone}</span>
          </div>
        </div>
      </div>

      {/* 입력 정보 요약 */}
      <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
        <h3 className="text-lg font-semibold text-green-800 mb-3">
          입력 정보 요약
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="font-medium">업종:</span> {formData.industry}</div>
          <div><span className="font-medium">타겟 연령:</span> {formData.ageGroup}</div>
          <div><span className="font-medium">광고 톤:</span> {formData.tone}</div>
          <div><span className="font-medium">광고 목표:</span> {formData.goal}</div>
        </div>
      </div>

      {/* 네비게이션 버튼 */}
      <div className="flex justify-between">
        <button
          onClick={onPrev}
          className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          이전 단계
        </button>
        <button
          onClick={handleNext}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          스토리보드 생성
        </button>
      </div>

      {/* 분류 결과 데이터 (개발용) */}
      <div className="mt-6 p-4 bg-gray-50 rounded-md">
        <h3 className="text-sm font-medium text-gray-700 mb-2">분류 결과 데이터:</h3>
        <pre className="text-xs text-gray-600">{JSON.stringify({ classification, pattern }, null, 2)}</pre>
      </div>
    </div>
  );
};

export default Step2;
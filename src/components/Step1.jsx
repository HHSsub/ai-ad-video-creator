import { useState } from 'react';

const Step1 = ({ onNext, formData, setFormData }) => {
  const [errors, setErrors] = useState({});

  const fields = [
    { 
      name: 'brandName', 
      label: '브랜드명', 
      type: 'text', 
      placeholder: '예: 삼성, 쿠팡, 새로운 브랜드' 
    },
    { 
      name: 'businessCategory', 
      label: '비즈니스 카테고리', 
      type: 'text', 
      placeholder: '예: 프리미엄 비건 뷰티, AI 기반 SaaS 솔루션, 구독형 키즈 에듀테크' 
    },
    { 
      name: 'coreValue', 
      label: '핵심 차별점', 
      type: 'text', 
      placeholder: '브랜드가 제공할 수 있는 가치와 차별점' 
    },
    { 
      name: 'coreTarget', 
      label: '핵심 타겟', 
      type: 'text', 
      placeholder: '예: 사회초년생 화장품에 관심이 많은 20대의 여성 직장인' 
    },
    {
      name: 'coreGoal',
      label: '핵심 목표',
      type: 'select',
      options: ['브랜드 인지도 강화', '구매 전환']
    },
    {
      name: 'videoLength',
      label: '영상 길이',
      type: 'select',
      options: ['숏폼(10초)', '스탠다드(30초)', '롱폼(60초)']
    }
  ];

  const handleInputChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    fields.forEach(field => {
      if (!formData[field.name] || formData[field.name].trim() === '') {
        newErrors[field.name] = `${field.label}은(는) 필수 입력 항목입니다.`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateForm()) {
      onNext();
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        1단계: 6가지 입력
      </h2>
      
      <div className="space-y-4">
        {fields.map(field => (
          <div key={field.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {field.label} <span className="text-red-500">*</span>
            </label>
            
            {field.type === 'select' ? (
              <select
                value={formData[field.name] || ''}
                onChange={(e) => handleInputChange(field.name, e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors[field.name] ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">선택해주세요</option>
                {field.options.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                value={formData[field.name] || ''}
                onChange={(e) => handleInputChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors[field.name] ? 'border-red-500' : 'border-gray-300'
                }`}
              />
            )}
            
            {errors[field.name] && (
              <p className="text-red-500 text-sm">{errors[field.name]}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleNext}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          다음 단계
        </button>
      </div>
    </div>
  );
};

export default Step1;

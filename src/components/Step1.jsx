import { useState } from 'react';

const Step1 = ({ onNext, formData, setFormData }) => {
  const [errors, setErrors] = useState({});

  const fields = [
    { 
      name: 'brandName', 
      label: '브랜드명', 
      type: 'text', 
      placeholder: '예: 삼성, 쿠팡, 새로운 브랜드',
      required: true
    },
    { 
      name: 'industryCategory', 
      label: '산업/서비스 카테고리', 
      type: 'text', 
      placeholder: '예: 뷰티, 푸드, 게임, 테크, 카페 등',
      required: true
    },
    { 
      name: 'coreTarget', 
      label: '핵심 타겟', 
      type: 'text', 
      placeholder: '예: 사회초년생 재테크에 관심이 많은 20대 후반의 직장인 등 자유롭게 기재',
      required: true
    },
    {
      name: 'corePurpose',
      label: '핵심 목적',
      type: 'select',
      options: ['브랜드 인지도 강화', '구매 전환'],
      required: true
    },
    {
      name: 'videoLength',
      label: '영상 길이',
      type: 'select',
      options: ['10초', '30초', '60초'],
      required: true
    },
    { 
      name: 'coreDifferentiation', 
      label: '핵심 차별점', 
      type: 'text', 
      placeholder: '브랜드의 제공하는 독창적이고 차별화된 포인트',
      required: true
    },
    { 
      name: 'additionalRequirements', 
      label: '추가 요구사항 (선택사항)', 
      type: 'textarea', 
      placeholder: '자유롭게 원하는 컨셉이나 요구사항이 있으면 기재',
      required: false
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
      if (field.required && (!formData[field.name] || formData[field.name].trim() === '')) {
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
        1단계: 7가지 입력
      </h2>
      
      <div className="space-y-4">
        {fields.map(field => (
          <div key={field.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {field.label} {field.required && <span className="text-red-500">*</span>}
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
            ) : field.type === 'textarea' ? (
              <textarea
                value={formData[field.name] || ''}
                onChange={(e) => handleInputChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                rows="3"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors[field.name] ? 'border-red-500' : 'border-gray-300'
                }`}
              />
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

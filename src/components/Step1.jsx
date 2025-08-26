import { useState } from 'react';

const Step1 = ({ onNext, formData, setFormData }) => {
  const [errors, setErrors] = useState({});

  // 폼 필드 정의
  const fields = [
    { name: 'brandName', label: '브랜드명', type: 'text', placeholder: '예: 삼성, 쿠팡, 새로운브랜드' },
    { 
      name: 'ageGroup', 
      label: '타겟 연령대', 
      type: 'select',
      options: ['10대', '20대', '30대', '40대', '50대 이상']
    },
    {
      name: 'industry',
      label: '업종',
      type: 'select',
      options: ['기술/IT', '식품/음료', '패션/뷰티', '자동차', '금융', '교육', '헬스케어', '엔터테인먼트']
    },
    {
      name: 'tone',
      label: '광고 톤',
      type: 'select', 
      options: ['친근한', '전문적인', '재미있는', '감동적인', '혁신적인']
    },
    { name: 'goal', label: '광고 목표', type: 'text', placeholder: '예: 브랜드 인지도 향상, 신제품 홍보, 매출 증대' }
  ];

  // 입력값 변경 처리
  const handleInputChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    // 에러가 있다면 제거
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // 유효성 검사
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

  // 다음 단계로 진행
  const handleNext = () => {
    if (validateForm()) {
      onNext();
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        1단계: 기본 정보 입력
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

      {/* 입력 데이터 미리보기 (개발용) */}
      <div className="mt-6 p-4 bg-gray-50 rounded-md">
        <h3 className="text-sm font-medium text-gray-700 mb-2">입력된 데이터:</h3>
        <pre className="text-xs text-gray-600">{JSON.stringify(formData, null, 2)}</pre>
      </div>
    </div>
  );
};

export default Step1;
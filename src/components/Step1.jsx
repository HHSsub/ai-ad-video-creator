import { useState } from 'react';

const Step1 = ({ onNext, formData, setFormData }) => {
  const [errors, setErrors] = useState({});

  // 사용자가 요구한 순서대로 재구성:
  // 1. 브랜드명 (필수)
  // 2. 산업 카테고리 (필수)
  // 3. 제품/서비스 카테고리 (필수)
  // 4. 제품명/서비스명 (선택)
  // 5. 영상 목적 (필수 - 드롭다운)
  // 6. 영상 길이 (필수 - 드롭다운)
  // 7. 영상 비율 (필수 - 드롭다운: 가로(16:9), 세로(9:16), 정사각형(1:1))
  // 8. 핵심 타겟 (필수)
  // 9. 핵심 차별점 (필수)
  // 10. 영상 요구 사항 (선택)
  // 11. 브랜드 로고 이미지 (선택)
  // 12. 제품 이미지 (선택)
  const fields = [
    { name: 'brandName', label: '브랜드명', type: 'text', placeholder: '예: 삼성, 쿠팡, 새로운 브랜드', required: true },
    { name: 'industryCategory', label: '산업 카테고리', type: 'text', placeholder: '예: 뷰티, 푸드, 게임, 테크, 카페 등', required: true },
    { name: 'productServiceCategory', label: '제품/서비스 카테고리', type: 'text', placeholder: '예: 스킨케어, 배달음식, 모바일게임, 클라우드서비스 등', required: true },
    { name: 'productServiceName', label: '제품명/서비스명', type: 'text', placeholder: '예: 갤럭시 S24, 쿠팡이츠, 리그오브레전드 등', required: false },
    { name: 'videoPurpose', label: '영상 목적', type: 'select', options: ['브랜드 인지도 강화', '구매 전환'], required: true },
    { name: 'videoLength', label: '영상 길이', type: 'select', options: ['10초', '30초', '60초'], required: true },
    { name: 'videoAspectRatio', label: '영상 비율', type: 'select',
      options: ['가로 (16:9)', '세로 (9:16)', '정사각형 (1:1)'], required: true },
    { name: 'coreTarget', label: '핵심 타겟', type: 'text', placeholder: '예: 재테크 관심 20대 후반 직장인', required: true },
    { name: 'coreDifferentiation', label: '핵심 차별점', type: 'text', placeholder: '브랜드 독창적 차별 포인트', required: true },
    { name: 'videoRequirements', label: '영상 요구 사항', type: 'textarea', placeholder: '원하는 컨셉 / 톤 / 색감 등 자유 기재', required: false }
  ];

  const handleInputChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleFileUpload = (name, file) => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData(prev => ({
          ...prev,
            [name]: {
              file,
              url: e.target.result,
              name: file.name
          }
        }));
      };
      reader.readAsDataURL(file);

      if (errors[name]) {
        setErrors(prev => ({ ...prev, [name]: '' }));
      }
    }
  };

  const validateForm = () => {
    const newErrors = {};
    fields.forEach(field => {
      if (field.required) {
        const v = formData[field.name];
        if (!v || (typeof v === 'string' && v.trim() === '')) {
          newErrors[field.name] = `${field.label}은(는) 필수 입력 항목입니다.`;
        }
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateForm()) return;

    // 업로드 여부 플래그를 명확화하여 formData에 저장 (서버에서 바로 활용 가능)
    setFormData(prev => ({
      ...prev,
      brandLogoProvided: !!prev.brandLogo,
      productImageProvided: !!prev.productImage
    }));

    onNext();
  };

  const removeFile = (name) => {
    setFormData(prev => ({ ...prev, [name]: null, [`${name}Provided`]: false }));
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        1단계: 광고 설정 입력
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

        {/* 브랜드 로고 업로드 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            브랜드 로고 업로드 (선택)
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-md p-4 hover:border-blue-400 transition-colors">
            {formData.brandLogo ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img 
                    src={formData.brandLogo.url} 
                    alt="브랜드 로고" 
                    className="w-12 h-12 object-cover rounded"
                  />
                  <span className="text-sm text-gray-700">{formData.brandLogo.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile('brandLogo')}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  삭제
                </button>
              </div>
            ) : (
              <div className="text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload('brandLogo', e.target.files[0])}
                  className="hidden"
                  id="brandLogo"
                />
                <label htmlFor="brandLogo" className="cursor-pointer">
                  <div className="text-gray-500">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="mt-2 text-sm">클릭하여 로고 업로드</p>
                    <p className="text-xs text-gray-400">PNG, JPG (최대 10MB)</p>
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* 제품 이미지 업로드 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            제품 이미지 업로드 (선택)
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-md p-4 hover:border-blue-400 transition-colors">
            {formData.productImage ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img 
                    src={formData.productImage.url} 
                    alt="제품 이미지" 
                    className="w-12 h-12 object-cover rounded"
                  />
                  <span className="text-sm text-gray-700">{formData.productImage.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile('productImage')}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  삭제
                </button>
              </div>
            ) : (
              <div className="text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload('productImage', e.target.files[0])}
                  className="hidden"
                  id="productImage"
                />
                <label htmlFor="productImage" className="cursor-pointer">
                  <div className="text-gray-500">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="mt-2 text-sm">클릭하여 제품 이미지 업로드</p>
                    <p className="text-xs text-gray-400">PNG, JPG (최대 10MB)</p>
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>
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

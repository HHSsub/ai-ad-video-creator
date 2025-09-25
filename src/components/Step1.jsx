import { useState, useRef } from 'react';

const Step1 = ({ formData, setFormData, next }) => {
  const [errors, setErrors] = useState({});
  const brandLogoRef = useRef(null);
  const productImageRef = useRef(null);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // 에러가 있으면 제거
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };
  
  const handleFileUpload = async (file, field) => {
    if (!file) return;

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrors(prev => ({
        ...prev,
        [field]: '파일 크기는 10MB 이하여야 합니다.'
      }));
      return;
    }

    // 이미지 파일 타입 확인
    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({
        ...prev,
        [field]: '이미지 파일만 업로드 가능합니다.'
      }));
      return;
    }

    try {
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });

      setFormData(prev => ({
        ...prev,
        [field]: {
          file,
          url: base64,
          name: file.name,
          size: file.size
        }
      }));

      // 에러 제거
      if (errors[field]) {
        setErrors(prev => ({
          ...prev,
          [field]: null
        }));
      }
    } catch (error) {
      setErrors(prev => ({
        ...prev,
        [field]: '파일 업로드에 실패했습니다.'
      }));
    }
  };

  const removeFile = (field) => {
    setFormData(prev => ({
      ...prev,
      [field]: null
    }));
    
    // 파일 input 초기화
    if (field === 'brandLogo' && brandLogoRef.current) {
      brandLogoRef.current.value = '';
    }
    if (field === 'productImage' && productImageRef.current) {
      productImageRef.current.value = '';
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    // 필수 필드 검증
    if (!formData.brandName?.trim()) {
      newErrors.brandName = '브랜드명을 입력해주세요.';
    }
    
    if (!formData.industryCategory?.trim()) {
      newErrors.industryCategory = '산업 카테고리를 입력해주세요.';
    }
    
    if (!formData.productServiceCategory?.trim()) {
      newErrors.productServiceCategory = '제품/서비스 카테고리를 입력해주세요.';
    }
    
    if (!formData.productServiceName?.trim()) {
      newErrors.productServiceName = '제품명/서비스명을 입력해주세요.';
    }
    
    if (!formData.videoPurpose) {
      newErrors.videoPurpose = '영상 목적을 선택해주세요.';
    }
    
    if (!formData.videoLength) {
      newErrors.videoLength = '영상 길이를 선택해주세요.';
    }
    
    if (!formData.coreTarget?.trim()) {
      newErrors.coreTarget = '핵심 타겟을 입력해주세요.';
    }
    
    if (!formData.coreDifferentiation?.trim()) {
      newErrors.coreDifferentiation = '핵심 차별점을 입력해주세요.';
    }
    
    if (!formData.aspectRatioCode) {
      newErrors.aspectRatioCode = '영상 비율을 선택해주세요.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      next(); 
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Step 1: 기본 정보 입력</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 브랜드명 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              브랜드명 *
            </label>
            <input
              type="text"
              value={formData.brandName || ''}
              onChange={(e) => handleInputChange('brandName', e.target.value)}
              placeholder="예: 삼성, LG, 현대"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.brandName ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.brandName && (
              <p className="mt-1 text-sm text-red-600">{errors.brandName}</p>
            )}
          </div>

          {/* 산업 카테고리 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              산업 카테고리 *
            </label>
            <input
              type="text"
              value={formData.industryCategory || ''}
              onChange={(e) => handleInputChange('industryCategory', e.target.value)}
              placeholder="예: 전자제품, 자동차, 화장품"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.industryCategory ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.industryCategory && (
              <p className="mt-1 text-sm text-red-600">{errors.industryCategory}</p>
            )}
          </div>

          {/* 제품/서비스 카테고리 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              제품/서비스 카테고리 *
            </label>
            <input
              type="text"
              value={formData.productServiceCategory || ''}
              onChange={(e) => handleInputChange('productServiceCategory', e.target.value)}
              placeholder="예: 스마트폰, 세단, 스킨케어"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.productServiceCategory ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.productServiceCategory && (
              <p className="mt-1 text-sm text-red-600">{errors.productServiceCategory}</p>
            )}
          </div>

          {/* 제품명/서비스명 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              제품명/서비스명 *
            </label>
            <input
              type="text"
              value={formData.productServiceName || ''}
              onChange={(e) => handleInputChange('productServiceName', e.target.value)}
              placeholder="예: 갤럭시 S24, 아반떼, 후"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.productServiceName ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.productServiceName && (
              <p className="mt-1 text-sm text-red-600">{errors.productServiceName}</p>
            )}
          </div>

          {/* 영상 목적 - 수정된 부분 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              영상 목적 *
            </label>
            <select
              value={formData.videoPurpose || ''}
              onChange={(e) => handleInputChange('videoPurpose', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.videoPurpose ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">선택해주세요</option>
              <option value="제품">제품</option>
              <option value="서비스">서비스</option>
            </select>
            {errors.videoPurpose && (
              <p className="mt-1 text-sm text-red-600">{errors.videoPurpose}</p>
            )}
          </div>

          {/* 영상 길이 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              영상 길이 *
            </label>
            <select
              value={formData.videoLength || ''}
              onChange={(e) => handleInputChange('videoLength', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.videoLength ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">선택해주세요</option>
              <option value="10초">10초</option>
              <option value="20초">20초</option>
              <option value="30초">30초</option>
            </select>
            {errors.videoLength && (
              <p className="mt-1 text-sm text-red-600">{errors.videoLength}</p>
            )}
          </div>

          {/* 영상 비율 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              영상 비율 *
            </label>
            <select
              value={formData.aspectRatioCode || ''}
              onChange={(e) => handleInputChange('aspectRatioCode', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.aspectRatioCode ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">선택해주세요</option>
              <option value="widescreen_16_9">16:9 (와이드스크린)</option>
              <option value="vertical_9_16">9:16 (세로형)</option>
              <option value="square_1_1">1:1 (정사각형)</option>
            </select>
            {errors.aspectRatioCode && (
              <p className="mt-1 text-sm text-red-600">{errors.aspectRatioCode}</p>
            )}
          </div>
        </div>

        {/* 핵심 타겟 */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            핵심 타겟 *
          </label>
          <textarea
            value={formData.coreTarget || ''}
            onChange={(e) => handleInputChange('coreTarget', e.target.value)}
            placeholder="예: 20-30대 직장인 여성, 스마트폰 업그레이드를 고려하는 사람"
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.coreTarget ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.coreTarget && (
            <p className="mt-1 text-sm text-red-600">{errors.coreTarget}</p>
          )}
        </div>

        {/* 핵심 차별점 */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            핵심 차별점 (UVP) *
          </label>
          <textarea
            value={formData.coreDifferentiation || ''}
            onChange={(e) => handleInputChange('coreDifferentiation', e.target.value)}
            placeholder="예: 업계 최초 접이식 디스플레이, 24시간 배터리 지속시간"
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.coreDifferentiation ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.coreDifferentiation && (
            <p className="mt-1 text-sm text-red-600">{errors.coreDifferentiation}</p>
          )}
        </div>

        {/* 영상 요구사항 (Optional) */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            영상 요구사항 (선택사항)
          </label>
          <textarea
            value={formData.videoRequirements || ''}
            onChange={(e) => handleInputChange('videoRequirements', e.target.value)}
            placeholder="예: 밝고 경쾌한 느낌, 젊은 감성, 모던한 스타일"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* 파일 업로드 섹션 */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 브랜드 로고 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              브랜드 로고 (선택사항)
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg">
              <div className="space-y-1 text-center">
                {formData.brandLogo ? (
                  <div className="relative">
                    <img
                      src={formData.brandLogo.url}
                      alt="브랜드 로고 미리보기"
                      className="mx-auto h-20 w-20 object-contain"
                    />
                    <button
                      onClick={() => removeFile('brandLogo')}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
                    >
                      ×
                    </button>
                    <p className="mt-2 text-xs text-gray-600">{formData.brandLogo.name}</p>
                  </div>
                ) : (
                  <>
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex text-sm text-gray-600">
                      <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                        <span>로고 업로드</span>
                        <input
                          ref={brandLogoRef}
                          type="file"
                          className="sr-only"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e.target.files[0], 'brandLogo')}
                        />
                      </label>
                      <p className="pl-1">또는 드래그</p>
                    </div>
                    <p className="text-xs text-gray-500">PNG, JPG, GIF (최대 10MB)</p>
                  </>
                )}
              </div>
            </div>
            {errors.brandLogo && (
              <p className="mt-1 text-sm text-red-600">{errors.brandLogo}</p>
            )}
          </div>

          {/* 제품 이미지 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              제품 이미지 (선택사항)
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg">
              <div className="space-y-1 text-center">
                {formData.productImage ? (
                  <div className="relative">
                    <img
                      src={formData.productImage.url}
                      alt="제품 이미지 미리보기"
                      className="mx-auto h-20 w-20 object-contain"
                    />
                    <button
                      onClick={() => removeFile('productImage')}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
                    >
                      ×
                    </button>
                    <p className="mt-2 text-xs text-gray-600">{formData.productImage.name}</p>
                  </div>
                ) : (
                  <>
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex text-sm text-gray-600">
                      <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                        <span>제품 이미지 업로드</span>
                        <input
                          ref={productImageRef}
                          type="file"
                          className="sr-only"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e.target.files[0], 'productImage')}
                        />
                      </label>
                      <p className="pl-1">또는 드래그</p>
                    </div>
                    <p className="text-xs text-gray-500">PNG, JPG, GIF (최대 10MB)</p>
                  </>
                )}
              </div>
            </div>
            {errors.productImage && (
              <p className="mt-1 text-sm text-red-600">{errors.productImage}</p>
            )}
          </div>
        </div>

        {/* 다음 버튼 */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSubmit}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            다음 단계로
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step1;

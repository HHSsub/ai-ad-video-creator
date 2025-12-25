import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './Step1Manual.css';

const Step1Manual = ({ formData, setFormData, user, onPrev, onNext }) => {
  const [errors, setErrors] = useState({});

  // ✅ Manual mode 설정
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      mode: 'manual'
    }));
  }, [setFormData]);

  // 필수 옵션값 (fieldConfig.js와 정확히 일치)
  const VIDEO_LENGTHS = ['10초', '20초', '30초'];
  const ASPECT_RATIOS = [
    { value: 'widescreen_16_9', label: '16:9 (가로형)' },
    { value: 'square_1_1', label: '1:1 (정사각형)' },
    { value: 'portrait_9_16', label: '9:16 (세로형)' }
  ];
  const VIDEO_PURPOSES = [
    { value: 'product', label: '제품' },
    { value: 'service', label: '서비스' }
  ];

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // 에러 제거
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // 필수 옵션 검증
    if (!formData.videoLength) {
      newErrors.videoLength = '영상 길이를 선택하세요';
    }
    if (!formData.aspectRatioCode) {
      newErrors.aspectRatioCode = '영상 비율을 선택하세요';
    }
    if (!formData.videoPurpose) {
      newErrors.videoPurpose = '영상 목적을 선택하세요';
    }

    // 자연어 입력 검증
    if (!formData.userdescription || formData.userdescription.trim().length < 10) {
      newErrors.userdescription = '최소 10자 이상 입력하세요';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        handleChange('imageUpload', event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
    if (!validateForm()) {
      alert('필수 항목을 모두 입력해주세요');
      return;
    }

    onNext();
  };

  return (
    <div className="step1-manual">
      <div className="manual-header">
        <h1>Manual Mode - 세밀한 설정</h1>
        <p>필수 옵션을 선택하고, 원하는 영상을 자유롭게 설명해주세요</p>
      </div>

      <div className="manual-form">
        {/* 1. 영상 길이 */}
        <div className="form-section">
          <label className="section-label">
            1. 영상 길이 *
            {errors.videoLength && <span className="error-text">{errors.videoLength}</span>}
          </label>
          <div className="option-group">
            {VIDEO_LENGTHS.map(length => (
              <button
                key={length}
                type="button"
                className={`option-btn ${formData.videoLength === length ? 'selected' : ''}`}
                onClick={() => handleChange('videoLength', length)}
              >
                {length}
              </button>
            ))}
          </div>
        </div>

        {/* 2. 영상 비율 */}
        <div className="form-section">
          <label className="section-label">
            2. 영상 비율 *
            {errors.aspectRatioCode && <span className="error-text">{errors.aspectRatioCode}</span>}
          </label>
          <div className="option-group">
            {ASPECT_RATIOS.map(ratio => (
              <button
                key={ratio.value}
                type="button"
                className={`option-btn ${formData.aspectRatioCode === ratio.value ? 'selected' : ''}`}
                onClick={() => handleChange('aspectRatioCode', ratio.value)}
              >
                {ratio.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. 영상 목적 */}
        <div className="form-section">
          <label className="section-label">
            3. 영상 목적 *
            {errors.videoPurpose && <span className="error-text">{errors.videoPurpose}</span>}
          </label>
          <div className="option-group">
            {VIDEO_PURPOSES.map(purpose => (
              <button
                key={purpose.value}
                type="button"
                className={`option-btn ${formData.videoPurpose === purpose.value ? 'selected' : ''}`}
                onClick={() => handleChange('videoPurpose', purpose.value)}
              >
                {purpose.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. 자연어 입력 */}
        <div className="form-section">
          <label className="section-label">
            4. 원하는 영상 설명 *
            {errors.userdescription && <span className="error-text">{errors.userdescription}</span>}
          </label>
          <div className="natural-language-box">
            <textarea
              value={formData.userdescription || ''}
              onChange={(e) => handleChange('userdescription', e.target.value)}
              placeholder="예시:
- 70대 할머니가 나와서 깽판을 치는 재밌는 광고영상을 제작해줘
- 신제품 출시를 알리는 세련된 티저 영상
- 젊은 세대를 타겟으로 한 역동적인 브랜드 영상
- 감성적인 스토리텔링이 담긴 기업 홍보 영상

자유롭게 작성하세요. AI가 이해하고 최적의 영상을 생성합니다."
              rows={10}
              maxLength={2000}
            />
            <div className="char-count">
              {(formData.userdescription || '').length} / 2000
            </div>
          </div>
        </div>

        {/* 5. 이미지 업로드 */}
        <div className="form-section">
          <label className="section-label">
            5. 이미지 업로드 (선택)
          </label>
          <div className="relative group/upload">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              id="manual-image-upload"
              onChange={handleImageUpload}
            />

            <label
              htmlFor="manual-image-upload"
              className="relative block cursor-pointer group/label"
            >
              <div className="border-2 border-dashed border-gray-600/50 rounded-xl p-8 text-center bg-gray-900/30 hover:border-gray-500/70 hover:bg-gray-800/40 transition-all duration-300">
                <div className="space-y-4">
                  {formData.imageUpload ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center w-32 h-32 mx-auto bg-gray-800/60 rounded-lg overflow-hidden border border-gray-600/40">
                        <img
                          src={formData.imageUpload}
                          alt="업로드된 이미지"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleChange('imageUpload', '');
                        }}
                        className="text-red-400 text-sm hover:underline"
                      >
                        이미지 제거
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="mx-auto w-12 h-12 text-gray-500">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </div>
                      <div className="text-blue-400 font-medium">이미지 선택</div>
                      <p className="text-xs text-gray-500">제품/로고 이미지 (JPG, PNG)</p>
                    </div>
                  )}
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* 필수 옵션 요약 */}
        <div className="summary-box">
          <h3>📋 선택한 옵션</h3>
          <div className="summary-content">
            <div className="summary-item">
              <span className="summary-label">영상 길이:</span>
              <span className="summary-value">{formData.videoLength || '-'}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">영상 비율:</span>
              <span className="summary-value">
                {ASPECT_RATIOS.find(r => r.value === formData.aspectRatioCode)?.label || '-'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">영상 목적:</span>
              <span className="summary-value">
                {VIDEO_PURPOSES.find(p => p.value === formData.videoPurpose)?.label || '-'}
              </span>
            </div>
          </div>
        </div>
        {/* 버튼 영역 */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-700 mt-8">
          {/* ✅ 이전 버튼 추가 */}
          <button
            onClick={onPrev}
            className="px-6 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
          >
            ← 이전 단계
          </button>

          {/* 기존 다음 버튼 */}
          <button
            className="btn-submit px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg transition-all duration-200 font-medium"
            onClick={handleSubmit}
          >
            다음 단계로 →
          </button>
        </div>
      </div>
    </div>
  );
};

Step1Manual.propTypes = {
  formData: PropTypes.object.isRequired,
  setFormData: PropTypes.func.isRequired,
  user: PropTypes.object.isRequired,
  onPrev: PropTypes.func,
  onNext: PropTypes.func.isRequired
};

export default Step1Manual;

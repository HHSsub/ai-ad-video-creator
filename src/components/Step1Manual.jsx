import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './Step1Manual.css';
import { loadFieldConfig, saveFieldConfig } from '../utils/fieldConfig';

const Step1Manual = ({ form Data, setFormData, user, onPrev, onNext }) => {
  useEffect(() => {
    forceScrollTop();
  }, []);

  const [errors, setErrors] = useState({});
  const isAdmin = user?.role === 'admin';

  // ✅ Manual mode 설정
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      mode: 'manual'
    }));
  }, [setFormData]);

  // 🔥 [M] Person Selection 기능
  const [persons, setPersons] = useState([]);
  const [personConfigVisible, setPersonConfigVisible] = useState(false);
  // 🔥 Manual Mode 동적 설정 state
  const [manualConfig, setManualConfig] = useState({ imageUpload: { visible: true } });

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const fullConfig = await loadFieldConfig();

        // 1. Person Selection Config
        if (fullConfig.personSelection?.visible) {
          setPersonConfigVisible(true);
          const personsRes = await fetch('/nexxii/api/persons');
          const personsData = await personsRes.json();
          if (personsData.success) {
            setPersons(personsData.persons || []);
          }
        }

        // 2. Manual Mode Config
        if (fullConfig.manualMode) {
          setManualConfig(fullConfig.manualMode);
        }
      } catch (error) {
        console.error('Config load error:', error);
      }
    };
    loadConfig();
  }, []);

  const handleManualHideField = async (key) => {
    try {
      const currentConfig = await loadFieldConfig();
      const newConfig = {
        ...currentConfig,
        manualMode: {
          ...currentConfig.manualMode,
          [key]: {
            ...currentConfig.manualMode?.[key],
            visible: false
          }
        }
      };
      await saveFieldConfig(newConfig);
      setManualConfig(newConfig.manualMode);
    } catch (e) {
      console.error('Hide field error:', e);
    }
  };

  const handleManualRestoreField = async (key) => {
    try {
      const currentConfig = await loadFieldConfig();
      const newConfig = {
        ...currentConfig,
        manualMode: {
          ...currentConfig.manualMode,
          [key]: {
            ...currentConfig.manualMode?.[key],
            visible: true
          }
        }
      };
      await saveFieldConfig(newConfig);
      setManualConfig(newConfig.manualMode);
    } catch (e) {
      console.error('Restore field error:', e);
    }
  };

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

  const isImageUploadVisible = manualConfig?.imageUpload?.visible !== false;

  return (
    <div className="step1-manual">
      <div className="manual-header">
        <h1>Custom Mode - 세밀한 설정</h1>
        <p>필수 옵션을 선택하고, 원하는 영상을 자유롭게 설명해주세요</p>

        {/* 🔥 Admin 전용: 숨겨진 항목 복구 UI */}
        {isAdmin && !isImageUploadVisible && (
          <div className="mt-4 text-sm bg-gray-800/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/40 shadow-xl inline-block">
            <span className="text-gray-300 block mb-2 font-semibold">숨겨진 항목:</span>
            <div className="flex gap-2">
              <button
                onClick={() => handleManualRestoreField('imageUpload')}
                className="text-blue-300 hover:text-blue-200 underline underline-offset-2 text-sm px-3 py-2 bg-blue-600/15 hover:bg-blue-600/25 rounded-xl transition-all duration-200 border border-blue-500/30"
              >
                이미지 업로드 (복구)
              </button>
            </div>
          </div>
        )}
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

        {/* 5. 이미지 업로드 (설정에 따라 숨김 가능) */}
        {isImageUploadVisible && (
          <div className="form-section">
            <div className="flex items-center justify-between mb-2">
              <label className="section-label mb-0">
                5. 이미지 업로드 (선택)
              </label>
              {isAdmin && (
                <button
                  onClick={() => handleManualHideField('imageUpload')}
                  className="text-red-300 hover:text-red-200 text-xs px-3 py-1.5 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
                >
                  숨기기
                </button>
              )}
            </div>

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
        )}

        {/* 🔥 Person Selection UI */}
        {personConfigVisible && persons.length > 0 && (
          <div className="form-section">
            <label className="section-label">
              6. 인물 선택 (선택)
            </label>
            <div className="bg-gray-900/40 rounded-xl p-6 border border-gray-700">
              <p className="text-sm text-gray-400 mb-4">
                영상에 합성할 인물을 선택하세요. 선택하지 않으면 인물 합성이 적용되지 않습니다.
              </p>

              <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                {/* None Option */}
                <div
                  onClick={() => handleChange('personSelection', '')}
                  className={`flex-shrink-0 w-24 h-32 rounded-lg border-2 cursor-pointer flex items-center justify-center transition-all ${!formData.personSelection
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                    }`}
                >
                  <span className="text-sm text-gray-400 font-bold">선택 안함</span>
                </div>

                {persons.map(person => (
                  <div
                    key={person.key}
                    onClick={() => handleChange('personSelection', person.url)}
                    className={`relative flex-shrink-0 w-24 h-32 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${formData.personSelection === person.url
                      ? 'border-blue-500 ring-2 ring-blue-500/30'
                      : 'border-gray-700 hover:border-gray-500'
                      }`}
                  >
                    <img src={person.url} alt={person.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-center">
                      <span className="text-[10px] text-white truncate block">{person.name}</span>
                    </div>
                    {formData.personSelection === person.url && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-md">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
    </div >
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

import { useState, useRef, useEffect, useCallback } from 'react';
import { loadFieldConfig, saveFieldConfig, applyDefaultValues, setupFieldConfigSync } from '../utils/fieldConfig';

const Step1 = ({ formData, setFormData, onNext, user }) => {
  const [errors, setErrors] = useState({});
  const [fieldConfig, setFieldConfig] = useState({});
  const [editingLabel, setEditingLabel] = useState(null);
  const [tempLabel, setTempLabel] = useState('');
  const [adminSettings, setAdminSettings] = useState({});
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [tempDescription, setTempDescription] = useState('');
  const imageRef = useRef(null);

  // 관리자 권한 확인
  const isAdmin = user?.role === 'admin';

  // 🔥 실시간 설정 동기화
  const handleSettingsUpdate = useCallback((type, data) => {
    if (type === 'config') {
      setFieldConfig(data);
    } else if (type === 'admin') {
      setAdminSettings(data);
      console.log('[Step1] Admin 설정 업데이트:', data);
    }
  }, []);

  // 컴포넌트 마운트 시 설정 로드 및 실시간 동기화 설정
  useEffect(() => {
    const config = loadFieldConfig();
    setFieldConfig(config);

    // 숨겨진 필드들의 기본값 적용
    const defaultValues = applyDefaultValues(config);
    if (Object.keys(defaultValues).length > 0) {
      setFormData(prev => ({ ...prev, ...defaultValues }));
    }

    // 🔥 서버에서 Admin 설정 로드
    loadAdminSettingsFromServer();

    // 🔥 실시간 동기화 설정
    const cleanup = setupFieldConfigSync(handleSettingsUpdate);

    return cleanup;
  }, [handleSettingsUpdate, setFormData]);

  // 🔥 서버에서 Admin 설정 로드
  const loadAdminSettingsFromServer = async () => {
    try {
      const response = await fetch('/api/admin-config');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAdminSettings(data.adminSettings);
          console.log('[Step1] 서버 Admin 설정 로드됨:', data.adminSettings);
        }
      }
    } catch (error) {
      console.error('[Step1] Admin 설정 로드 오류:', error);
    }
  };

  // 🔥 이미지 업로드 라벨과 설명 가져오기
  const getImageUploadConfig = () => {
    const imageConfig = adminSettings.imageUpload || {};
    const label = imageConfig.label || '이미지 업로드';
    
    const descriptions = imageConfig.descriptions || {
      product: '제품일 때엔 제품 이미지를, 서비스 홍보일 때엔 브랜드 로고 이미지를 올려주세요',
      service: '서비스 홍보용 브랜드 로고 이미지를 올려주세요',
      brand: '브랜드 인지도 향상을 위한 로고 이미지를 올려주세요',
      conversion: '구매 유도용 제품 이미지를 올려주세요',
      education: '사용법 안내용 제품 이미지를 올려주세요',
      default: '제품일 때엔 제품 이미지를, 서비스 홍보일 때엔 브랜드 로고 이미지를 올려주세요'
    };

    const videoPurpose = formData.videoPurpose || 'default';
    const description = descriptions[videoPurpose] || descriptions.default;

    return { label, description };
  };

  // 🔥 이미지 업로드 설정 저장 (관리자용)
  const saveImageUploadConfig = async (label, description) => {
    if (!isAdmin) return;

    try {
      const response = await fetch('/api/admin-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Admin'
        },
        body: JSON.stringify({
          type: 'image-upload-labels',
          updates: {
            label,
            descriptions: {
              [formData.videoPurpose || 'default']: description
            }
          },
          isAdmin: true
        })
      });

      if (response.ok) {
        const result = await response.json();
        setAdminSettings(result.adminSettings);
        console.log('[Step1] 이미지 업로드 설정 저장됨');
      }
    } catch (error) {
      console.error('[Step1] 이미지 업로드 설정 저장 오류:', error);
    }
  };

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

  // 🔥 통합 이미지 업로드 핸들러
  const handleFileUpload = async (file, field) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrors(prev => ({
        ...prev,
        [field]: '파일 크기는 10MB 이하여야 합니다.'
      }));
      return;
    }

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

      // 🔥 통합된 imageUpload 필드로 저장 + 백워드 호환성
      setFormData(prev => ({
        ...prev,
        [field]: {
          file,
          url: base64,
          name: file.name,
          size: file.size
        },
        // 백워드 호환성을 위해 기존 필드도 동일한 데이터로 설정
        productImage: {
          file,
          url: base64,
          name: file.name,
          size: file.size
        },
        brandLogo: {
          file,
          url: base64,
          name: file.name,
          size: file.size
        }
      }));

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
      [field]: null,
      // 백워드 호환성을 위해 기존 필드들도 null로 설정
      productImage: null,
      brandLogo: null
    }));
  };

  const handleSubmit = () => {
    const newErrors = {};
    let hasErrors = false;

    // 필수 필드 검증
    Object.values(fieldConfig).forEach(field => {
      if (field.required && field.visible && (!formData[field.key] || formData[field.key] === '')) {
        newErrors[field.key] = `${field.label}은(는) 필수 입력 항목입니다.`;
        hasErrors = true;
      }
    });

    if (hasErrors) {
      setErrors(newErrors);
      return;
    }

    onNext();
  };

  // 관리자 전용: 필드 숨기기
  const handleHideField = (fieldKey) => {
    const updatedConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        visible: false
      }
    };
    setFieldConfig(updatedConfig);
    saveFieldConfig(updatedConfig);
  };

  // 관리자 전용: 필드 복원
  const handleRestoreField = (fieldKey) => {
    const updatedConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        visible: true
      }
    };
    setFieldConfig(updatedConfig);
    saveFieldConfig(updatedConfig);
  };

  // 관리자 전용: 라벨 편집
  const handleLabelEdit = (fieldKey, newLabel) => {
    const updatedConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        label: newLabel
      }
    };
    setFieldConfig(updatedConfig);
    saveFieldConfig(updatedConfig);
    setEditingLabel(null);
  };

  const renderTextField = (field) => (
    <div key={field.key} className="space-y-2">
      <div className="flex items-center justify-between">
        {editingLabel === field.key ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="text-sm font-medium text-gray-700 border-b border-gray-300 bg-transparent"
              autoFocus
            />
            <button
              onClick={() => handleLabelEdit(field.key, tempLabel)}
              className="text-green-600 hover:text-green-700"
            >
              ✓
            </button>
            <button
              onClick={() => setEditingLabel(null)}
              className="text-red-600 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        ) : (
          <label className="text-sm font-medium text-gray-700">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        {isAdmin && field.key !== 'industryCategory' && field.key !== 'productServiceCategory' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingLabel(field.key);
                setTempLabel(field.label);
              }}
              className="text-blue-600 hover:text-blue-700 text-xs"
            >
              편집
            </button>
            <button
              onClick={() => handleHideField(field.key)}
              className="text-red-600 hover:text-red-700 text-xs"
            >
              숨기기
            </button>
          </div>
        )}
      </div>
      <input
        type="text"
        value={formData[field.key] || ''}
        onChange={(e) => handleInputChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {errors[field.key] && (
        <p className="text-sm text-red-600">{errors[field.key]}</p>
      )}
    </div>
  );

  const renderTextAreaField = (field) => (
    <div key={field.key} className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingLabel(field.key);
                setTempLabel(field.label);
              }}
              className="text-blue-600 hover:text-blue-700 text-xs"
            >
              편집
            </button>
            <button
              onClick={() => handleHideField(field.key)}
              className="text-red-600 hover:text-red-700 text-xs"
            >
              숨기기
            </button>
          </div>
        )}
      </div>
      <textarea
        value={formData[field.key] || ''}
        onChange={(e) => handleInputChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
      />
      {errors[field.key] && (
        <p className="text-sm text-red-600">{errors[field.key]}</p>
      )}
    </div>
  );

  const renderSelectField = (field) => (
    <div key={field.key} className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>

        {isAdmin && field.key !== 'industryCategory' && field.key !== 'productServiceCategory' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingLabel(field.key);
                setTempLabel(field.label);
              }}
              className="text-blue-600 hover:text-blue-700 text-xs"
            >
              편집
            </button>
            <button
              onClick={() => handleHideField(field.key)}
              className="text-red-600 hover:text-red-700 text-xs"
            >
              숨기기
            </button>
          </div>
        )}
      </div>
      <select
        value={formData[field.key] || ''}
        onChange={(e) => handleInputChange(field.key, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="">{field.placeholder}</option>
        {field.options?.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {errors[field.key] && (
        <p className="text-sm text-red-600">{errors[field.key]}</p>
      )}
    </div>
  );

  // 🔥 통합된 이미지 업로드 필드 렌더링 (실시간 Admin 설정 반영)
  const renderImageField = (field, descField) => {
    const { label, description } = getImageUploadConfig();

    return (
      <div key={field.key} className="col-span-2 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            {label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>

          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingLabel(field.key);
                  setTempLabel(label);
                }}
                className="text-blue-600 hover:text-blue-700 text-xs"
              >
                라벨 편집
              </button>
              <button
                onClick={() => {
                  setIsEditingDescription(true);
                  setTempDescription(description);
                }}
                className="text-green-600 hover:text-green-700 text-xs"
              >
                설명 편집
              </button>
              <button
                onClick={() => handleHideField(field.key)}
                className="text-red-600 hover:text-red-700 text-xs"
              >
                숨기기
              </button>
            </div>
          )}
        </div>

        {/* 🔥 라벨 편집 모드 */}
        {editingLabel === field.key && (
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="text-sm font-medium text-gray-700 border border-gray-300 rounded px-2 py-1"
              placeholder="라벨 입력"
            />
            <button
              onClick={async () => {
                await saveImageUploadConfig(tempLabel, description);
                setEditingLabel(null);
              }}
              className="text-green-600 hover:text-green-700 text-xs px-2 py-1 border rounded"
            >
              저장
            </button>
            <button
              onClick={() => setEditingLabel(null)}
              className="text-red-600 hover:text-red-700 text-xs px-2 py-1 border rounded"
            >
              취소
            </button>
          </div>
        )}

        {/* 🔥 설명문구 편집 모드 */}
        {isEditingDescription && (
          <div className="mb-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              설명문구 편집 ({formData.videoPurpose || 'default'}용)
            </label>
            <textarea
              value={tempDescription}
              onChange={(e) => setTempDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              rows={2}
              placeholder="설명문구를 입력하세요"
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={async () => {
                  await saveImageUploadConfig(label, tempDescription);
                  setIsEditingDescription(false);
                }}
                className="text-green-600 hover:text-green-700 text-xs px-3 py-1 border rounded"
              >
                저장
              </button>
              <button
                onClick={() => setIsEditingDescription(false)}
                className="text-red-600 hover:text-red-700 text-xs px-3 py-1 border rounded"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* 🔥 동적 설명 문구 (Admin이 수정 가능) */}
        <div className="text-sm text-gray-600 mb-3">
          {description}
        </div>

        <div 
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-gray-400 transition-colors"
          onClick={() => imageRef.current?.click()}
        >
          <div className="text-center">
            {formData[field.key] ? (
              <div className="relative">
                <img
                  src={formData[field.key].url}
                  alt="이미지 미리보기"
                  className="mx-auto h-20 w-auto object-contain"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(field.key);
                  }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <p className="text-xs text-gray-500 mt-2">{formData[field.key].name}</p>
              </div>
            ) : (
              <>
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="text-sm text-gray-600">
                  <span className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                    파일 선택하거나 여기에 드래그하세요
                  </span>
                  <input
                    ref={imageRef}
                    type="file"
                    className="sr-only"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e.target.files[0], field.key)}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">PNG, JPG, GIF (최대 10MB)</p>
              </>
            )}
          </div>
        </div>
        {errors[field.key] && (
          <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
        )}
        {/* 이미지 설명 입력란 (옵션) */}
        {descField && renderTextField(descField)}
      </div>
    );
  };

  // 표시되는 필드들만 필터링
  const visibleFields = Object.values(fieldConfig).filter(field => field.visible);
  // 숨겨진 필드들
  const hiddenFields = Object.values(fieldConfig).filter(field => !field.visible);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Step 1: 기본 정보 입력</h2>

          {/* 관리자 전용 숨겨진 필드 관리 */}
          {isAdmin && hiddenFields.length > 0 && (
            <div className="text-sm">
              <span className="text-gray-500">숨겨진 항목: </span>
              {hiddenFields.map((field, index) => (
                <span key={field.key}>
                  <button
                    onClick={() => handleRestoreField(field.key)}
                    className="text-blue-600 hover:text-blue-700 underline"
                    title={`${field.label} 되돌리기`}
                  >
                    {field.label}
                  </button>
                  {index < hiddenFields.length - 1 && ', '}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visibleFields.map(field => {
            // image 필드면 desc까지 함께 전달
            if (field.type === 'image') {
              const descField = visibleFields.find(f => f.key === `${field.key}Desc`);
              return renderImageField(field, descField);
            }
            switch (field.type) {
              case 'text':
                return renderTextField(field);
              case 'textarea':
                return renderTextAreaField(field);
              case 'select':
                return renderSelectField(field);
              default:
                return null;
            }
          })}
        </div>

        {/* 다음 단계 버튼 */}
        <div className="flex justify-end mt-8">
          <button
            onClick={handleSubmit}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            다음 단계 →
          </button>
        </div>

        {/* 🔥 관리자 전용 실시간 설정 상태 표시 */}
        {isAdmin && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">관리자 모드 (실시간 반영)</h3>
                <div className="mt-1 text-sm text-blue-700">
                  <p>• 각 필드의 "편집" 버튼으로 라벨을 수정하거나 "숨기기"로 필드를 제거할 수 있습니다.</p>
                  <p>• 이미지 업로드 필드는 "라벨 편집", "설명 편집"이 가능하며, 변경사항이 다른 사용자에게도 실시간 반영됩니다.</p>
                  {Object.keys(adminSettings).length > 0 && (
                    <p className="mt-2 text-xs">현재 적용된 Admin 설정: {JSON.stringify(Object.keys(adminSettings))}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Step1;

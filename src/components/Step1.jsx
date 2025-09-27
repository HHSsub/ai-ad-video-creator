import { useState, useRef, useEffect, useCallback } from 'react';
import { loadFieldConfig, saveFieldConfig, applyDefaultValues, setupFieldConfigSync } from '../utils/fieldConfig';

const Step1 = ({ formData, setFormData, onNext, user }) => {
  const [errors, setErrors] = useState({});
  const [fieldConfig, setFieldConfig] = useState({});
  const [editingLabel, setEditingLabel] = useState(null);
  const [tempLabel, setTempLabel] = useState('');
  const [adminSettings, setAdminSettings] = useState({});
  const imageRef = useRef(null);

  // 관리자 권한 확인
  const isAdmin = user?.role === 'admin';

  // 실시간 설정 동기화
  const handleSettingsUpdate = useCallback((type, data) => {
    if (type === 'config') {
      setFieldConfig(data);
    } else if (type === 'admin') {
      setAdminSettings(data);
    }
  }, []);

  // 컴포넌트 마운트 시 설정 로드
  useEffect(() => {
    const config = loadFieldConfig();
    setFieldConfig(config);

    const defaultValues = applyDefaultValues(config);
    if (Object.keys(defaultValues).length > 0) {
      setFormData(prev => ({ ...prev, ...defaultValues }));
    }

    loadAdminSettingsFromServer();
    const cleanup = setupFieldConfigSync(handleSettingsUpdate);
    return cleanup;
  }, [handleSettingsUpdate, setFormData]);

  // 서버에서 Admin 설정 로드
  const loadAdminSettingsFromServer = async () => {
    try {
      const response = await fetch('/api/admin-config');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAdminSettings(data.adminSettings);
        }
      }
    } catch (error) {
      console.error('Admin 설정 로드 오류:', error);
    }
  };

  // 이미지 업로드 라벨과 설명 가져오기
  const getImageUploadConfig = () => {
    const imageConfig = adminSettings.imageUpload || {};
    const label = imageConfig.label || '이미지 업로드';
    
    const descriptions = {
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

  // 입력값 변경 처리
  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // 에러 상태 초기화
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  // 이미지 업로드 처리
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const base64 = await fileToBase64(file);
      setFormData(prev => ({
        ...prev,
        imageUpload: {
          url: base64,
          file: file,
          name: file.name
        }
      }));
    } catch (error) {
      console.error('이미지 업로드 오류:', error);
    }
  };

  // 파일을 Base64로 변환
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  // 폼 제출 처리
  const handleSubmit = () => {
    const newErrors = {};
    
    // 필수 필드 검증
    if (!formData.brandName?.trim()) newErrors.brandName = '브랜드명을 입력해주세요.';
    if (!formData.industryCategory) newErrors.industryCategory = '산업 카테고리를 선택해주세요.';
    if (!formData.productServiceCategory) newErrors.productServiceCategory = '제품/서비스 카테고리를 선택해주세요.';
    if (!formData.productServiceName?.trim()) newErrors.productServiceName = '제품명/서비스명을 입력해주세요.';
    if (!formData.videoPurpose) newErrors.videoPurpose = '영상 목적을 선택해주세요.';
    if (!formData.videoLength) newErrors.videoLength = '영상 길이를 선택해주세요.';
    if (!formData.aspectRatio) newErrors.aspectRatio = '영상 비율을 선택해주세요.';
    if (!formData.coreTarget?.trim()) newErrors.coreTarget = '핵심 타겟을 입력해주세요.';
    if (!formData.coreDifferentiation?.trim()) newErrors.coreDifferentiation = '핵심 차별점을 입력해주세요.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onNext();
  };

  // 라벨 수정 시작
  const startEditingLabel = (field, currentLabel) => {
    setEditingLabel(field);
    setTempLabel(currentLabel);
  };

  // 라벨 저장
  const saveLabel = async () => {
    if (!editingLabel || !tempLabel.trim()) return;

    const newConfig = {
      ...fieldConfig,
      [editingLabel]: {
        ...fieldConfig[editingLabel],
        label: tempLabel.trim()
      }
    };

    setFieldConfig(newConfig);
    saveFieldConfig(newConfig);
    setEditingLabel(null);
    setTempLabel('');
  };

  // 필드 숨기기
  const hideField = async (field) => {
    const newConfig = {
      ...fieldConfig,
      [field]: {
        ...fieldConfig[field],
        enabled: false
      }
    };

    setFieldConfig(newConfig);
    saveFieldConfig(newConfig);
  };

  // 이미지 삭제
  const removeImage = () => {
    setFormData(prev => ({
      ...prev,
      imageUpload: null
    }));
  };

  // 되돌리기 (초기화)
  const resetForm = () => {
    setFormData({});
    setErrors({});
  };

  // 필드 렌더링 함수들
  const renderTextField = (field) => {
    const config = fieldConfig[field] || {};
    const fieldId = `field_${field}`;
    
    return (
      <div key={field} className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700">
            {editingLabel === field ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tempLabel}
                  onChange={(e) => setTempLabel(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveLabel();
                    if (e.key === 'Escape') setEditingLabel(null);
                  }}
                />
                <button
                  onClick={saveLabel}
                  className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
                >
                  저장
                </button>
              </div>
            ) : (
              config.label || field
            )}
          </label>
          {isAdmin && (
            <div className="flex gap-1">
              <button
                onClick={() => startEditingLabel(field, config.label || field)}
                className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
              >
                수정
              </button>
              <button
                onClick={() => hideField(field)}
                className="text-xs bg-red-500 text-white px-2 py-1 rounded"
              >
                삭제
              </button>
            </div>
          )}
        </div>
        <input
          id={fieldId}
          type="text"
          value={formData[field] || ''}
          onChange={(e) => handleInputChange(field, e.target.value)}
          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            errors[field] ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder={`${config.label || field}을(를) 입력하세요`}
        />
        {errors[field] && (
          <p className="mt-1 text-sm text-red-600">{errors[field]}</p>
        )}
      </div>
    );
  };

  const renderTextAreaField = (field) => {
    const config = fieldConfig[field] || {};
    const fieldId = `field_${field}`;
    
    return (
      <div key={field} className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700">
            {editingLabel === field ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tempLabel}
                  onChange={(e) => setTempLabel(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveLabel();
                    if (e.key === 'Escape') setEditingLabel(null);
                  }}
                />
                <button
                  onClick={saveLabel}
                  className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
                >
                  저장
                </button>
              </div>
            ) : (
              config.label || field
            )}
          </label>
          {isAdmin && (
            <div className="flex gap-1">
              <button
                onClick={() => startEditingLabel(field, config.label || field)}
                className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
              >
                수정
              </button>
              <button
                onClick={() => hideField(field)}
                className="text-xs bg-red-500 text-white px-2 py-1 rounded"
              >
                삭제
              </button>
            </div>
          )}
        </div>
        <textarea
          id={fieldId}
          value={formData[field] || ''}
          onChange={(e) => handleInputChange(field, e.target.value)}
          rows={3}
          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            errors[field] ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder={`${config.label || field}을(를) 입력하세요`}
        />
        {errors[field] && (
          <p className="mt-1 text-sm text-red-600">{errors[field]}</p>
        )}
      </div>
    );
  };

  const renderSelectField = (field) => {
    const config = fieldConfig[field] || {};
    const fieldId = `field_${field}`;
    
    let options = [];
    if (field === 'industryCategory') {
      options = ['IT/소프트웨어', '금융', '제조업', '서비스업', '교육', '의료', '기타'];
    } else if (field === 'productServiceCategory') {
      options = ['전자제품', '의류', '식품', '화장품', '생활용품', '서비스', '기타'];
    } else if (field === 'videoPurpose') {
      options = [
        { value: 'product', label: '제품' },
        { value: 'service', label: '서비스 홍보' },
        { value: 'brand', label: '브랜드 인지도 향상' },
        { value: 'conversion', label: '구매 유도' },
        { value: 'education', label: '사용법 안내' }
      ];
    } else if (field === 'videoLength') {
      options = ['10초', '20초', '30초'];
    } else if (field === 'aspectRatio') {
      options = [
        { value: 'widescreen_16_9', label: '가로 (16:9)' },
        { value: 'vertical_9_16', label: '세로 (9:16)' },
        { value: 'square_1_1', label: '정사각형 (1:1)' }
      ];
    }

    return (
      <div key={field} className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700">
            {editingLabel === field ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tempLabel}
                  onChange={(e) => setTempLabel(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveLabel();
                    if (e.key === 'Escape') setEditingLabel(null);
                  }}
                />
                <button
                  onClick={saveLabel}
                  className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
                >
                  저장
                </button>
              </div>
            ) : (
              config.label || field
            )}
          </label>
          {isAdmin && (
            <div className="flex gap-1">
              <button
                onClick={() => startEditingLabel(field, config.label || field)}
                className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
              >
                수정
              </button>
              <button
                onClick={() => hideField(field)}
                className="text-xs bg-red-500 text-white px-2 py-1 rounded"
              >
                삭제
              </button>
            </div>
          )}
        </div>
        <select
          id={fieldId}
          value={formData[field] || ''}
          onChange={(e) => handleInputChange(field, e.target.value)}
          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            errors[field] ? 'border-red-500' : 'border-gray-300'
          }`}
        >
          <option value="">{config.label || field}을(를) 선택하세요</option>
          {options.map((option, index) => (
            <option
              key={index}
              value={typeof option === 'object' ? option.value : option}
            >
              {typeof option === 'object' ? option.label : option}
            </option>
          ))}
        </select>
        {errors[field] && (
          <p className="mt-1 text-sm text-red-600">{errors[field]}</p>
        )}
      </div>
    );
  };

  // 필드 설정에 따라 표시할 필드들 결정
  const fieldsToRender = [
    { name: 'brandName', type: 'text' },
    { name: 'industryCategory', type: 'select' },
    { name: 'productServiceCategory', type: 'select' },
    { name: 'productServiceName', type: 'text' },
    { name: 'videoPurpose', type: 'select' },
    { name: 'videoLength', type: 'select' },
    { name: 'aspectRatio', type: 'select' },
    { name: 'coreTarget', type: 'text' },
    { name: 'coreDifferentiation', type: 'text' },
    { name: 'videoRequirements', type: 'textarea' }
  ].filter(field => {
    const config = fieldConfig[field.name];
    return !config || config.enabled !== false;
  });

  const { label: imageLabel, description: imageDescription } = getImageUploadConfig();

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">1단계: 기본 정보 입력</h2>
        <p className="text-gray-600">영상 제작에 필요한 기본 정보를 입력해주세요.</p>
      </div>

      <div className="space-y-6">
        {/* 동적 필드 렌더링 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {fieldsToRender.map((field) => {
            switch (field.type) {
              case 'text':
                return renderTextField(field.name);
              case 'textarea':
                return renderTextAreaField(field.name);
              case 'select':
                return renderSelectField(field.name);
              default:
                return null;
            }
          })}
        </div>

        {/* 이미지 업로드 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              {imageLabel}
            </label>
            {isAdmin && (
              <div className="flex gap-1">
                <button
                  className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
                >
                  수정
                </button>
                <button
                  className="text-xs bg-red-500 text-white px-2 py-1 rounded"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3">{imageDescription}</p>

          {formData.imageUpload ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img
                    src={formData.imageUpload.url}
                    alt="업로드된 이미지"
                    className="w-16 h-16 object-cover rounded"
                  />
                  <span className="text-sm text-gray-700">{formData.imageUpload.name}</span>
                </div>
                <button
                  onClick={removeImage}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  삭제
                </button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                onClick={() => imageRef.current?.click()}
                className="w-full p-4 bg-gray-50 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="text-gray-500">
                  <svg className="mx-auto h-8 w-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span className="text-sm">클릭하여 이미지 업로드</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* 버튼 영역 */}
        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
          <div className="flex gap-2">
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              되돌리기
            </button>
          </div>
          
          <button
            onClick={handleSubmit}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            다음 단계 →
          </button>
        </div>

        {/* 관리자 전용 실시간 설정 상태 표시 - 서버 연동 유지 */}
        {isAdmin && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">관리자 모드 (실시간 반영)</h3>
                <div className="mt-1 text-sm text-blue-700">
                  <p>• 각 필드의 "수정" 버튼으로 라벨을 수정하거나 "삭제"로 필드를 제거할 수 있습니다.</p>
                  <p>• 이미지 업로드 필드는 "수정", "삭제"가 가능하며, 변경사항이 다른 사용자에게도 실시간 반영됩니다.</p>
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

// src/components/Step1.jsx - 영상설명 필드 영구삭제됨 + 1열 세로배치로 수정 + placeholder 편집 기능 추가
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import styles from '../styles/components/Step1.module.css';
import { loadFieldConfig, saveFieldConfig, loadAdminSettings, saveAdminSettings } from '../utils/fieldConfig';

const Step1 = ({ formData, setFormData, user, onNext }) => {
  const [fieldConfig, setFieldConfig] = useState({});
  const [adminSettings, setAdminSettings] = useState({});
  const [errors, setErrors] = useState({});
  const [editingLabel, setEditingLabel] = useState(null);
  const [tempLabel, setTempLabel] = useState('');
  const [editingImageLabel, setEditingImageLabel] = useState(false);
  const [editingImageDesc, setEditingImageDesc] = useState(false);
  const [tempImageLabel, setTempImageLabel] = useState('');
  const [tempImageDesc, setTempImageDesc] = useState('');
  const [editingPlaceholder, setEditingPlaceholder] = useState(null);
  const [tempPlaceholder, setTempPlaceholder] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const config = loadFieldConfig();
    const settings = loadAdminSettings();
    setFieldConfig(config);
    setAdminSettings(settings);
  }, []);

  // 🔥 실시간 Admin 설정 변경 감지
  useEffect(() => {
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const channel = new BroadcastChannel('field-config-updates');
      
      const handleConfigUpdate = (event) => {
        if (event.data.type === 'FIELD_CONFIG_UPDATED') {
          setFieldConfig(event.data.config);
        } else if (event.data.type === 'ADMIN_SETTINGS_UPDATED') {
          setAdminSettings(event.data.settings);
        }
      };

      channel.addEventListener('message', handleConfigUpdate);
      return () => {
        channel.removeEventListener('message', handleConfigUpdate);
        channel.close();
      };
    }
  }, []);

  const handleInputChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    // 에러 제거
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: null }));
    }
  };

  const handleHideField = (fieldKey) => {
    const newConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        visible: false
      }
    };
    setFieldConfig(newConfig);
    saveFieldConfig(newConfig);
  };

  const handleRestoreField = (fieldKey) => {
    const newConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        visible: true
      }
    };
    setFieldConfig(newConfig);
    saveFieldConfig(newConfig);
  };

  const handleLabelEdit = (fieldKey, newLabel) => {
    const newSettings = {
      ...adminSettings,
      [fieldKey]: {
        ...adminSettings[fieldKey],
        label: newLabel
      }
    };
    setAdminSettings(newSettings);
    saveAdminSettings(newSettings);
    setEditingLabel(null);
    setTempLabel('');
  };

  const handlePlaceholderEdit = (fieldKey, newPlaceholder) => {
    const newConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        placeholder: newPlaceholder
      }
    };
    setFieldConfig(newConfig);
    saveFieldConfig(newConfig);
    setEditingPlaceholder(null);
    setTempPlaceholder('');
  };

  // 🔥 통합된 이미지 업로드 설정 (실시간 Admin 반영)
  const getImageUploadConfig = () => {
    const purpose = formData.videoPurpose;
    const imageFieldSettings = adminSettings.imageUpload || {};
    
    // Admin이 설정한 커스텀 라벨/설명이 있으면 우선 사용
    if (imageFieldSettings.label || imageFieldSettings.description) {
      return {
        label: imageFieldSettings.label || fieldConfig.imageUpload?.label || '이미지 업로드',
        description: imageFieldSettings.description || fieldConfig.imageUpload?.descriptions?.default || '이미지를 업로드해주세요'
      };
    }

    // 기본 로직: videoPurpose에 따른 동적 설명
    const descriptions = fieldConfig.imageUpload?.descriptions || {};
    const baseLabel = fieldConfig.imageUpload?.label || '이미지 업로드';
    
    return {
      label: baseLabel,
      description: descriptions[purpose] || descriptions.default || '이미지를 업로드해주세요'
    };
  };

  const handleImageLabelEdit = (newLabel) => {
    const newSettings = {
      ...adminSettings,
      imageUpload: {
        ...adminSettings.imageUpload,
        label: newLabel
      }
    };
    setAdminSettings(newSettings);
    saveAdminSettings(newSettings);
    setEditingImageLabel(false);
    setTempImageLabel('');
  };

  const handleImageDescEdit = (newDesc) => {
    const newSettings = {
      ...adminSettings,
      imageUpload: {
        ...adminSettings.imageUpload,
        description: newDesc
      }
    };
    setAdminSettings(newSettings);
    saveAdminSettings(newSettings);
    setEditingImageDesc(false);
    setTempImageDesc('');
  };

  const validateForm = () => {
    const newErrors = {};
    const visibleFields = Object.values(fieldConfig).filter(field => field.visible);

    visibleFields.forEach(field => {
      if (field.required && !formData[field.key]) {
        newErrors[field.key] = `${field.label}을(를) 입력해주세요.`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      console.log('Form validation passed, calling onNext');
      onNext();
    } else {
      console.log('Form validation failed:', errors);
    }
  };

  const getDisplayLabel = (field) => {
    return adminSettings[field.key]?.label || field.label;
  };

  const renderTextField = (field) => (
    <div key={field.key} className="space-y-2">
      <div className="flex items-center justify-between">
        {editingLabel === field.key ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="text-sm font-medium text-gray-700 border border-gray-300 rounded px-2 py-1 flex-1"
              autoFocus
            />
            <button
              onClick={() => handleLabelEdit(field.key, tempLabel)}
              className="text-green-600 hover:text-green-700 text-xs"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingLabel(null);
                setTempLabel('');
              }}
              className="text-gray-600 hover:text-gray-700 text-xs"
            >
              취소
            </button>
          </div>
        ) : (
          <>
            <label className="text-sm font-medium text-gray-700">
              {getDisplayLabel(field)}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingLabel(field.key);
                    setTempLabel(getDisplayLabel(field));
                  }}
                  className="text-blue-600 hover:text-blue-700 text-xs"
                >
                  편집
                </button>
                <button
                  onClick={() => {
                    setEditingPlaceholder(field.key);
                    setTempPlaceholder(field.placeholder || '');
                  }}
                  className="text-green-600 hover:text-green-700 text-xs"
                >
                  힌트편집
                </button>
                <button
                  onClick={() => handleHideField(field.key)}
                  className="text-red-600 hover:text-red-700 text-xs"
                >
                  숨기기
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <input
        type="text"
        value={formData[field.key] || ''}
        onChange={(e) => handleInputChange(field.key, e.target.value)}
        placeholder={editingPlaceholder === field.key ? tempPlaceholder : field.placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      
      {/* Placeholder 편집 UI */}
      {editingPlaceholder === field.key && (
        <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tempPlaceholder}
              onChange={(e) => setTempPlaceholder(e.target.value)}
              className="flex-1 text-sm px-2 py-1 border border-green-300 rounded"
              placeholder="새로운 힌트 텍스트 입력"
              autoFocus
            />
            <button
              onClick={() => handlePlaceholderEdit(field.key, tempPlaceholder)}
              className="text-green-600 hover:text-green-700 text-xs px-2 py-1 border border-green-300 rounded"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingPlaceholder(null);
                setTempPlaceholder('');
              }}
              className="text-gray-600 hover:text-gray-700 text-xs px-2 py-1 border border-gray-300 rounded"
            >
              취소
            </button>
          </div>
        </div>
      )}
      
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
              onClick={() => {
                setEditingPlaceholder(field.key);
                setTempPlaceholder(field.placeholder || '');
              }}
              className="text-green-600 hover:text-green-700 text-xs"
            >
              힌트편집
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
        placeholder={editingPlaceholder === field.key ? tempPlaceholder : field.placeholder}
        rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
      />
      
      {/* Placeholder 편집 UI */}
      {editingPlaceholder === field.key && (
        <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tempPlaceholder}
              onChange={(e) => setTempPlaceholder(e.target.value)}
              className="flex-1 text-sm px-2 py-1 border border-green-300 rounded"
              placeholder="새로운 힌트 텍스트 입력"
              autoFocus
            />
            <button
              onClick={() => handlePlaceholderEdit(field.key, tempPlaceholder)}
              className="text-green-600 hover:text-green-700 text-xs px-2 py-1 border border-green-300 rounded"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingPlaceholder(null);
                setTempPlaceholder('');
              }}
              className="text-gray-600 hover:text-gray-700 text-xs px-2 py-1 border border-gray-300 rounded"
            >
              취소
            </button>
          </div>
        </div>
      )}
      
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
  const renderImageField = (field) => {
    const { label, description } = getImageUploadConfig();

    return (
      <div key={field.key} className="space-y-2">
        <div className="flex items-center justify-between">
          {editingImageLabel ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={tempImageLabel}
                onChange={(e) => setTempImageLabel(e.target.value)}
                className="text-sm font-medium text-gray-700 border border-gray-300 rounded px-2 py-1 flex-1"
                autoFocus
              />
              <button
                onClick={() => handleImageLabelEdit(tempImageLabel)}
                className="text-green-600 hover:text-green-700 text-xs"
              >
                저장
              </button>
              <button
                onClick={() => {
                  setEditingImageLabel(false);
                  setTempImageLabel('');
                }}
                className="text-gray-600 hover:text-gray-700 text-xs"
              >
                취소
              </button>
            </div>
          ) : (
            <>
              <label className="text-sm font-medium text-gray-700">
                {label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {isAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingImageLabel(true);
                      setTempImageLabel(label);
                    }}
                    className="text-blue-600 hover:text-blue-700 text-xs"
                  >
                    라벨 편집
                  </button>
                  <button
                    onClick={() => {
                      setEditingImageDesc(true);
                      setTempImageDesc(description);
                    }}
                    className="text-blue-600 hover:text-blue-700 text-xs"
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
            </>
          )}
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <div className="space-y-2">
            {editingImageDesc ? (
              <div className="flex items-center gap-2 mb-4">
                <textarea
                  value={tempImageDesc}
                  onChange={(e) => setTempImageDesc(e.target.value)}
                  className="text-sm text-gray-600 border border-gray-300 rounded px-2 py-1 flex-1 resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleImageDescEdit(tempImageDesc)}
                    className="text-green-600 hover:text-green-700 text-xs px-2 py-1 border border-green-300 rounded"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => {
                      setEditingImageDesc(false);
                      setTempImageDesc('');
                    }}
                    className="text-gray-600 hover:text-gray-700 text-xs px-2 py-1 border border-gray-300 rounded"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 mb-4">{description}</p>
            )}

            {formData[field.key] ? (
              <>
                <div className="flex items-center justify-center w-24 h-24 mx-auto bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={formData[field.key]}
                    alt="업로드된 이미지"
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  onClick={() => handleInputChange(field.key, '')}
                  className="text-red-600 hover:text-red-700 text-sm underline"
                >
                  이미지 제거
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center w-24 h-24 mx-auto bg-gray-100 rounded-lg">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id={field.key}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          handleInputChange(field.key, event.target.result);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <label
                    htmlFor={field.key}
                    className="cursor-pointer bg-blue-50 text-blue-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-100 transition-colors inline-block"
                  >
                    이미지 선택
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">PNG, JPG, GIF (최대 10MB)</p>
              </>
            )}
          </div>
        </div>
        {errors[field.key] && (
          <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
        )}
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

        <div className="grid grid-cols-1 gap-6">
          {/* 이미지 업로드를 제외한 모든 필드 먼저 렌더링 */}
          {visibleFields.filter(field => field.type !== 'image').map(field => {
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
          
          {/* 이미지 업로드 필드를 맨 마지막에 렌더링 */}
          {visibleFields.filter(field => field.type === 'image').map(field => {
            return renderImageField(field);
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
                  <p>• "힌트편집" 버튼으로 placeholder 텍스트를 수정할 수 있습니다.</p>
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

Step1.propTypes = {
  formData: PropTypes.object.isRequired,
  setFormData: PropTypes.func.isRequired,
  user: PropTypes.object,
  onNext: PropTypes.func.isRequired
};

export default Step1;

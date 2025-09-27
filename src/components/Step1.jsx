// src/components/Step1.jsx - CSS 모듈 스타일 적용 (기능 변경 없음)
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import styles from './Step1.module.css';
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
    <div key={field.key} className={styles.formGroup}>
      <div className={styles.labelRow}>
        {editingLabel === field.key ? (
          <div className={styles.editLabelContainer}>
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className={styles.editLabelInput}
              autoFocus
            />
            <button
              onClick={() => handleLabelEdit(field.key, tempLabel)}
              className={styles.editSaveBtn}
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingLabel(null);
                setTempLabel('');
              }}
              className={styles.editCancelBtn}
            >
              취소
            </button>
          </div>
        ) : (
          <>
            <label className={`${styles.formLabel} ${field.required ? styles.required : ''}`}>
              {getDisplayLabel(field)}
            </label>

            {isAdmin && (
              <div className={styles.adminActions}>
                <button
                  onClick={() => {
                    setEditingLabel(field.key);
                    setTempLabel(getDisplayLabel(field));
                  }}
                  className={styles.adminEditBtn}
                >
                  편집
                </button>
                <button
                  onClick={() => {
                    setEditingPlaceholder(field.key);
                    setTempPlaceholder(field.placeholder || '');
                  }}
                  className={styles.adminHintBtn}
                >
                  힌트편집
                </button>
                <button
                  onClick={() => handleHideField(field.key)}
                  className={styles.adminHideBtn}
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
        className={styles.formInput}
      />
      
      {/* Placeholder 편집 UI */}
      {editingPlaceholder === field.key && (
        <div className={styles.placeholderEditBox}>
          <div className={styles.placeholderEditRow}>
            <input
              type="text"
              value={tempPlaceholder}
              onChange={(e) => setTempPlaceholder(e.target.value)}
              className={styles.placeholderEditInput}
              placeholder="새로운 힌트 텍스트 입력"
              autoFocus
            />
            <button
              onClick={() => handlePlaceholderEdit(field.key, tempPlaceholder)}
              className={styles.placeholderSaveBtn}
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingPlaceholder(null);
                setTempPlaceholder('');
              }}
              className={styles.placeholderCancelBtn}
            >
              취소
            </button>
          </div>
        </div>
      )}
      
      {errors[field.key] && (
        <p className={styles.formError}>{errors[field.key]}</p>
      )}
    </div>
  );

  const renderTextAreaField = (field) => (
    <div key={field.key} className={styles.formGroup}>
      <div className={styles.labelRow}>
        <label className={`${styles.formLabel} ${field.required ? styles.required : ''}`}>
          {field.label}
        </label>

        {isAdmin && (
          <div className={styles.adminActions}>
            <button
              onClick={() => {
                setEditingLabel(field.key);
                setTempLabel(field.label);
              }}
              className={styles.adminEditBtn}
            >
              편집
            </button>
            <button
              onClick={() => {
                setEditingPlaceholder(field.key);
                setTempPlaceholder(field.placeholder || '');
              }}
              className={styles.adminHintBtn}
            >
              힌트편집
            </button>
            <button
              onClick={() => handleHideField(field.key)}
              className={styles.adminHideBtn}
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
        className={styles.formTextarea}
      />
      
      {/* Placeholder 편집 UI */}
      {editingPlaceholder === field.key && (
        <div className={styles.placeholderEditBox}>
          <div className={styles.placeholderEditRow}>
            <input
              type="text"
              value={tempPlaceholder}
              onChange={(e) => setTempPlaceholder(e.target.value)}
              className={styles.placeholderEditInput}
              placeholder="새로운 힌트 텍스트 입력"
              autoFocus
            />
            <button
              onClick={() => handlePlaceholderEdit(field.key, tempPlaceholder)}
              className={styles.placeholderSaveBtn}
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingPlaceholder(null);
                setTempPlaceholder('');
              }}
              className={styles.placeholderCancelBtn}
            >
              취소
            </button>
          </div>
        </div>
      )}
      
      {errors[field.key] && (
        <p className={styles.formError}>{errors[field.key]}</p>
      )}
    </div>
  );

  const renderSelectField = (field) => (
    <div key={field.key} className={styles.formGroup}>
      <div className={styles.labelRow}>
        <label className={`${styles.formLabel} ${field.required ? styles.required : ''}`}>
          {field.label}
        </label>

        {isAdmin && field.key !== 'industryCategory' && field.key !== 'productServiceCategory' && (
          <div className={styles.adminActions}>
            <button
              onClick={() => {
                setEditingLabel(field.key);
                setTempLabel(field.label);
              }}
              className={styles.adminEditBtn}
            >
              편집
            </button>
            <button
              onClick={() => handleHideField(field.key)}
              className={styles.adminHideBtn}
            >
              숨기기
            </button>
          </div>
        )}
      </div>
      <select
        value={formData[field.key] || ''}
        onChange={(e) => handleInputChange(field.key, e.target.value)}
        className={styles.formSelect}
      >
        <option value="">{field.placeholder}</option>
        {field.options?.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {errors[field.key] && (
        <p className={styles.formError}>{errors[field.key]}</p>
      )}
    </div>
  );

  // 🔥 통합된 이미지 업로드 필드 렌더링 (실시간 Admin 설정 반영)
  const renderImageField = (field) => {
    const { label, description } = getImageUploadConfig();

    return (
      <div key={field.key} className={styles.formGroup}>
        <div className={styles.labelRow}>
          {editingImageLabel ? (
            <div className={styles.editLabelContainer}>
              <input
                type="text"
                value={tempImageLabel}
                onChange={(e) => setTempImageLabel(e.target.value)}
                className={styles.editLabelInput}
                autoFocus
              />
              <button
                onClick={() => handleImageLabelEdit(tempImageLabel)}
                className={styles.editSaveBtn}
              >
                저장
              </button>
              <button
                onClick={() => {
                  setEditingImageLabel(false);
                  setTempImageLabel('');
                }}
                className={styles.editCancelBtn}
              >
                취소
              </button>
            </div>
          ) : (
            <>
              <label className={`${styles.formLabel} ${field.required ? styles.required : ''}`}>
                {label}
              </label>

              {isAdmin && (
                <div className={styles.adminActions}>
                  <button
                    onClick={() => {
                      setEditingImageLabel(true);
                      setTempImageLabel(label);
                    }}
                    className={styles.adminEditBtn}
                  >
                    라벨 편집
                  </button>
                  <button
                    onClick={() => {
                      setEditingImageDesc(true);
                      setTempImageDesc(description);
                    }}
                    className={styles.adminEditBtn}
                  >
                    설명 편집
                  </button>
                  <button
                    onClick={() => handleHideField(field.key)}
                    className={styles.adminHideBtn}
                  >
                    숨기기
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.imageUploadArea}>
          <div className={styles.imageUploadContent}>
            {editingImageDesc ? (
              <div className={styles.imageDescEditBox}>
                <textarea
                  value={tempImageDesc}
                  onChange={(e) => setTempImageDesc(e.target.value)}
                  className={styles.imageDescEditInput}
                  rows={2}
                  autoFocus
                />
                <div className={styles.imageDescActions}>
                  <button
                    onClick={() => handleImageDescEdit(tempImageDesc)}
                    className={styles.editSaveBtn}
                  >
                    저장
                  </button>
                  <button
                    onClick={() => {
                      setEditingImageDesc(false);
                      setTempImageDesc('');
                    }}
                    className={styles.editCancelBtn}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p className={styles.imageUploadDescription}>{description}</p>
            )}

            {formData[field.key] ? (
              <>
                <div className={styles.imagePreview}>
                  <img
                    src={formData[field.key]}
                    alt="업로드된 이미지"
                    className={styles.imagePreviewImg}
                  />
                </div>
                <button
                  onClick={() => handleInputChange(field.key, '')}
                  className={styles.removeImageBtn}
                >
                  이미지 제거
                </button>
              </>
            ) : (
              <>
                <div className={styles.imageUploadIcon}>
                  <svg className={styles.uploadSvg} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    className={styles.hiddenFileInput}
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
                    className={styles.uploadButton}
                  >
                    이미지 선택
                  </label>
                </div>
                <p className={styles.uploadHint}>PNG, JPG, GIF (최대 10MB)</p>
              </>
            )}
          </div>
        </div>
        {errors[field.key] && (
          <p className={styles.formError}>{errors[field.key]}</p>
        )}
      </div>
    );
  };

  // 표시되는 필드들만 필터링
  const visibleFields = Object.values(fieldConfig).filter(field => field.visible);
  // 숨겨진 필드들
  const hiddenFields = Object.values(fieldConfig).filter(field => !field.visible);

  return (
    <div className={styles.step1Container}>
      <div className={styles.formCard}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Step 1: 기본 정보 입력</h2>

          {/* 관리자 전용 숨겨진 필드 관리 */}
          {isAdmin && hiddenFields.length > 0 && (
            <div className={styles.hiddenFieldsInfo}>
              <span className={styles.hiddenFieldsLabel}>숨겨진 항목: </span>
              {hiddenFields.map((field, index) => (
                <span key={field.key}>
                  <button
                    onClick={() => handleRestoreField(field.key)}
                    className={styles.restoreFieldBtn}
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

        <div className={styles.formSection}>
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
        <div className={styles.stepNavigation}>
          <button
            onClick={handleSubmit}
            className={styles.navButton}
          >
            다음 단계 →
          </button>
        </div>

        {/* 🔥 관리자 전용 실시간 설정 상태 표시 */}
        {isAdmin && (
          <div className={styles.adminInfoBox}>
            <div className={styles.adminInfoHeader}>
              <svg className={styles.infoIcon} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className={styles.adminInfoContent}>
                <h3 className={styles.adminInfoTitle}>관리자 모드 (실시간 반영)</h3>
                <div className={styles.adminInfoText}>
                  <p>• 각 필드의 "편집" 버튼으로 라벨을 수정하거나 "숨기기"로 필드를 제거할 수 있습니다.</p>
                  <p>• "힌트편집" 버튼으로 placeholder 텍스트를 수정할 수 있습니다.</p>
                  <p>• 이미지 업로드 필드는 "라벨 편집", "설명 편집"이 가능하며, 변경사항이 다른 사용자에게도 실시간 반영됩니다.</p>
                  {Object.keys(adminSettings).length > 0 && (
                    <p className={styles.adminSettingsStatus}>현재 적용된 Admin 설정: {JSON.stringify(Object.keys(adminSettings))}</p>
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

  

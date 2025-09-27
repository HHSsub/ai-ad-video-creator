import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
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

  const getImageUploadConfig = () => {
    const purpose = formData.videoPurpose;
    const imageFieldSettings = adminSettings.imageUpload || {};
    
    if (imageFieldSettings.label || imageFieldSettings.description) {
      return {
        label: imageFieldSettings.label || fieldConfig.imageUpload?.label || '이미지 업로드',
        description: imageFieldSettings.description || fieldConfig.imageUpload?.descriptions?.default || '이미지를 업로드해주세요'
      };
    }

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
    <div key={field.key} className="group">
      <div className="flex items-center justify-between mb-3">
        {editingLabel === field.key ? (
          <div className="flex items-center gap-3 flex-1">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="text-sm font-medium text-gray-200 bg-gray-800/80 border border-gray-600 rounded-lg px-3 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
              autoFocus
            />
            <button
              onClick={() => handleLabelEdit(field.key, tempLabel)}
              className="text-blue-400 hover:text-blue-300 text-sm px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-all duration-200"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingLabel(null);
                setTempLabel('');
              }}
              className="text-gray-400 hover:text-gray-300 text-sm px-3 py-1.5 bg-gray-500/10 hover:bg-gray-500/20 border border-gray-500/30 rounded-lg transition-all duration-200"
            >
              취소
            </button>
          </div>
        ) : (
          <>
            <label className="text-base font-semibold text-gray-200 tracking-wide">
              {getDisplayLabel(field)}
              {field.required && <span className="text-red-400 ml-2">*</span>}
            </label>

            {isAdmin && (
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <button
                  onClick={() => {
                    setEditingLabel(field.key);
                    setTempLabel(getDisplayLabel(field));
                  }}
                  className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-md transition-all duration-200"
                >
                  편집
                </button>
                <button
                  onClick={() => {
                    setEditingPlaceholder(field.key);
                    setTempPlaceholder(field.placeholder || '');
                  }}
                  className="text-emerald-400 hover:text-emerald-300 text-sm px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-md transition-all duration-200"
                >
                  힌트편집
                </button>
                <button
                  onClick={() => handleHideField(field.key)}
                  className="text-red-400 hover:text-red-300 text-sm px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-md transition-all duration-200"
                >
                  숨기기
                </button>
              </div>
            )}
          </>
        )}
      </div>
      
      <div className="relative">
        <input
          type="text"
          value={formData[field.key] || ''}
          onChange={(e) => handleInputChange(field.key, e.target.value)}
          placeholder={editingPlaceholder === field.key ? tempPlaceholder : field.placeholder}
          className="w-full px-4 py-4 bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-300 hover:border-gray-500/70 hover:bg-gray-700/50"
        />
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
      </div>
      
      {editingPlaceholder === field.key && (
        <div className="mt-4 p-4 bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-xl">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={tempPlaceholder}
              onChange={(e) => setTempPlaceholder(e.target.value)}
              className="flex-1 text-sm px-3 py-2 bg-gray-900/80 border border-gray-600/50 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
              placeholder="새로운 힌트 텍스트 입력"
              autoFocus
            />
            <button
              onClick={() => handlePlaceholderEdit(field.key, tempPlaceholder)}
              className="text-emerald-400 hover:text-emerald-300 text-sm px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all duration-200"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingPlaceholder(null);
                setTempPlaceholder('');
              }}
              className="text-gray-400 hover:text-gray-300 text-sm px-4 py-2 bg-gray-500/10 hover:bg-gray-500/20 border border-gray-500/30 rounded-lg transition-all duration-200"
            >
              취소
            </button>
          </div>
        </div>
      )}
      
      {errors[field.key] && (
        <p className="mt-2 text-sm text-red-400 flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {errors[field.key]}
        </p>
      )}
    </div>
  );

  const renderTextAreaField = (field) => (
    <div key={field.key} className="group">
      <div className="flex items-center justify-between mb-3">
        <label className="text-base font-semibold text-gray-200 tracking-wide">
          {field.label}
          {field.required && <span className="text-red-400 ml-2">*</span>}
        </label>

        {isAdmin && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={() => {
                setEditingLabel(field.key);
                setTempLabel(field.label);
              }}
              className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-md transition-all duration-200"
            >
              편집
            </button>
            <button
              onClick={() => {
                setEditingPlaceholder(field.key);
                setTempPlaceholder(field.placeholder || '');
              }}
              className="text-emerald-400 hover:text-emerald-300 text-sm px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-md transition-all duration-200"
            >
              힌트편집
            </button>
            <button
              onClick={() => handleHideField(field.key)}
              className="text-red-400 hover:text-red-300 text-sm px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-md transition-all duration-200"
            >
              숨기기
            </button>
          </div>
        )}
      </div>
      
      <div className="relative">
        <textarea
          value={formData[field.key] || ''}
          onChange={(e) => handleInputChange(field.key, e.target.value)}
          placeholder={editingPlaceholder === field.key ? tempPlaceholder : field.placeholder}
          rows={4}
          className="w-full px-4 py-4 bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-300 hover:border-gray-500/70 hover:bg-gray-700/50 resize-none"
        />
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
      </div>
      
      {editingPlaceholder === field.key && (
        <div className="mt-4 p-4 bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-xl">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={tempPlaceholder}
              onChange={(e) => setTempPlaceholder(e.target.value)}
              className="flex-1 text-sm px-3 py-2 bg-gray-900/80 border border-gray-600/50 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
              placeholder="새로운 힌트 텍스트 입력"
              autoFocus
            />
            <button
              onClick={() => handlePlaceholderEdit(field.key, tempPlaceholder)}
              className="text-emerald-400 hover:text-emerald-300 text-sm px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all duration-200"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingPlaceholder(null);
                setTempPlaceholder('');
              }}
              className="text-gray-400 hover:text-gray-300 text-sm px-4 py-2 bg-gray-500/10 hover:bg-gray-500/20 border border-gray-500/30 rounded-lg transition-all duration-200"
            >
              취소
            </button>
          </div>
        </div>
      )}
      
      {errors[field.key] && (
        <p className="mt-2 text-sm text-red-400 flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {errors[field.key]}
        </p>
      )}
    </div>
  );

  const renderSelectField = (field) => (
    <div key={field.key} className="group">
      <div className="flex items-center justify-between mb-3">
        <label className="text-base font-semibold text-gray-200 tracking-wide">
          {field.label}
          {field.required && <span className="text-red-400 ml-2">*</span>}
        </label>

        {isAdmin && field.key !== 'industryCategory' && field.key !== 'productServiceCategory' && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={() => {
                setEditingLabel(field.key);
                setTempLabel(field.label);
              }}
              className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-md transition-all duration-200"
            >
              편집
            </button>
            <button
              onClick={() => handleHideField(field.key)}
              className="text-red-400 hover:text-red-300 text-sm px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-md transition-all duration-200"
            >
              숨기기
            </button>
          </div>
        )}
      </div>
      
      <div className="relative">
        <select
          value={formData[field.key] || ''}
          onChange={(e) => handleInputChange(field.key, e.target.value)}
          className="w-full px-4 py-4 bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-300 hover:border-gray-500/70 hover:bg-gray-700/50 appearance-none cursor-pointer"
        >
          <option value="" className="bg-gray-800 text-gray-400">{field.placeholder}</option>
          {field.options?.map(option => (
            <option key={option.value} value={option.value} className="bg-gray-800 text-gray-100">
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
      </div>
      
      {errors[field.key] && (
        <p className="mt-2 text-sm text-red-400 flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {errors[field.key]}
        </p>
      )}
    </div>
  );

  const renderImageField = (field) => {
    const { label, description } = getImageUploadConfig();

    return (
      <div key={field.key} className="group">
        <div className="flex items-center justify-between mb-3">
          {editingImageLabel ? (
            <div className="flex items-center gap-3 flex-1">
              <input
                type="text"
                value={tempImageLabel}
                onChange={(e) => setTempImageLabel(e.target.value)}
                className="text-sm font-medium text-gray-200 bg-gray-800/80 border border-gray-600 rounded-lg px-3 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                autoFocus
              />
              <button
                onClick={() => handleImageLabelEdit(tempImageLabel)}
                className="text-emerald-400 hover:text-emerald-300 text-sm px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all duration-200"
              >
                저장
              </button>
              <button
                onClick={() => {
                  setEditingImageLabel(false);
                  setTempImageLabel('');
                }}
                className="text-gray-400 hover:text-gray-300 text-sm px-3 py-1.5 bg-gray-500/10 hover:bg-gray-500/20 border border-gray-500/30 rounded-lg transition-all duration-200"
              >
                취소
              </button>
            </div>
          ) : (
            <>
              <label className="text-base font-semibold text-gray-200 tracking-wide">
                {label}
                {field.required && <span className="text-red-400 ml-2">*</span>}
              </label>

              {isAdmin && (
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button
                    onClick={() => {
                      setEditingImageLabel(true);
                      setTempImageLabel(label);
                    }}
                    className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-md transition-all duration-200"
                  >
                    라벨 편집
                  </button>
                  <button
                    onClick={() => {
                      setEditingImageDesc(true);
                      setTempImageDesc(description);
                    }}
                    className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-md transition-all duration-200"
                  >
                    설명 편집
                  </button>
                  <button
                    onClick={() => handleHideField(field.key)}
                    className="text-red-400 hover:text-red-300 text-sm px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-md transition-all duration-200"
                  >
                    숨기기
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="relative group/upload">
          <div className="border-2 border-dashed border-gray-600/70 rounded-2xl p-8 text-center bg-gray-800/30 backdrop-blur-sm hover:border-gray-500/70 hover:bg-gray-700/30 transition-all duration-300">
            <div className="space-y-4">
              {editingImageDesc ? (
                <div className="flex items-start gap-3 mb-6">
                  <textarea
                    value={tempImageDesc}
                    onChange={(e) => setTempImageDesc(e.target.value)}
                    className="text-sm text-gray-300 bg-gray-900/80 border border-gray-600/50 rounded-lg px-3 py-2 flex-1 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                    rows={2}
                    autoFocus
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleImageDescEdit(tempImageDesc)}
                      className="text-emerald-400 hover:text-emerald-300 text-sm px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all duration-200"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => {
                        setEditingImageDesc(false);
                        setTempImageDesc('');
                      }}
                      className="text-gray-400 hover:text-gray-300 text-sm px-3 py-1.5 bg-gray-500/10 hover:bg-gray-500/20 border border-gray-500/30 rounded-lg transition-all duration-200"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-6 leading-relaxed">{description}</p>
              )}

              {formData[field.key] ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center w-32 h-32 mx-auto bg-gray-700/50 rounded-2xl overflow-hidden border border-gray-600/50">
                    <img
                      src={formData[field.key]}
                      alt="업로드된 이미지"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    onClick={() => handleInputChange(field.key, '')}
                    className="text-red-400 hover:text-red-300 text-sm underline underline-offset-2 transition-colors duration-200"
                  >
                    이미지 제거
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center w-32 h-32 mx-auto bg-gray-700/50 rounded-2xl border border-gray-600/50 group-hover/upload:border-gray-500/70 transition-colors duration-300">
                    <svg className="w-12 h-12 text-gray-500 group-hover/upload:text-gray-400 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
                      className="cursor-pointer inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/25"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      이미지 선택
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">PNG, JPG, GIF (최대 10MB)</p>
                </div>
              )}
            </div>
          </div>
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 group-hover/upload:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
        </div>
        
        {errors[field.key] && (
          <p className="mt-3 text-sm text-red-400 flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {errors[field.key]}
          </p>
        )}
      </div>
    );
  };

  const visibleFields = Object.values(fieldConfig).filter(field => field.visible);
  const hiddenFields = Object.values(fieldConfig).filter(field => !field.visible);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black">
      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-gray-800/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-700/50 p-10 relative overflow-hidden">
          {/* Background decorative elements */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-blue-500/10 to-purple-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-emerald-500/10 to-blue-500/10 rounded-full blur-3xl"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-4xl font-bold text-white mb-3 tracking-tight">기본 정보 입력</h2>
                <p className="text-gray-400 text-lg leading-relaxed">광고 영상 제작을 위한 브랜드 정보를 입력해주세요</p>
              </div>

              {isAdmin && hiddenFields.length > 0 && (
                <div className="text-sm bg-gray-800/60 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
                  <span className="text-gray-400 block mb-2">숨겨진 항목:</span>
                  <div className="flex flex-wrap gap-2">
                    {hiddenFields.map((field, index) => (
                      <button
                        key={field.key}
                        onClick={() => handleRestoreField(field.key)}
                        className="text-blue-400 hover:text-blue-300 underline underline-offset-2 text-sm px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 rounded-md transition-all duration-200"
                        title={`${field.label} 되돌리기`}
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-8">
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
              
              {visibleFields.filter(field => field.type === 'image').map(field => {
                return renderImageField(field);
              })}
            </div>

            <div className="flex justify-end mt-12">
              <button
                onClick={handleSubmit}
                className="group relative bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 hover:from-blue-500 hover:via-blue-400 hover:to-purple-500 text-white px-10 py-4 rounded-xl text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-gray-800 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/25"
              >
                <span className="relative z-10 flex items-center gap-3">
                  다음 단계
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 rounded-xl opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
              </button>
            </div>

            {isAdmin && (
              <div className="mt-8 p-6 bg-blue-900/20 backdrop-blur-sm border border-blue-800/30 rounded-2xl">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-base font-semibold text-blue-300 mb-2">관리자 모드 (실시간 반영)</h3>
                    <div className="text-sm text-blue-400 space-y-1 leading-relaxed">
                      <p>• 각 필드의 "편집" 버튼으로 라벨을 수정하거나 "숨기기"로 필드를 제거할 수 있습니다.</p>
                      <p>• "힌트편집" 버튼으로 placeholder 텍스트를 수정할 수 있습니다.</p>
                      <p>• 이미지 업로드 필드는 "라벨 편집", "설명 편집"이 가능하며, 변경사항이 다른 사용자에게도 실시간 반영됩니다.</p>
                      {Object.keys(adminSettings).length > 0 && (
                        <p className="mt-3 text-xs text-blue-500">현재 적용된 Admin 설정: {JSON.stringify(Object.keys(adminSettings))}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
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

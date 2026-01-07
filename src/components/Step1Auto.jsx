import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { loadFieldConfig, saveFieldConfig, loadAdminSettings, saveAdminSettings } from '../utils/fieldConfig';
import RealtimeConfigSync from './RealtimeConfigSync';

const Step1 = ({ formData, setFormData, user, onPrev, onNext }) => {
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

  // 🔥 [M] Person Selection 기능
  const [persons, setPersons] = useState([]);
  const [personConfigVisible, setPersonConfigVisible] = useState(false);

  useEffect(() => {
    const loadPersonConfig = async () => {
      try {
        const configRes = await fetch('/nexxii/api/admin-field-config/field-config');
        const configData = await configRes.json();
        const config = configData.config || {};
        if (configData.success && config.personSelection?.visible) {
          setPersonConfigVisible(true);
          const personsRes = await fetch('/nexxii/api/persons');
          const personsData = await personsRes.json();
          if (personsData.success) {
            setPersons(personsData.persons || []);
          }
        }
      } catch (error) {
        console.error('Person config load error:', error);
      }
    };
    loadPersonConfig();
  }, []);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    window.scrollTo(0, 0);
    const loadConfig = async () => {
      const config = await loadFieldConfig();
      const settings = loadAdminSettings();
      setFieldConfig(config);
      setAdminSettings(settings);
    };
    loadConfig();
  }, []);

  const handleConfigUpdate = (newFieldConfig) => {
    setFieldConfig(newFieldConfig);
    localStorage.setItem('fieldConfig', JSON.stringify(newFieldConfig));
  };

  const handleAdminUpdate = (newAdminSettings) => {
    setAdminSettings(newAdminSettings);
    localStorage.setItem('adminSettings', JSON.stringify(newAdminSettings));
  };

  const saveAdminSettingsToServer = async (newSettings) => {
    try {
      const user = localStorage.getItem('user');
      const username = user ? JSON.parse(user).username : 'guest';

      const response = await fetch('/nexxii/api/admin-field-config/field-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify(newSettings)
      });

      const data = await response.json();
      if (!data.success) {
        console.error('서버 저장 실패:', data.error);
        saveAdminSettings(newSettings);
      }
    } catch (error) {
      console.error('서버 저장 오류:', error);
      saveAdminSettings(newSettings);
    }
  };

  const saveFieldConfigToServer = async (newConfig) => {
    try {
      const user = localStorage.getItem('user');
      const username = user ? JSON.parse(user).username : 'guest';

      const response = await fetch('/nexxii/api/admin-field-config/field-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify(newConfig)
      });

      const data = await response.json();
      if (!data.success) {
        console.error('서버 저장 실패:', data.error);
        saveFieldConfig(newConfig);
      }
    } catch (error) {
      console.error('서버 저장 오류:', error);
      saveFieldConfig(newConfig);
    }
  };

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

    if (isAdmin) {
      saveFieldConfigToServer(newConfig);
    } else {
      saveFieldConfig(newConfig);
    }
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

    if (isAdmin) {
      saveFieldConfigToServer(newConfig);
    } else {
      saveFieldConfig(newConfig);
    }
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

    if (isAdmin) {
      saveAdminSettingsToServer(newSettings);
    } else {
      saveAdminSettings(newSettings);
    }

    const newConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        label: newLabel
      }
    };
    setFieldConfig(newConfig);

    if (isAdmin) {
      saveFieldConfigToServer(newConfig);
    } else {
      saveFieldConfig(newConfig);
    }

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

    if (isAdmin) {
      saveFieldConfigToServer(newConfig);
    } else {
      saveFieldConfig(newConfig);
    }

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

  const handleImageLabelEdit = async (newLabel) => {
    const newSettings = {
      ...adminSettings,
      imageUpload: {
        ...adminSettings.imageUpload,
        label: newLabel
      }
    };
    setAdminSettings(newSettings);

    if (isAdmin) {
      await saveAdminSettingsToServer(newSettings);
    } else {
      saveAdminSettings(newSettings);
    }

    setEditingImageLabel(false);
    setTempImageLabel('');
  };

  const handleImageDescEdit = async (newDesc) => {
    const newSettings = {
      ...adminSettings,
      imageUpload: {
        ...adminSettings.imageUpload,
        description: newDesc
      }
    };
    setAdminSettings(newSettings);

    if (isAdmin) {
      await saveAdminSettingsToServer(newSettings);
    } else {
      saveAdminSettings(newSettings);
    }

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
      onNext();
    }
  };

  const getDisplayLabel = (field) => {
    return adminSettings[field.key]?.label || field.label;
  };

  const renderTextField = (field) => (
    <div key={field.key} className="group mb-8">
      <div className="flex items-center justify-between mb-4">
        {editingLabel === field.key ? (
          <div className="flex items-center gap-3 flex-1">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="text-lg font-semibold text-white bg-gray-900/90 border border-gray-600/50 rounded-xl px-4 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 backdrop-blur-sm"
              autoFocus
            />
            <button
              onClick={() => handleLabelEdit(field.key, tempLabel)}
              className="text-blue-300 hover:text-blue-200 text-sm px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingLabel(null);
                setTempLabel('');
              }}
              className="text-gray-300 hover:text-gray-200 text-sm px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
            >
              취소
            </button>
          </div>
        ) : (
          <>
            <label className="text-lg font-semibold text-white tracking-wide mb-1 block">
              {getDisplayLabel(field)}
              {field.required && <span className="text-red-400 ml-2 text-xl">*</span>}
            </label>

            {isAdmin && (
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                <button
                  onClick={() => {
                    setEditingLabel(field.key);
                    setTempLabel(getDisplayLabel(field));
                  }}
                  className="text-blue-300 hover:text-blue-200 text-xs px-3 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
                >
                  편집
                </button>
                <button
                  onClick={() => {
                    setEditingPlaceholder(field.key);
                    setTempPlaceholder(field.placeholder || '');
                  }}
                  className="text-emerald-300 hover:text-emerald-200 text-xs px-3 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
                >
                  힌트편집
                </button>
                <button
                  onClick={() => handleHideField(field.key)}
                  className="text-red-300 hover:text-red-200 text-xs px-3 py-1.5 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
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
          className="w-full px-6 py-5 bg-gray-900/40 backdrop-blur-xl border border-gray-700/40 rounded-2xl text-white text-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/60 focus:border-blue-400/60 transition-all duration-500 hover:border-gray-600/60 hover:bg-gray-800/40 shadow-xl shadow-black/20"
        />
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600/8 via-purple-600/8 to-cyan-600/8 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
      </div>

      {editingPlaceholder === field.key && (
        <div className="mt-6 p-6 bg-gray-900/60 backdrop-blur-xl border border-gray-700/40 rounded-2xl shadow-xl shadow-black/20">
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={tempPlaceholder}
              onChange={(e) => setTempPlaceholder(e.target.value)}
              className="flex-1 text-base px-4 py-3 bg-gray-800/60 border border-gray-600/40 rounded-xl text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50 backdrop-blur-sm"
              placeholder="새로운 힌트 텍스트 입력"
              autoFocus
            />
            <button
              onClick={() => handlePlaceholderEdit(field.key, tempPlaceholder)}
              className="text-emerald-200 hover:text-emerald-100 text-sm px-5 py-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingPlaceholder(null);
                setTempPlaceholder('');
              }}
              className="text-gray-300 hover:text-gray-200 text-sm px-5 py-3 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {errors[field.key] && (
        <p className="mt-3 text-sm text-red-300 flex items-center gap-2 bg-red-900/20 px-4 py-2 rounded-xl border border-red-500/30">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {errors[field.key]}
        </p>
      )}
    </div>
  );

  const renderTextAreaField = (field) => (
    <div key={field.key} className="group mb-8">
      <div className="flex items-center justify-between mb-4">
        {editingLabel === field.key ? (
          <div className="flex items-center gap-3 flex-1">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="text-lg font-semibold text-white bg-gray-900/90 border border-gray-600/50 rounded-xl px-4 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 backdrop-blur-sm"
              autoFocus
            />
            <button
              onClick={() => handleLabelEdit(field.key, tempLabel)}
              className="text-blue-300 hover:text-blue-200 text-sm px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingLabel(null);
                setTempLabel('');
              }}
              className="text-gray-300 hover:text-gray-200 text-sm px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
            >
              취소
            </button>
          </div>
        ) : (
          <>
            <label className="text-lg font-semibold text-white tracking-wide mb-1 block">
              {getDisplayLabel(field)}
              {field.required && <span className="text-red-400 ml-2 text-xl">*</span>}
            </label>

            {isAdmin && (
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                <button
                  onClick={() => {
                    setEditingLabel(field.key);
                    setTempLabel(getDisplayLabel(field));
                  }}
                  className="text-blue-300 hover:text-blue-200 text-xs px-3 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
                >
                  편집
                </button>
                <button
                  onClick={() => {
                    setEditingPlaceholder(field.key);
                    setTempPlaceholder(field.placeholder || '');
                  }}
                  className="text-emerald-300 hover:text-emerald-200 text-xs px-3 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
                >
                  힌트편집
                </button>
                <button
                  onClick={() => handleHideField(field.key)}
                  className="text-red-300 hover:text-red-200 text-xs px-3 py-1.5 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
                >
                  숨기기
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="relative">
        <textarea
          value={formData[field.key] || ''}
          onChange={(e) => handleInputChange(field.key, e.target.value)}
          placeholder={editingPlaceholder === field.key ? tempPlaceholder : field.placeholder}
          rows={4}
          className="w-full px-6 py-5 bg-gray-900/40 backdrop-blur-xl border border-gray-700/40 rounded-2xl text-white text-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/60 focus:border-blue-400/60 transition-all duration-500 hover:border-gray-600/60 hover:bg-gray-800/40 shadow-xl shadow-black/20 resize-none"
        />
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600/8 via-purple-600/8 to-cyan-600/8 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
      </div>

      {editingPlaceholder === field.key && (
        <div className="mt-6 p-6 bg-gray-900/60 backdrop-blur-xl border border-gray-700/40 rounded-2xl shadow-xl shadow-black/20">
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={tempPlaceholder}
              onChange={(e) => setTempPlaceholder(e.target.value)}
              className="flex-1 text-base px-4 py-3 bg-gray-800/60 border border-gray-600/40 rounded-xl text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50 backdrop-blur-sm"
              placeholder="새로운 힌트 텍스트 입력"
              autoFocus
            />
            <button
              onClick={() => handlePlaceholderEdit(field.key, tempPlaceholder)}
              className="text-emerald-200 hover:text-emerald-100 text-sm px-5 py-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingPlaceholder(null);
                setTempPlaceholder('');
              }}
              className="text-gray-300 hover:text-gray-200 text-sm px-5 py-3 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {errors[field.key] && (
        <p className="mt-3 text-sm text-red-300 flex items-center gap-2 bg-red-900/20 px-4 py-2 rounded-xl border border-red-500/30">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {errors[field.key]}
        </p>
      )}
    </div>
  );

  const renderSelectField = (field) => (
    <div key={field.key} className="group mb-8">
      <div className="flex items-center justify-between mb-4">
        {editingLabel === field.key ? (
          <div className="flex items-center gap-3 flex-1">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="text-lg font-semibold text-white bg-gray-900/90 border border-gray-600/50 rounded-xl px-4 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 backdrop-blur-sm"
              autoFocus
            />
            <button
              onClick={() => handleLabelEdit(field.key, tempLabel)}
              className="text-blue-300 hover:text-blue-200 text-sm px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditingLabel(null);
                setTempLabel('');
              }}
              className="text-gray-300 hover:text-gray-200 text-sm px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
            >
              취소
            </button>
          </div>
        ) : (
          <>
            <label className="text-lg font-semibold text-white tracking-wide mb-1 block">
              {getDisplayLabel(field)}
              {field.required && <span className="text-red-400 ml-2 text-xl">*</span>}
            </label>

            {isAdmin && (
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                <button
                  onClick={() => {
                    setEditingLabel(field.key);
                    setTempLabel(getDisplayLabel(field));
                  }}
                  className="text-blue-300 hover:text-blue-200 text-xs px-3 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
                >
                  편집
                </button>
                <button
                  onClick={() => handleHideField(field.key)}
                  className="text-red-300 hover:text-red-200 text-xs px-3 py-1.5 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
                >
                  숨기기
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="relative">
        <select
          value={formData[field.key] || ''}
          onChange={(e) => handleInputChange(field.key, e.target.value)}
          className="w-full px-6 py-5 bg-gray-900/40 backdrop-blur-xl border border-gray-700/40 rounded-2xl text-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-400/60 focus:border-blue-400/60 transition-all duration-500 hover:border-gray-600/60 hover:bg-gray-800/40 shadow-xl shadow-black/20 appearance-none cursor-pointer"
        >
          <option value="" className="bg-gray-900 text-gray-400">{field.placeholder}</option>
          {field.options?.map(option => (
            <option key={option.value} value={option.value} className="bg-gray-900 text-white">
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-6 pointer-events-none">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600/8 via-purple-600/8 to-cyan-600/8 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
      </div>

      {errors[field.key] && (
        <p className="mt-3 text-sm text-red-300 flex items-center gap-2 bg-red-900/20 px-4 py-2 rounded-xl border border-red-500/30">
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
      <div key={field.key} className="group mb-8">
        <div className="flex items-center justify-between mb-4">
          {editingImageLabel ? (
            <div className="flex items-center gap-3 flex-1">
              <input
                type="text"
                value={tempImageLabel}
                onChange={(e) => setTempImageLabel(e.target.value)}
                className="text-lg font-semibold text-white bg-gray-900/90 border border-gray-600/50 rounded-xl px-4 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 backdrop-blur-sm"
                autoFocus
              />
              <button
                onClick={() => handleImageLabelEdit(tempImageLabel)}
                className="text-emerald-200 hover:text-emerald-100 text-sm px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
              >
                저장
              </button>
              <button
                onClick={() => {
                  setEditingImageLabel(false);
                  setTempImageLabel('');
                }}
                className="text-gray-300 hover:text-gray-200 text-sm px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
              >
                취소
              </button>
            </div>
          ) : (
            <>
              <label className="text-lg font-semibold text-white tracking-wide mb-1 block">
                {label}
                {field.required && <span className="text-red-400 ml-2 text-xl">*</span>}
              </label>

              {isAdmin && (
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <button
                    onClick={() => {
                      setEditingImageLabel(true);
                      setTempImageLabel(label);
                    }}
                    className="text-blue-300 hover:text-blue-200 text-xs px-3 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
                  >
                    라벨 편집
                  </button>
                  <button
                    onClick={() => {
                      setEditingImageDesc(true);
                      setTempImageDesc(description);
                    }}
                    className="text-blue-300 hover:text-blue-200 text-xs px-3 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
                  >
                    설명 편집
                  </button>
                  <button
                    onClick={() => handleHideField(field.key)}
                    className="text-red-300 hover:text-red-200 text-xs px-3 py-1.5 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 rounded-lg transition-all duration-200 backdrop-blur-sm"
                  >
                    숨기기
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="relative group/upload">
          {editingImageDesc ? (
            <div className="flex items-start gap-4 mb-6 p-6 bg-gray-900/60 backdrop-blur-xl border border-gray-700/40 rounded-2xl shadow-xl shadow-black/20">
              <textarea
                value={tempImageDesc}
                onChange={(e) => setTempImageDesc(e.target.value)}
                className="text-base text-gray-200 bg-gray-800/60 border border-gray-600/40 rounded-xl px-4 py-3 flex-1 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 backdrop-blur-sm"
                rows={3}
                autoFocus
              />
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleImageDescEdit(tempImageDesc)}
                  className="text-emerald-200 hover:text-emerald-100 text-sm px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
                >
                  저장
                </button>
                <button
                  onClick={() => {
                    setEditingImageDesc(false);
                    setTempImageDesc('');
                  }}
                  className="text-gray-300 hover:text-gray-200 text-sm px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/40 rounded-xl transition-all duration-200 backdrop-blur-sm"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className="text-base text-gray-300 mb-6 leading-relaxed">{description}</p>
          )}

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
            className="relative block cursor-pointer group/label"
          >
            <div className="border-2 border-dashed border-gray-600/50 rounded-3xl p-10 text-center bg-gray-900/30 backdrop-blur-xl hover:border-gray-500/70 hover:bg-gray-800/40 transition-all duration-500 shadow-xl shadow-black/20">
              <div className="space-y-6">
                {formData[field.key] ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-center w-40 h-40 mx-auto bg-gray-800/60 rounded-3xl overflow-hidden border border-gray-600/40 shadow-2xl">
                      <img
                        src={formData[field.key]}
                        alt="업로드된 이미지"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleInputChange(field.key, '');
                      }}
                      className="text-red-300 hover:text-red-200 text-sm underline underline-offset-2 transition-colors duration-200 bg-red-900/20 px-4 py-2 rounded-xl border border-red-500/30"
                    >
                      이미지 제거
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-center w-40 h-40 mx-auto bg-gray-800/50 rounded-3xl border border-gray-600/40 group-hover/label:border-gray-500/60 transition-all duration-500 shadow-2xl">
                      <svg className="w-16 h-16 text-gray-500 group-hover/label:text-gray-400 transition-colors duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="space-y-4">
                      <div className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 hover:from-blue-500 hover:via-blue-400 hover:to-purple-500 text-white px-8 py-4 rounded-2xl text-base font-semibold transition-all duration-500 transform hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/25">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        이미지 선택
                      </div>
                      <p className="text-sm text-gray-400 leading-relaxed">PNG, JPG, GIF (최대 10MB)</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-cyan-600/10 opacity-0 group-hover/label:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
          </label>
        </div>

        {errors[field.key] && (
          <p className="mt-4 text-sm text-red-300 flex items-center gap-2 bg-red-900/20 px-4 py-2 rounded-xl border border-red-500/30">
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
    <>
      <RealtimeConfigSync
        onConfigUpdate={handleConfigUpdate}
        onAdminUpdate={handleAdminUpdate}
      />

      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-gradient-to-br from-blue-600/15 via-purple-600/10 to-transparent rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-tl from-cyan-600/15 via-blue-600/10 to-transparent rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-gradient-to-r from-emerald-600/10 to-transparent rounded-full blur-3xl"></div>

        <div className="relative z-10 max-w-4xl mx-auto p-8">
          <div className="bg-gray-900/30 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-gray-700/30 p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-cyan-600/5 rounded-[2rem]"></div>

            <div className="relative z-10">
              <div className="flex items-start justify-between mb-12">
                <div className="max-w-2xl">
                  <h2 className="text-5xl font-bold text-white mb-6 tracking-tight bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
                    기본 정보 입력
                  </h2>
                  <p className="text-gray-300 text-xl leading-relaxed font-medium">
                    광고 영상 제작을 위한 브랜드 정보를 입력해주세요
                  </p>
                </div>

                {isAdmin && hiddenFields.length > 0 && (
                  <div className="text-sm bg-gray-800/40 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/40 shadow-xl min-w-[300px]">
                    <span className="text-gray-300 block mb-3 font-semibold">숨겨진 항목:</span>
                    <div className="flex flex-wrap gap-2">
                      {hiddenFields.map((field) => (
                        <button
                          key={field.key}
                          onClick={() => handleRestoreField(field.key)}
                          className="text-blue-300 hover:text-blue-200 underline underline-offset-2 text-sm px-3 py-2 bg-blue-600/15 hover:bg-blue-600/25 rounded-xl transition-all duration-200 border border-blue-500/30"
                          title={`${field.label} 되돌리기`}
                        >
                          {field.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-10">
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

              {/* 🔥 Person Selection UI */}
              {personConfigVisible && persons.length > 0 && (
                <div className="group mb-8">
                  <label className="text-lg font-semibold text-white tracking-wide mb-1 block">
                    6. 인물 선택 (선택)
                  </label>
                  <div className="bg-gray-900/40 rounded-xl p-6 border border-gray-700">
                    <p className="text-sm text-gray-400 mb-4">
                      영상에 합성할 인물을 선택하세요. 선택하지 않으면 인물 합성이 적용되지 않습니다.
                    </p>

                    <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                      {/* None Option */}
                      <div
                        onClick={() => setFormData(prev => ({ ...prev, personSelection: '' }))}
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
                          onClick={() => setFormData(prev => ({ ...prev, personSelection: person.url }))}
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

              <div className="flex justify-end mt-16">
                {/* ✅ 이전 버튼 추가 */}
                <button
                  onClick={onPrev}
                  className="px-8 py-5 border-2 border-gray-600/50 text-gray-300 rounded-2xl text-xl font-semibold hover:bg-gray-800/40 hover:border-gray-500/70 transition-all duration-300 backdrop-blur-xl"
                >
                  ← 이전 단계
                </button>
                <button
                  onClick={handleSubmit}
                  className="group relative bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 hover:from-blue-500 hover:via-blue-400 hover:to-purple-500 text-white px-12 py-5 rounded-2xl text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-500 transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/25 shadow-xl"
                >
                  <span className="relative z-10 flex items-center gap-4">
                    다음 단계
                    <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-purple-400/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                </button>
              </div>

              {isAdmin && (
                <div className="mt-12 p-8 bg-blue-900/15 backdrop-blur-xl border border-blue-800/25 rounded-3xl shadow-xl">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-7 w-7 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-5">
                      <h3 className="text-lg font-semibold text-blue-300 mb-3">관리자 모드</h3>
                      <div className="text-base text-blue-400 space-y-2 leading-relaxed">
                        <p>• 각 필드의 "편집" 버튼으로 라벨을 수정하거나 "숨기기"로 필드를 제거할 수 있습니다.</p>
                        <p>• "힌트편집" 버튼으로 입력 안내 텍스트를 수정할 수 있습니다.</p>
                        <p>• 이미지 업로드 필드는 "라벨 편집", "설명 편집"이 가능합니다.</p>
                        <p>• 변경사항은 모든 사용자에게 자동으로 반영됩니다.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Step1.propTypes = {
  formData: PropTypes.object.isRequired,
  setFormData: PropTypes.func.isRequired,
  user: PropTypes.object,
  onPrev: PropTypes.func,
  onNext: PropTypes.func.isRequired
};

export default Step1;

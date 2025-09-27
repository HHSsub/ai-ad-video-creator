// src/components/Step1.jsx - 1열 배치 + 예시값 편집 기능 + 영상설명 필드 완전 제거 (완전버전)
import { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { 
  loadFieldConfig, 
  saveFieldConfig, 
  applyDefaultValues, 
  setupFieldConfigSync,
  loadAdminSettings,
  saveAdminSettings,
  updateFieldPlaceholder,
  updateFieldRandomValues
} from '../utils/fieldConfig';

const Step1 = ({ formData, setFormData, onNext, user }) => {
  const [errors, setErrors] = useState({});
  const [fieldConfig, setFieldConfig] = useState({});
  const [editingLabel, setEditingLabel] = useState(null);
  const [tempLabel, setTempLabel] = useState('');
  const [adminSettings, setAdminSettings] = useState({});
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [tempDescription, setTempDescription] = useState('');
  const [editingPlaceholder, setEditingPlaceholder] = useState(null);
  const [tempPlaceholder, setTempPlaceholder] = useState('');
  const [editingRandomValues, setEditingRandomValues] = useState(null);
  const [tempRandomValues, setTempRandomValues] = useState([]);
  const [isAddingRandomValue, setIsAddingRandomValue] = useState(false);
  const [newRandomValue, setNewRandomValue] = useState('');
  const [fieldVisibilityHistory, setFieldVisibilityHistory] = useState({});
  const [configBackups, setConfigBackups] = useState([]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [globalSettings, setGlobalSettings] = useState({});
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [fieldValidationRules, setFieldValidationRules] = useState({});
  const [customValidationMessages, setCustomValidationMessages] = useState({});
  const [fieldDependencies, setFieldDependencies] = useState({});
  const [conditionalFields, setConditionalFields] = useState({});
  const [fieldGroups, setFieldGroups] = useState({});
  const [draggedField, setDraggedField] = useState(null);
  const [fieldOrder, setFieldOrder] = useState([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [fieldStats, setFieldStats] = useState({});
  const imageRef = useRef(null);
  const configSyncRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);

  // 관리자 권한 확인
  const isAdmin = user?.role === 'admin';
  const isSuperAdmin = user?.role === 'superadmin';
  const canEditAdvanced = isAdmin || isSuperAdmin;

  // 실시간 설정 동기화
  const handleSettingsUpdate = useCallback((type, data) => {
    if (type === 'config') {
      setFieldConfig(data);
      trackFieldChanges(data);
    } else if (type === 'admin') {
      setAdminSettings(data);
      console.log('[Step1] Admin 설정 업데이트:', data);
    } else if (type === 'global') {
      setGlobalSettings(data);
    }
    setUnsavedChanges(false);
    setLastSavedAt(new Date());
  }, []);

  // 필드 변경 추적
  const trackFieldChanges = useCallback((newConfig) => {
    const stats = {};
    Object.keys(newConfig).forEach(key => {
      const field = newConfig[key];
      stats[key] = {
        visible: field.visible,
        required: field.required,
        lastModified: field.lastModified || new Date(),
        usageCount: field.usageCount || 0
      };
    });
    setFieldStats(stats);
  }, []);

  // 자동 저장 기능
  const autoSave = useCallback(() => {
    if (unsavedChanges && isAdmin) {
      console.log('[Step1] 자동 저장 실행');
      saveFieldConfig(fieldConfig);
      setUnsavedChanges(false);
      setLastSavedAt(new Date());
    }
  }, [unsavedChanges, isAdmin, fieldConfig]);

  // 설정 백업 생성
  const createConfigBackup = useCallback(() => {
    const backup = {
      id: Date.now(),
      timestamp: new Date(),
      config: { ...fieldConfig },
      adminSettings: { ...adminSettings },
      description: `백업 ${new Date().toLocaleString()}`
    };
    setConfigBackups(prev => [backup, ...prev.slice(0, 9)]); // 최대 10개 백업 유지
    localStorage.setItem('field-config-backups', JSON.stringify([backup, ...configBackups.slice(0, 9)]));
  }, [fieldConfig, adminSettings, configBackups]);

  // 백업 복원
  const restoreConfigBackup = useCallback((backupId) => {
    const backup = configBackups.find(b => b.id === backupId);
    if (backup) {
      setFieldConfig(backup.config);
      setAdminSettings(backup.adminSettings);
      saveFieldConfig(backup.config);
      saveAdminSettings(backup.adminSettings);
      console.log('[Step1] 백업 복원됨:', backup.description);
    }
  }, [configBackups]);

  // 컴포넌트 마운트 시 설정 로드 및 실시간 동기화 설정
  useEffect(() => {
    setIsLoadingSettings(true);
    
    const config = loadFieldConfig();
    setFieldConfig(config);
    trackFieldChanges(config);

    // 숨겨진 필드들의 기본값 적용
    const defaultValues = applyDefaultValues(config);
    if (Object.keys(defaultValues).length > 0) {
      setFormData(prev => ({ ...prev, ...defaultValues }));
    }

    // 필드 순서 초기화
    const order = Object.keys(config).filter(key => config[key].visible);
    setFieldOrder(order);

    // 저장된 백업 로드
    const savedBackups = localStorage.getItem('field-config-backups');
    if (savedBackups) {
      try {
        setConfigBackups(JSON.parse(savedBackups));
      } catch (error) {
        console.error('[Step1] 백업 로드 오류:', error);
      }
    }

    // 서버에서 Admin 설정 로드
    loadAdminSettingsFromServer();

    // 실시간 동기화 설정
    const cleanup = setupFieldConfigSync(handleSettingsUpdate);
    configSyncRef.current = cleanup;

    setIsLoadingSettings(false);

    return () => {
      if (configSyncRef.current) {
        configSyncRef.current();
      }
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [handleSettingsUpdate, setFormData, trackFieldChanges]);

  // 자동 저장 타이머 설정
  useEffect(() => {
    if (unsavedChanges) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(autoSave, 5000); // 5초 후 자동 저장
    }
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [unsavedChanges, autoSave]);

  // 서버에서 Admin 설정 로드
  const loadAdminSettingsFromServer = async () => {
    try {
      const response = await fetch('/api/admin-config');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAdminSettings(data.adminSettings);
          setGlobalSettings(data.globalSettings || {});
          console.log('[Step1] 서버 Admin 설정 로드됨:', data.adminSettings);
        }
      }
    } catch (error) {
      console.error('[Step1] Admin 설정 로드 오류:', error);
    }
  };

  // 이미지 업로드 라벨과 설명 가져오기
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

  // 이미지 업로드 설정 저장
  const saveImageUploadConfig = async (label, description) => {
    const videoPurpose = formData.videoPurpose || 'default';
    const currentSettings = loadAdminSettings();
    
    const updatedSettings = {
      ...currentSettings,
      imageUpload: {
        ...currentSettings.imageUpload,
        label: label,
        descriptions: {
          ...currentSettings.imageUpload?.descriptions,
          [videoPurpose]: description
        }
      }
    };

    saveAdminSettings(updatedSettings);
    setAdminSettings(updatedSettings);
    setUnsavedChanges(true);

    // 서버에도 저장
    try {
      await fetch('/api/admin-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSettings: updatedSettings })
      });
      setLastSavedAt(new Date());
    } catch (error) {
      console.error('[Step1] Admin 설정 서버 저장 오류:', error);
    }
  };

  // 필드 종속성 확인
  const checkFieldDependencies = useCallback((fieldKey, value) => {
    const dependencies = fieldDependencies[fieldKey];
    if (!dependencies) return true;

    return dependencies.every(dep => {
      const depValue = formData[dep.field];
      switch (dep.condition) {
        case 'equals':
          return depValue === dep.value;
        case 'not_equals':
          return depValue !== dep.value;
        case 'contains':
          return depValue && depValue.includes(dep.value);
        case 'not_empty':
          return depValue && depValue.length > 0;
        default:
          return true;
      }
    });
  }, [fieldDependencies, formData]);

  // 조건부 필드 표시 확인
  const shouldShowField = useCallback((field) => {
    if (!field.visible) return false;
    
    const conditions = conditionalFields[field.key];
    if (!conditions) return true;

    return conditions.every(condition => {
      const sourceValue = formData[condition.sourceField];
      switch (condition.operator) {
        case 'equals':
          return sourceValue === condition.value;
        case 'not_equals':
          return sourceValue !== condition.value;
        case 'contains':
          return sourceValue && sourceValue.includes(condition.value);
        case 'in':
          return condition.value.includes(sourceValue);
        default:
          return true;
      }
    });
  }, [conditionalFields, formData]);

  const handleInputChange = (key, value) => {
    // 필드 종속성 확인
    if (!checkFieldDependencies(key, value)) {
      setErrors(prev => ({
        ...prev,
        [key]: '필드 종속성 조건을 만족하지 않습니다.'
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      [key]: value,
      // 백워드 호환성을 위해 기존 필드들도 동기화
      ...(key === 'imageUpload' && {
        productImage: value,
        brandLogo: value,
        imageRef: value
      })
    }));
    
    // 에러 초기화
    if (errors[key]) {
      setErrors(prev => ({
        ...prev,
        [key]: null
      }));
    }

    // 필드 사용 통계 업데이트
    const currentField = fieldConfig[key];
    if (currentField) {
      const updatedField = {
        ...currentField,
        usageCount: (currentField.usageCount || 0) + 1,
        lastUsed: new Date()
      };
      
      setFieldConfig(prev => ({
        ...prev,
        [key]: updatedField
      }));
      setUnsavedChanges(true);
    }

    // 조건부 필드 업데이트 트리거
    const dependentFields = Object.keys(conditionalFields).filter(fieldKey => 
      conditionalFields[fieldKey].some(condition => condition.sourceField === key)
    );
    
    if (dependentFields.length > 0) {
      console.log(`[Step1] 종속 필드 업데이트: ${dependentFields.join(', ')}`);
    }
  };

  const handleFileUpload = (field, event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 파일 크기 검증
    const maxSize = globalSettings.maxFileSize || (10 * 1024 * 1024);
    if (file.size > maxSize) {
      setErrors(prev => ({
        ...prev,
        [field]: `파일 크기는 ${Math.round(maxSize / 1024 / 1024)}MB 이하여야 합니다.`
      }));
      return;
    }

    // 파일 형식 검증
    const allowedTypes = globalSettings.allowedFileTypes || ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setErrors(prev => ({
        ...prev,
        [field]: '지원되지 않는 파일 형식입니다.'
      }));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileData = {
        file: file,
        url: e.target?.result,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date(),
        uploadedBy: user?.id || 'anonymous'
      };

      setFormData(prev => ({
        ...prev,
        [field]: fileData,
        // 백워드 호환성을 위해 기존 필드들도 동기화
        productImage: field === 'imageUpload' ? fileData : prev.productImage,
        brandLogo: field === 'imageUpload' ? fileData : prev.brandLogo,
        imageRef: field === 'imageUpload' ? fileData : prev.imageRef
      }));

      // 파일 업로드 통계 업데이트
      const currentField = fieldConfig[field];
      if (currentField) {
        const updatedField = {
          ...currentField,
          fileUploadCount: (currentField.fileUploadCount || 0) + 1,
          lastFileUpload: new Date()
        };
        
        setFieldConfig(prev => ({
          ...prev,
          [field]: updatedField
        }));
        setUnsavedChanges(true);
      }
    };

    reader.onerror = () => {
      setErrors(prev => ({
        ...prev,
        [field]: '파일 읽기 중 오류가 발생했습니다.'
      }));
    };

    reader.readAsDataURL(file);
  };

  const removeFile = (field) => {
    setFormData(prev => ({
      ...prev,
      [field]: null,
      // 백워드 호환성을 위해 기존 필드들도 null로 설정
      productImage: null,
      brandLogo: null,
      imageRef: null
    }));
  };
// 커스텀 검증 실행
  const runCustomValidation = useCallback((field, value) => {
    const rules = fieldValidationRules[field.key];
    if (!rules || rules.length === 0) return null;

    for (const rule of rules) {
      let isValid = true;
      let message = rule.message || `${field.label} 검증 실패`;

      switch (rule.type) {
        case 'minLength':
          isValid = value && value.length >= rule.value;
          break;
        case 'maxLength':
          isValid = !value || value.length <= rule.value;
          break;
        case 'pattern':
          isValid = !value || new RegExp(rule.value).test(value);
          break;
        case 'custom':
          try {
            isValid = new Function('value', 'formData', rule.function)(value, formData);
          } catch (error) {
            console.error('[Step1] 커스텀 검증 오류:', error);
            isValid = true;
          }
          break;
        default:
          isValid = true;
      }

      if (!isValid) {
        return customValidationMessages[field.key]?.[rule.type] || message;
      }
    }

    return null;
  }, [fieldValidationRules, customValidationMessages, formData]);

  const handleSubmit = () => {
    createConfigBackup(); // 제출 전 백업 생성
    
    const newErrors = {};
    let hasErrors = false;

    // 기본 필수 필드 검증
    Object.values(fieldConfig).forEach(field => {
      if (!shouldShowField(field)) return;
      
      const value = formData[field.key];
      
      if (field.required && field.visible && (!value || value === '')) {
        newErrors[field.key] = `${field.label}은(는) 필수 입력 항목입니다.`;
        hasErrors = true;
      }

      // 커스텀 검증 실행
      const customError = runCustomValidation(field, value);
      if (customError) {
        newErrors[field.key] = customError;
        hasErrors = true;
      }
    });

    // 필드 간 교차 검증
    const crossValidationErrors = runCrossFieldValidation();
    Object.assign(newErrors, crossValidationErrors);
    if (Object.keys(crossValidationErrors).length > 0) {
      hasErrors = true;
    }

    if (hasErrors) {
      setErrors(newErrors);
      // 첫 번째 에러 필드로 스크롤
      const firstErrorField = Object.keys(newErrors)[0];
      if (firstErrorField) {
        const element = document.querySelector(`[data-field="${firstErrorField}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      return;
    }

    // 제출 통계 업데이트
    updateSubmissionStats();
    onNext();
  };

  // 필드 간 교차 검증
  const runCrossFieldValidation = useCallback(() => {
    const errors = {};
    
    // 예시: 비밀번호 확인 검증
    if (formData.password && formData.confirmPassword) {
      if (formData.password !== formData.confirmPassword) {
        errors.confirmPassword = '비밀번호가 일치하지 않습니다.';
      }
    }

    // 예시: 날짜 범위 검증
    if (formData.startDate && formData.endDate) {
      if (new Date(formData.startDate) > new Date(formData.endDate)) {
        errors.endDate = '종료일은 시작일보다 늦어야 합니다.';
      }
    }

    return errors;
  }, [formData]);

  // 제출 통계 업데이트
  const updateSubmissionStats = useCallback(() => {
    const stats = {
      submissionCount: (globalSettings.submissionCount || 0) + 1,
      lastSubmission: new Date(),
      submittedBy: user?.id || 'anonymous',
      formVersion: fieldConfig.version || '1.0'
    };

    setGlobalSettings(prev => ({ ...prev, ...stats }));
    
    // 서버에 통계 전송
    fetch('/api/admin-config/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stats)
    }).catch(error => console.error('[Step1] 통계 전송 오류:', error));
  }, [globalSettings, user, fieldConfig]);

  // 관리자 전용: 필드 숨기기
  const handleHideField = (fieldKey) => {
    // 가시성 이력 저장
    setFieldVisibilityHistory(prev => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        hiddenAt: new Date(),
        hiddenBy: user?.id || 'admin'
      }
    }));

    const updatedConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        visible: false,
        lastModified: new Date(),
        modifiedBy: user?.id || 'admin'
      }
    };
    setFieldConfig(updatedConfig);
    saveFieldConfig(updatedConfig);
    setUnsavedChanges(true);

    // 필드 순서에서 제거
    setFieldOrder(prev => prev.filter(key => key !== fieldKey));
  };

  // 관리자 전용: 필드 복원
  const handleRestoreField = (fieldKey) => {
    // 가시성 이력 저장
    setFieldVisibilityHistory(prev => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        restoredAt: new Date(),
        restoredBy: user?.id || 'admin'
      }
    }));

    const updatedConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        visible: true,
        lastModified: new Date(),
        modifiedBy: user?.id || 'admin'
      }
    };
    setFieldConfig(updatedConfig);
    saveFieldConfig(updatedConfig);
    setUnsavedChanges(true);

    // 필드 순서에 추가
    setFieldOrder(prev => [...prev, fieldKey]);
  };

  // 관리자 전용: 라벨 편집
  const handleLabelEdit = (fieldKey, newLabel) => {
    const updatedConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        label: newLabel,
        lastModified: new Date(),
        modifiedBy: user?.id || 'admin'
      }
    };
    setFieldConfig(updatedConfig);
    saveFieldConfig(updatedConfig);
    setEditingLabel(null);
    setUnsavedChanges(true);
  };

  // 관리자 전용: 예시값(placeholder) 편집
  const handlePlaceholderEdit = async (fieldKey, newPlaceholder) => {
    const success = await updateFieldPlaceholder(fieldKey, newPlaceholder);
    if (success) {
      const updatedConfig = loadFieldConfig();
      setFieldConfig(updatedConfig);
      setEditingPlaceholder(null);
      setUnsavedChanges(true);
    }
  };

  // 관리자 전용: 랜덤값 편집
  const handleRandomValuesEdit = async (fieldKey, newRandomValues) => {
    const success = await updateFieldRandomValues(fieldKey, newRandomValues);
    if (success) {
      const updatedConfig = loadFieldConfig();
      setFieldConfig(updatedConfig);
      setEditingRandomValues(null);
      setUnsavedChanges(true);
    }
  };

  // 랜덤값 추가
  const addRandomValue = (fieldKey) => {
    if (newRandomValue.trim()) {
      const currentField = fieldConfig[fieldKey];
      const updatedRandomValues = [...(currentField.randomValues || []), newRandomValue.trim()];
      handleRandomValuesEdit(fieldKey, updatedRandomValues);
      setNewRandomValue('');
      setIsAddingRandomValue(false);
    }
  };

  // 랜덤값 제거
  const removeRandomValue = (fieldKey, index) => {
    const currentField = fieldConfig[fieldKey];
    const updatedRandomValues = currentField.randomValues.filter((_, i) => i !== index);
    handleRandomValuesEdit(fieldKey, updatedRandomValues);
  };

  // 랜덤값 자동 채우기
  const fillWithRandomValue = (fieldKey) => {
    const field = fieldConfig[fieldKey];
    if (field.randomValues && field.randomValues.length > 0) {
      const randomValue = field.randomValues[Math.floor(Math.random() * field.randomValues.length)];
      handleInputChange(fieldKey, randomValue);
    }
  };

  // 벌크 편집 모드 토글
  const toggleBulkEditMode = () => {
    setBulkEditMode(!bulkEditMode);
    setSelectedFields(new Set());
  };

  // 필드 선택/해제
  const toggleFieldSelection = (fieldKey) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(fieldKey)) {
      newSelected.delete(fieldKey);
    } else {
      newSelected.add(fieldKey);
    }
    setSelectedFields(newSelected);
  };

  // 벌크 작업 실행
  const executeBulkAction = (action, value) => {
    const updatedConfig = { ...fieldConfig };
    selectedFields.forEach(fieldKey => {
      switch (action) {
        case 'hide':
          updatedConfig[fieldKey].visible = false;
          break;
        case 'show':
          updatedConfig[fieldKey].visible = true;
          break;
        case 'require':
          updatedConfig[fieldKey].required = true;
          break;
        case 'optional':
          updatedConfig[fieldKey].required = false;
          break;
        case 'setGroup':
          updatedConfig[fieldKey].group = value;
          break;
        default:
          break;
      }
      updatedConfig[fieldKey].lastModified = new Date();
      updatedConfig[fieldKey].modifiedBy = user?.id || 'admin';
    });

    setFieldConfig(updatedConfig);
    saveFieldConfig(updatedConfig);
    setSelectedFields(new Set());
    setUnsavedChanges(true);
  };

  // 드래그 앤 드롭 핸들러
  const handleDragStart = (fieldKey) => {
    setDraggedField(fieldKey);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (targetFieldKey) => {
    if (draggedField && draggedField !== targetFieldKey) {
      const newOrder = [...fieldOrder];
      const draggedIndex = newOrder.indexOf(draggedField);
      const targetIndex = newOrder.indexOf(targetFieldKey);
      
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedField);
      
      setFieldOrder(newOrder);
      setDraggedField(null);

      // 순서 정보를 설정에 저장
      const updatedConfig = { ...fieldConfig };
      newOrder.forEach((fieldKey, index) => {
        updatedConfig[fieldKey].order = index;
      });
      setFieldConfig(updatedConfig);
      saveFieldConfig(updatedConfig);
      setUnsavedChanges(true);
    }
  };

  // 필드 그룹 관리
  const createFieldGroup = (groupName, fieldKeys) => {
    const newGroup = {
      id: Date.now(),
      name: groupName,
      fields: fieldKeys,
      createdAt: new Date(),
      createdBy: user?.id || 'admin'
    };

    setFieldGroups(prev => ({
      ...prev,
      [newGroup.id]: newGroup
    }));

    // 그룹에 속한 필드들 업데이트
    const updatedConfig = { ...fieldConfig };
    fieldKeys.forEach(fieldKey => {
      updatedConfig[fieldKey] = {
        ...updatedConfig[fieldKey],
        groupId: newGroup.id
      };
    });

    setFieldConfig(updatedConfig);
    saveFieldConfig(updatedConfig);
    setUnsavedChanges(true);
  };

  // 필드 미리보기 모드
  const togglePreviewMode = () => {
    setPreviewMode(!previewMode);
  };

  // 설정 내보내기
  const exportConfiguration = () => {
    const exportData = {
      fieldConfig,
      adminSettings,
      globalSettings,
      fieldGroups,
      exportedAt: new Date(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `field-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 설정 가져오기
  const importConfiguration = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);
        
        if (importData.fieldConfig) {
          setFieldConfig(importData.fieldConfig);
          saveFieldConfig(importData.fieldConfig);
        }
        
        if (importData.adminSettings) {
          setAdminSettings(importData.adminSettings);
          saveAdminSettings(importData.adminSettings);
        }
        
        if (importData.globalSettings) {
          setGlobalSettings(importData.globalSettings);
        }
        
        if (importData.fieldGroups) {
          setFieldGroups(importData.fieldGroups);
        }

        console.log('[Step1] 설정 가져오기 완료');
        setUnsavedChanges(false);
      } catch (error) {
        console.error('[Step1] 설정 가져오기 오류:', error);
        alert('설정 파일 가져오기에 실패했습니다.');
      }
    };
    reader.readAsText(file);
  };

  const renderTextField = (field) => (
    <div 
      key={field.key} 
      className={`space-y-2 ${bulkEditMode ? 'border-2 border-dashed border-gray-300 p-2 rounded' : ''}`}
      data-field={field.key}
      draggable={isAdmin}
      onDragStart={() => handleDragStart(field.key)}
      onDragOver={handleDragOver}
      onDrop={() => handleDrop(field.key)}
    >
      {bulkEditMode && (
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={selectedFields.has(field.key)}
            onChange={() => toggleFieldSelection(field.key)}
            className="mr-2"
          />
          <span className="text-sm text-gray-600">선택</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        {editingLabel === field.key ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
              autoFocus
            />
            <button
              onClick={() => handleLabelEdit(field.key, tempLabel)}
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
        ) : (
          <div className="flex items-center gap-2">
            <label className="block text-sm font-medium text-gray-700">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            {fieldStats[field.key] && isAdmin && (
              <span className="text-xs text-gray-400">
                (사용: {fieldStats[field.key].usageCount || 0}회)
              </span>
            )}
            {isAdmin && (
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setEditingLabel(field.key);
                    setTempLabel(field.label);
                  }}
                  className="text-blue-600 hover:text-blue-700 text-xs px-1"
                  title="라벨 편집"
                >
                  ✏️
                </button>
                <button
                  onClick={() => fillWithRandomValue(field.key)}
                  className="text-purple-600 hover:text-purple-700 text-xs px-1"
                  title="랜덤값 채우기"
                >
                  🎲
                </button>
                <button
                  onClick={() => handleHideField(field.key)}
                  className="text-red-600 hover:text-red-700 text-xs px-1"
                  title="필드 숨기기"
                >
                  👁️‍🗨️
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 예시값 편집 기능 */}
      {editingPlaceholder === field.key ? (
        <div className="mb-2 p-2 border border-gray-200 rounded bg-gray-50">
          <input
            type="text"
            value={tempPlaceholder}
            onChange={(e) => setTempPlaceholder(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
            placeholder="새로운 예시값을 입력하세요"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handlePlaceholderEdit(field.key, tempPlaceholder)}
              className="text-green-600 hover:text-green-700 text-xs px-2 py-1 border rounded"
            >
              저장
            </button>
            <button
              onClick={() => setEditingPlaceholder(null)}
              className="text-red-600 hover:text-red-700 text-xs px-2 py-1 border rounded"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        isAdmin && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500">예시: {field.placeholder}</span>
            <button
              onClick={() => {
                setEditingPlaceholder(field.key);
                setTempPlaceholder(field.placeholder || '');
              }}
              className="text-blue-600 hover:text-blue-700 text-xs"
              title="예시값 편집"
            >
              ✏️
            </button>
          </div>
        )
      )}

      {/* 랜덤값 편집 기능 */}
      {editingRandomValues === field.key ? (
        <div className="mb-2 p-3 border border-gray-200 rounded bg-blue-50">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            랜덤값 관리
          </label>
          <div className="space-y-2">
            {field.randomValues?.map((value, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={value}
                  onChange={(e) => {
                    const newValues = [...field.randomValues];
                    newValues[index] = e.target.value;
                    setTempRandomValues(newValues);
                  }}
                  className="flex-1 px-2 py-1 border rounded text-sm"
                />
                <button
                  onClick={() => removeRandomValue(field.key, index)}
                  className="text-red-600 hover:text-red-700 text-xs px-2 py-1 border rounded"
                >
                  삭제
                </button>
              </div>
            ))}
            {isAddingRandomValue && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newRandomValue}
                  onChange={(e) => setNewRandomValue(e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm"
                  placeholder="새 랜덤값 입력"
                  autoFocus
                />
                <button
                  onClick={() => addRandomValue(field.key)}
                  className="text-green-600 hover:text-green-700 text-xs px-2 py-1 border rounded"
                >
                  추가
                </button>
                <button
                  onClick={() => {
                    setIsAddingRandomValue(false);
                    setNewRandomValue('');
                  }}
                  className="text-red-600 hover:text-red-700 text-xs px-2 py-1 border rounded"
                >
                  취소
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setIsAddingRandomValue(true)}
              className="text-blue-600 hover:text-blue-700 text-xs px-2 py-1 border rounded"
            >
              + 랜덤값 추가
            </button>
            <button
              onClick={() => {
                handleRandomValuesEdit(field.key, tempRandomValues);
                setEditingRandomValues(null);
              }}
              className="text-green-600 hover:text-green-700 text-xs px-2 py-1 border rounded"
            >
              저장
            </button>
            <button
              onClick={() => setEditingRandomValues(null)}
              className="text-red-600 hover:text-red-700 text-xs px-2 py-1 border rounded"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        isAdmin && field.randomValues && field.randomValues.length > 0 && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500">
              랜덤값: {field.randomValues.slice(0, 3).join(', ')}
              {field.randomValues.length > 3 && '...'}
            </span>
            <button
              onClick={() => {
                setEditingRandomValues(field.key);
                setTempRandomValues([...field.randomValues]);
              }}
              className="text-blue-600 hover:text-blue-700 text-xs"
              title="랜덤값 편집"
            >
              ⚙️
            </button>
          </div>
        )
      )}

      <input
        type="text"
        value={formData[field.key] || ''}
        onChange={(e) => handleInputChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        disabled={previewMode}
      />
      {errors[field.key] && (
        <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
      )}
    </div>
  );

  const renderSelectField = (field) => (
    <div 
      key={field.key} 
      className={`space-y-2 ${bulkEditMode ? 'border-2 border-dashed border-gray-300 p-2 rounded' : ''}`}
      data-field={field.key}
      draggable={isAdmin}
      onDragStart={() => handleDragStart(field.key)}
      onDragOver={handleDragOver}
      onDrop={() => handleDrop(field.key)}
    >
      {bulkEditMode && (
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={selectedFields.has(field.key)}
            onChange={() => toggleFieldSelection(field.key)}
            className="mr-2"
          />
          <span className="text-sm text-gray-600">선택</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        {editingLabel === field.key ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
              autoFocus
            />
            <button
              onClick={() => handleLabelEdit(field.key, tempLabel)}
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
        ) : (
          <div className="flex items-center gap-2">
            <label className="block text-sm font-medium text-gray-700">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            {isAdmin && (
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setEditingLabel(field.key);
                    setTempLabel(field.label);
                  }}
                  className="text-blue-600 hover:text-blue-700 text-xs px-1"
                  title="라벨 편집"
                >
                  ✏️
                </button>
                <button
                  onClick={() => fillWithRandomValue(field.key)}
                  className="text-purple-600 hover:text-purple-700 text-xs px-1"
                  title="랜덤값 채우기"
                >
                  🎲
                </button>
                <button
                  onClick={() => handleHideField(field.key)}
                  className="text-red-600 hover:text-red-700 text-xs px-1"
                  title="필드 숨기기"
                >
                  👁️‍🗨️
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <select
        value={formData[field.key] || ''}
        onChange={(e) => handleInputChange(field.key, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        disabled={previewMode}
      >
        <option value="">선택해주세요</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {errors[field.key] && (
        <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
      )}
    </div>
  );

  const renderTextareaField = (field) => (
    <div 
      key={field.key} 
      className={`space-y-2 ${bulkEditMode ? 'border-2 border-dashed border-gray-300 p-2 rounded' : ''}`}
      data-field={field.key}
      draggable={isAdmin}
      onDragStart={() => handleDragStart(field.key)}
      onDragOver={handleDragOver}
      onDrop={() => handleDrop(field.key)}
    >
      {bulkEditMode && (
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={selectedFields.has(field.key)}
            onChange={() => toggleFieldSelection(field.key)}
            className="mr-2"
          />
          <span className="text-sm text-gray-600">선택</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        {editingLabel === field.key ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
              autoFocus
            />
            <button
              onClick={() => handleLabelEdit(field.key, tempLabel)}
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
        ) : (
          <div className="flex items-center gap-2">
            <label className="block text-sm font-medium text-gray-700">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            {isAdmin && (
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setEditingLabel(field.key);
                    setTempLabel(field.label);
                  }}
                  className="text-blue-600 hover:text-blue-700 text-xs px-1"
                  title="라벨 편집"
                >
                  ✏️
                </button>
                <button
                  onClick={() => fillWithRandomValue(field.key)}
                  className="text-purple-600 hover:text-purple-700 text-xs px-1"
                  title="랜덤값 채우기"
                >
                  🎲
                </button>
                <button
                  onClick={() => handleHideField(field.key)}
                  className="text-red-600 hover:text-red-700 text-xs px-1"
                  title="필드 숨기기"
                >
                  👁️‍🗨️
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 텍스트에리어 예시값 편집 */}
      {editingPlaceholder === field.key ? (
        <div className="mb-2 p-2 border border-gray-200 rounded bg-gray-50">
          <textarea
            value={tempPlaceholder}
            onChange={(e) => setTempPlaceholder(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
            rows={2}
            placeholder="새로운 예시값을 입력하세요"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handlePlaceholderEdit(field.key, tempPlaceholder)}
              className="text-green-600 hover:text-green-700 text-xs px-2 py-1 border rounded"
            >
              저장
            </button>
            <button
              onClick={() => setEditingPlaceholder(null)}
              className="text-red-600 hover:text-red-700 text-xs px-2 py-1 border rounded"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        isAdmin && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500">예시: {field.placeholder}</span>
            <button
              onClick={() => {
                setEditingPlaceholder(field.key);
                setTempPlaceholder(field.placeholder || '');
              }}
              className="text-blue-600 hover:text-blue-700 text-xs"
              title="예시값 편집"
            >
              ✏️
            </button>
          </div>
        )
      )}

      <textarea
        value={formData[field.key] || ''}
        onChange={(e) => handleInputChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        disabled={previewMode}
      />
      {errors[field.key] && (
        <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
      )}
    </div>
  );
const renderImageField = (field, descField) => {
    const { label, description } = getImageUploadConfig();

    return (
      <div 
        key={field.key} 
        className={`space-y-2 ${bulkEditMode ? 'border-2 border-dashed border-gray-300 p-2 rounded' : ''}`}
        data-field={field.key}
        draggable={isAdmin}
        onDragStart={() => handleDragStart(field.key)}
        onDragOver={handleDragOver}
        onDrop={() => handleDrop(field.key)}
      >
        {bulkEditMode && (
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={selectedFields.has(field.key)}
              onChange={() => toggleFieldSelection(field.key)}
              className="mr-2"
            />
            <span className="text-sm text-gray-600">선택</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          {editingLabel === field.key ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tempLabel}
                onChange={(e) => setTempLabel(e.target.value)}
                className="px-2 py-1 border rounded text-sm"
                autoFocus
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
          ) : (
            <div className="flex items-center gap-2">
              <label className="block text-sm font-medium text-gray-700">
                {label} {field.required && <span className="text-red-500">*</span>}
              </label>
              {isAdmin && (
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditingLabel(field.key);
                      setTempLabel(label);
                    }}
                    className="text-blue-600 hover:text-blue-700 text-xs px-1"
                    title="라벨 편집"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingDescription(true);
                      setTempDescription(description);
                    }}
                    className="text-green-600 hover:text-green-700 text-xs px-1"
                    title="설명 편집"
                  >
                    📝
                  </button>
                  <button
                    onClick={() => handleHideField(field.key)}
                    className="text-red-600 hover:text-red-700 text-xs px-1"
                    title="필드 숨기기"
                  >
                    👁️‍🗨️
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 설명문구 편집 모드 */}
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

        {/* 동적 설명 문구 (Admin이 수정 가능) */}
        <div className="text-sm text-gray-600 mb-3">
          {description}
        </div>

        <div 
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-gray-400 transition-colors"
          onClick={() => !previewMode && imageRef.current?.click()}
        >
          <div className="text-center">
            {formData[field.key] ? (
              <>
                <div className="mb-3">
                  <img 
                    src={formData[field.key].url} 
                    alt="업로드된 이미지" 
                    className="mx-auto max-h-32 rounded"
                  />
                </div>
                <p className="text-sm text-gray-600 mb-2">{formData[field.key].name}</p>
                <div className="text-xs text-gray-500 mb-2">
                  크기: {Math.round(formData[field.key].size / 1024)}KB
                  {formData[field.key].uploadedAt && (
                    <>, 업로드: {new Date(formData[field.key].uploadedAt).toLocaleString()}</>
                  )}
                </div>
                {!previewMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(field.key);
                    }}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    파일 제거
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="mx-auto w-12 h-12 text-gray-400 mb-3">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 48 48">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" />
                  </svg>
                </div>
                <p className="text-sm text-gray-600 mb-1">
                  {previewMode ? '이미지가 업로드되지 않음' : '클릭하여 이미지 업로드'}
                </p>
                {!previewMode && (
                  <>
                    <input
                      ref={imageRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(field.key, e)}
                      className="hidden"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      PNG, JPG, GIF (최대 {Math.round((globalSettings.maxFileSize || 10485760) / 1024 / 1024)}MB)
                    </p>
                  </>
                )}
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

  // 표시되는 필드들만 필터링 및 조건부 필드 적용
  const visibleFields = Object.values(fieldConfig)
    .filter(field => shouldShowField(field))
    .sort((a, b) => {
      const aOrder = fieldOrder.indexOf(a.key);
      const bOrder = fieldOrder.indexOf(b.key);
      if (aOrder === -1 && bOrder === -1) return 0;
      if (aOrder === -1) return 1;
      if (bOrder === -1) return -1;
      return aOrder - bOrder;
    });

  // 숨겨진 필드들
  const hiddenFields = Object.values(fieldConfig).filter(field => !field.visible);

  // 관리자 도구 패널
  const renderAdminPanel = () => (
    isAdmin && (
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">관리자 도구</h3>
          <div className="flex gap-2">
            {unsavedChanges && (
              <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded">
                저장되지 않은 변경사항
              </span>
            )}
            {lastSavedAt && (
              <span className="text-xs text-gray-500">
                마지막 저장: {lastSavedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <button
            onClick={toggleBulkEditMode}
            className={`px-3 py-2 text-xs rounded ${
              bulkEditMode ? 'bg-blue-600 text-white' : 'bg-white border'
            }`}
          >
            {bulkEditMode ? '벌크편집 종료' : '벌크편집 모드'}
          </button>
          
          <button
            onClick={togglePreviewMode}
            className={`px-3 py-2 text-xs rounded ${
              previewMode ? 'bg-green-600 text-white' : 'bg-white border'
            }`}
          >
            {previewMode ? '편집모드' : '미리보기'}
          </button>

          <button
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className="px-3 py-2 text-xs rounded bg-white border hover:bg-gray-50"
          >
            고급옵션
          </button>

          <button
            onClick={createConfigBackup}
            className="px-3 py-2 text-xs rounded bg-white border hover:bg-gray-50"
          >
            백업생성
          </button>
        </div>

        {bulkEditMode && selectedFields.size > 0 && (
          <div className="flex gap-2 mb-4 p-3 bg-blue-50 rounded">
            <span className="text-sm">{selectedFields.size}개 선택됨:</span>
            <button
              onClick={() => executeBulkAction('hide')}
              className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded"
            >
              숨기기
            </button>
            <button
              onClick={() => executeBulkAction('show')}
              className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded"
            >
              보이기
            </button>
            <button
              onClick={() => executeBulkAction('require')}
              className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded"
            >
              필수
            </button>
            <button
              onClick={() => executeBulkAction('optional')}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded"
            >
              선택
            </button>
          </div>
        )}

        {showAdvancedOptions && (
          <div className="mt-4 p-3 bg-white rounded border">
            <h4 className="font-medium mb-3">고급 설정</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">설정 내보내기</label>
                <button
                  onClick={exportConfiguration}
                  className="w-full px-3 py-2 text-xs border rounded hover:bg-gray-50"
                >
                  JSON 내보내기
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">설정 가져오기</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={importConfiguration}
                  className="w-full text-xs"
                />
              </div>
            </div>
            
            {configBackups.length > 0 && (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">백업 복원</label>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {configBackups.map(backup => (
                    <div key={backup.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                      <span>{backup.description}</span>
                      <button
                        onClick={() => restoreConfigBackup(backup.id)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        복원
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {hiddenFields.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">숨겨진 필드</h4>
            <div className="flex flex-wrap gap-2">
              {hiddenFields.map(field => (
                <button
                  key={field.key}
                  onClick={() => handleRestoreField(field.key)}
                  className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  title={`${field.label} 되돌리기`}
                >
                  {field.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  );

  return (
    <div className="max-w-4xl mx-auto p-6">
      {isLoadingSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">설정을 로드하는 중...</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Step 1: 기본 정보 입력</h2>
          
          <div className="flex items-center gap-4">
            {previewMode && (
              <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                미리보기 모드
              </span>
            )}
            
            {isAdmin && Object.keys(fieldStats).length > 0 && (
              <div className="text-xs text-gray-500">
                총 필드: {Object.keys(fieldConfig).length}개 |
                사용 가능: {visibleFields.length}개 |
                숨김: {hiddenFields.length}개
              </div>
            )}
          </div>
        </div>

        {renderAdminPanel()}

        {/* 1열 배치로 변경 - grid-cols-1 고정 */}
        <div className="space-y-6">
          {visibleFields.map(field => {
            // image 필드면 desc까지 함께 전달
            if (field.type === 'image') {
              const descField = visibleFields.find(f => f.key === `${field.key}Desc`);
              return renderImageField(field, descField);
            }
            switch (field.type) {
              case 'text':
                return renderTextField(field);
              case 'select':
                return renderSelectField(field);
              case 'textarea':
                return renderTextareaField(field);
              default:
                return null;
            }
          })}
        </div>

        {visibleFields.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">표시할 필드가 없습니다.</p>
            {isAdmin && hiddenFields.length > 0 && (
              <p className="text-sm text-gray-400">
                관리자 도구에서 숨겨진 필드를 복원할 수 있습니다.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-between items-center mt-8">
          <div className="flex items-center gap-4">
            {isAdmin && (
              <div className="text-xs text-gray-500">
                {unsavedChanges ? (
                  <span className="text-orange-600">변경사항이 자동 저장됩니다</span>
                ) : (
                  <span>모든 변경사항이 저장됨</span>
                )}
              </div>
            )}
          </div>
          
          <button
            onClick={handleSubmit}
            disabled={previewMode}
            className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {previewMode ? '미리보기 모드에서는 제출 불가' : '다음 단계 →'}
          </button>
        </div>
      </div>
    </div>
  );
};

Step1.propTypes = {
  formData: PropTypes.object.isRequired,
  setFormData: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  user: PropTypes.object
};

export default Step1;

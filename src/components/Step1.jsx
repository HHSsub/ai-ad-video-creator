import { useState, useRef, useEffect } from 'react';
import { loadFieldConfig, saveFieldConfig, applyDefaultValues } from '../utils/fieldConfig';

const Step1 = ({ formData, setFormData, onNext, user }) => {
  const [errors, setErrors] = useState({});
  const [fieldConfig, setFieldConfig] = useState({});
  const [editingLabel, setEditingLabel] = useState(null);
  const [tempLabel, setTempLabel] = useState('');
  const imageRef = useRef(null);

  // 관리자 권한 확인
  const isAdmin = user?.role === 'admin';

  // 컴포넌트 마운트 시 필드 설정 로드
  useEffect(() => {
    const config = loadFieldConfig();
    setFieldConfig(config);

    // 숨겨진 필드들의 기본값 적용
    const defaultValues = applyDefaultValues(config);
    if (Object.keys(defaultValues).length > 0) {
      setFormData(prev => ({ ...prev, ...defaultValues }));
    }
  }, []);

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
    if (imageRef.current) {
      imageRef.current.value = '';
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // 표시되는 필수 필드들만 검증
    Object.values(fieldConfig).forEach(field => {
      if (field.visible && field.required) {
        const value = formData[field.key];

        if (field.type === 'text' || field.type === 'textarea') {
          if (!value?.trim()) {
            newErrors[field.key] = `${field.label}을(를) 입력해주세요.`;
          }
        } else if (field.type === 'select') {
          if (!value) {
            newErrors[field.key] = `${field.label}을(를) 선택해주세요.`;
          }
        } else if (field.type === 'image') {
          if (!value) {
            newErrors[field.key] = `${field.label}을(를) 업로드해주세요.`;
          }
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = onNext

  const handleSubmit = () => {
    if (validateForm()) {
      if (handleNext) {
        handleNext();
      } else {
        console.error('next 또는 onNext 함수가 전달되지 않았습니다.');
      }
    }
  };

  // 관리자 기능: 옵션 삭제 (필드 숨김)
  const handleHideField = (fieldKey) => {
    if (!isAdmin) return;

    const newConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        visible: false
      }
    };

    setFieldConfig(newConfig);
    saveFieldConfig(newConfig);

    // 숨겨진 필드에 기본값/랜덤값 적용
    const defaultValues = applyDefaultValues(newConfig);
    if (defaultValues[fieldKey]) {
      setFormData(prev => ({ ...prev, [fieldKey]: defaultValues[fieldKey] }));
    }
  };

  // 관리자 기능: 옵션 되돌리기 (필드 보임)
  const handleRestoreField = (fieldKey) => {
    if (!isAdmin) return;

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

  // 관리자 기능: 라벨 수정 시작
  const startEditLabel = (fieldKey, currentLabel) => {
    if (!isAdmin) return;
    setEditingLabel(fieldKey);
    setTempLabel(currentLabel);
  };

  // 관리자 기능: 라벨 수정 저장
  const saveLabel = (fieldKey) => {
    if (!isAdmin) return;

    const newConfig = {
      ...fieldConfig,
      [fieldKey]: {
        ...fieldConfig[fieldKey],
        label: tempLabel.trim() || fieldConfig[fieldKey].label
      }
    };

    setFieldConfig(newConfig);
    saveFieldConfig(newConfig);
    setEditingLabel(null);
    setTempLabel('');
  };

  // 관리자 기능: 라벨 수정 취소
  const cancelEditLabel = () => {
    setEditingLabel(null);
    setTempLabel('');
  };

  // 필드 렌더링 함수들
  const renderTextField = (field) => (
    <div key={field.key}>
      <div className="flex items-center justify-between mb-2">
        {/* 라벨 (관리자면 편집 가능) */}
        {isAdmin && editingLabel === field.key ? (
          <div className="flex items-center space-x-2 flex-1">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="text-sm font-medium text-gray-700 border border-gray-300 rounded px-2 py-1"
              onKeyPress={(e) => e.key === 'Enter' && saveLabel(field.key)}
              autoFocus
            />
            <button
              onClick={() => saveLabel(field.key)}
              className="text-green-600 hover:text-green-700 text-sm"
            >
              저장
            </button>
            <button
              onClick={cancelEditLabel}
              className="text-gray-500 hover:text-gray-600 text-sm"
            >
              취소
            </button>
          </div>
        ) : (
          <label 
            className={`block text-sm font-medium text-gray-700 ${
              isAdmin ? 'cursor-pointer hover:text-blue-600' : ''
            }`}
            onClick={() => isAdmin && startEditLabel(field.key, field.label)}
          >
            {field.label} {field.required && '*'}
            {isAdmin && (
              <span className="ml-1 text-xs text-blue-500">(클릭하여 수정)</span>
            )}
          </label>
        )}

        {/* 관리자 버튼들 */}
        {isAdmin && editingLabel !== field.key && (
          <div className="flex space-x-1">
            <button
              onClick={() => handleHideField(field.key)}
              className="text-red-600 hover:text-red-700 text-xs px-2 py-1 rounded border border-red-300 hover:bg-red-50"
              title="이 입력 항목 숨기기"
            >
              옵션삭제
            </button>
          </div>
        )}
      </div>

      <input
        type="text"
        value={formData[field.key] || ''}
        onChange={(e) => handleInputChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          errors[field.key] ? 'border-red-500' : 'border-gray-300'
        }`}
      />
      {errors[field.key] && (
        <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
      )}
    </div>
  );

  const renderTextAreaField = (field) => (
    <div key={field.key} className="md:col-span-2">
      <div className="flex items-center justify-between mb-2">
        {/* 라벨 (관리자면 편집 가능) */}
        {isAdmin && editingLabel === field.key ? (
          <div className="flex items-center space-x-2 flex-1">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="text-sm font-medium text-gray-700 border border-gray-300 rounded px-2 py-1"
              onKeyPress={(e) => e.key === 'Enter' && saveLabel(field.key)}
              autoFocus
            />
            <button
              onClick={() => saveLabel(field.key)}
              className="text-green-600 hover:text-green-700 text-sm"
            >
              저장
            </button>
            <button
              onClick={cancelEditLabel}
              className="text-gray-500 hover:text-gray-600 text-sm"
            >
              취소
            </button>
          </div>
        ) : (
          <label 
            className={`block text-sm font-medium text-gray-700 ${
              isAdmin ? 'cursor-pointer hover:text-blue-600' : ''
            }`}
            onClick={() => isAdmin && startEditLabel(field.key, field.label)}
          >
            {field.label} {field.required && '*'}
            {isAdmin && (
              <span className="ml-1 text-xs text-blue-500">(클릭하여 수정)</span>
            )}
          </label>
        )}

        {/* 관리자 버튼들 */}
        {isAdmin && editingLabel !== field.key && (
          <div className="flex space-x-1">
            <button
              onClick={() => handleHideField(field.key)}
              className="text-red-600 hover:text-red-700 text-xs px-2 py-1 rounded border border-red-300 hover:bg-red-50"
              title="이 입력 항목 숨기기"
            >
              옵션삭제
            </button>
          </div>
        )}
      </div>

      <textarea
        value={formData[field.key] || ''}
        onChange={(e) => handleInputChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        rows={3}
        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          errors[field.key] ? 'border-red-500' : 'border-gray-300'
        }`}
      />
      {errors[field.key] && (
        <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
      )}
    </div>
  );

  const renderSelectField = (field) => (
    <div key={field.key}>
      <div className="flex items-center justify-between mb-2">
        {/* 라벨 (관리자면 편집 가능) */}
        {isAdmin && editingLabel === field.key ? (
          <div className="flex items-center space-x-2 flex-1">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="text-sm font-medium text-gray-700 border border-gray-300 rounded px-2 py-1"
              onKeyPress={(e) => e.key === 'Enter' && saveLabel(field.key)}
              autoFocus
            />
            <button
              onClick={() => saveLabel(field.key)}
              className="text-green-600 hover:text-green-700 text-sm"
            >
              저장
            </button>
            <button
              onClick={cancelEditLabel}
              className="text-gray-500 hover:text-gray-600 text-sm"
            >
              취소
            </button>
          </div>
        ) : (
          <label 
            className={`block text-sm font-medium text-gray-700 ${
              isAdmin ? 'cursor-pointer hover:text-blue-600' : ''
            }`}
            onClick={() => isAdmin && startEditLabel(field.key, field.label)}
          >
            {field.label} {field.required && '*'}
            {isAdmin && (
              <span className="ml-1 text-xs text-blue-500">(클릭하여 수정)</span>
            )}
          </label>
        )}

        {/* 관리자 버튼들 */}
        {isAdmin && editingLabel !== field.key && (
          <div className="flex space-x-1">
            <button
              onClick={() => handleHideField(field.key)}
              className="text-red-600 hover:text-red-700 text-xs px-2 py-1 rounded border border-red-300 hover:bg-red-50"
              title="이 입력 항목 숨기기"
            >
              옵션삭제
            </button>
          </div>
        )}
      </div>

      <select
        value={formData[field.key] || ''}
        onChange={(e) => handleInputChange(field.key, e.target.value)}
        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          errors[field.key] ? 'border-red-500' : 'border-gray-300'
        }`}
      >
        <option value="">{field.label} 선택</option>
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

  const renderImageField = (field, descField) => (
    <div key={field.key} className="md:col-span-2">
      <div className="flex items-center justify-between mb-2">
        {/* 라벨 (관리자면 편집 가능) */}
        {isAdmin && editingLabel === field.key ? (
          <div className="flex items-center space-x-2 flex-1">
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              className="text-sm font-medium text-gray-700 border border-gray-300 rounded px-2 py-1"
              onKeyPress={(e) => e.key === 'Enter' && saveLabel(field.key)}
              autoFocus
            />
            <button onClick={() => saveLabel(field.key)} className="text-green-600 hover:text-green-700 text-sm">저장</button>
            <button onClick={cancelEditLabel} className="text-gray-500 hover:text-gray-600 text-sm">취소</button>
          </div>
        ) : (
          <label 
            className={`block text-sm font-medium text-gray-700 ${isAdmin ? 'cursor-pointer hover:text-blue-600' : ''}`}
            onClick={() => isAdmin && startEditLabel(field.key, field.label)}
          >
            {field.label} {field.required && '*'}
            {isAdmin && <span className="ml-1 text-xs text-blue-500">(클릭하여 수정)</span>}
          </label>
        )}
        {/* 관리자 버튼들 */}
        {isAdmin && editingLabel !== field.key && (
          <div className="flex space-x-1">
            <button
              onClick={() => handleHideField(field.key)}
              className="text-red-600 hover:text-red-700 text-xs px-2 py-1 rounded border border-red-300 hover:bg-red-50"
              title="이 입력 항목 숨기기"
            >옵션삭제</button>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
        <div className="space-y-1 text-center">
          {formData[field.key] ? (
            <div className="relative">
              <img
                src={formData[field.key].url}
                alt="이미지 미리보기"
                className="mx-auto h-20 w-auto object-contain"
              />
              <button
                type="button"
                onClick={() => removeFile(field.key)}
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
                <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                  <span>파일 선택</span>
                  <input
                    ref={imageRef}
                    type="file"
                    className="sr-only"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e.target.files[0], field.key)}
                  />
                </label>
                <p className="text-xs text-gray-500">PNG, JPG, GIF (최대 10MB)</p>
              </div>
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

        {/* 관리자 전용 안내 메시지 */}
        {isAdmin && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex">
              <svg className="h-5 w-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">관리자 기능</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>• 필드명 클릭: 라벨 수정</p>
                  <p>• 옵션삭제: 필드 숨기기 (자동으로 기본값/랜덤값 적용)</p>
                  <p>• 숨겨진 필드는 상단에서 복원 가능</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 숨겨진 필드 안내 (일반 사용자용) */}
        {!isAdmin && Object.values(fieldConfig).some(field => !field.visible) && (
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex">
              <svg className="h-5 w-5 text-yellow-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.002 16.5c-.77 0-2.502 1.667-1.732 2.5z" />
              </svg>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  {/* 사용자 안내 메시지 */}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Step1;

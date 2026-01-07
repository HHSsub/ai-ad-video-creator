import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './Step1Manual.css';
import { loadFieldConfig } from '../utils/fieldConfig';
import { forceScrollTop } from '../forceScrollTop';

const Step1Admin = ({ formData, setFormData, user, onPrev, onNext }) => {
    useEffect(() => {
        forceScrollTop();
    }, []);

    const [errors, setErrors] = useState({});

    // Admin mode 설정
    useEffect(() => {
        setFormData(prev => ({
            ...prev,
            mode: 'admin'
        }));
    }, [setFormData]);

    // 필수 옵션값
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

        // Gemini response 검증
        if (!formData.geminiResponse || formData.geminiResponse.trim().length < 10) {
            newErrors.geminiResponse = '최소 10자 이상 입력하세요';
        } else {
            // JSON 파싱 가능 여부 확인
            try {
                JSON.parse(formData.geminiResponse);
            } catch (e) {
                newErrors.geminiResponse = '유효한 JSON 형식이 아닙니다';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
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
                <h1>Admin Mode - Gemini 응답 직접 입력</h1>
                <p>필수 옵션을 선택하고, 외부에서 받은 Gemini 응답을 붙여넣어주세요</p>
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

                {/* 4. 수동 응답 결과 입력 */}
                <div className="form-section">
                    <label className="section-label">
                        4. 수동 응답 결과 입력 *
                        {errors.geminiResponse && <span className="error-text">{errors.geminiResponse}</span>}
                    </label>
                    <div className="natural-language-box">
                        <textarea
                            value={formData.geminiResponse || ''}
                            onChange={(e) => handleChange('geminiResponse', e.target.value)}
                            placeholder="외부에서 받은 Gemini response JSON을 여기에 붙여넣기하세요.

예시:
{
  &quot;styles&quot;: [...],
  &quot;metadata&quot;: {...}
}

JSON 형식이어야 합니다."
                            rows={15}
                        />
                        <div className="char-count">
                            {(formData.geminiResponse || '').length} characters
                        </div>
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
                    <button
                        onClick={onPrev}
                        className="px-6 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                        ← 이전 단계
                    </button>

                    <button
                        className="btn-submit px-8 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-lg transition-all duration-200 font-medium"
                        onClick={handleSubmit}
                    >
                        다음 단계로 →
                    </button>
                </div>
            </div>
        </div>
    );
};

Step1Admin.propTypes = {
    formData: PropTypes.object.isRequired,
    setFormData: PropTypes.func.isRequired,
    user: PropTypes.object.isRequired,
    onPrev: PropTypes.func,
    onNext: PropTypes.func.isRequired
};

export default Step1Admin;

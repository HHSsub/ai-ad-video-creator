import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './Step1Manual.css';
import { loadFieldConfig } from '../utils/fieldConfig';
import { forceScrollTop } from '../forceScrollTop';

const Step1Admin = ({ formData, setFormData, user, onPrev, onNext, userRole = 'viewer' }) => {
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

        // Gemini response 검증 - JSON 파싱 제거, 단순 길이만 체크
        if (!formData.geminiResponse || formData.geminiResponse.trim().length < 10) {
            newErrors.geminiResponse = '최소 10자 이상 입력하세요';
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
                            placeholder={`외부에서 받은 Gemini response를 여기에 붙여넣기하세요.

예시:
🎬 러닝화: 속도와 구름 (by GEMINI-ACD) 기획안

🧠 Section 1. ACD's Strategic Inference (전략 분석)

User Intent: 사용자는 최고의 속도감과 구름같이 부드러운 쿠셔닝을 동시에 제공하는 역동적인 러닝화의 핵심 기능을 시각적으로 매력적이고 에너지 넘치게 전달하고자 합니다. 제품의 성능을 극대화하여 소비자의 구매 욕구를 자극하는 것이 목표입니다.

Genre & Tone: 퍼포먼스 제품 프로모 / 에너지 넘치는, 역동적인, 현대적인, 파워풀한

Target Audience: 활동적인 라이프스타일을 즐기는 20대 후반~40대 러너 및 피트니스 애호가. 성능과 디자인을 중시하며, 러닝 경험의 질을 높이고자 하는 소비자.

Visual Concept: "최고의 속도와 구름같은 쿠셔닝이 조화를 이루며, 러닝의 모든 순간을 한계를 넘어서는 경험으로 이끄는 다이내믹한 여정." (A dynamic journey where ultimate speed and cloud-like cushioning harmonize, leading every running moment beyond limits.)

🎬 Section 2. Cinematic Storyboard (Total 9 Scenes)

### S#1 (0:00-0:02) 새로운 시작

Visual Description: 어두운 배경 속, 스포트라이트를 받으며 빛나는 러닝화 한 켤레가 서서히 화면 중앙으로 줌인된다. 신발의 역동적인 디자인과 소재의 질감이 선명하게 드러나며, 곧 시작될 질주를 암시하는 듯한 에너지가 느껴진다.

\`\`\`json
{
  "prompt": "Dynamic close-up shot of a sleek, modern running shoe in a dark studio setting...",
  "negative_prompt": "text, letters, logo, watermark, low quality...",
  "num_images": 1,
  "image": { "size": "portrait_9_16" },
  "styling": { "style": "product photography, high contrast", "lighting": "dramatic spotlight, cinematic" }
}
\`\`\`

\`\`\`json
{
  "prompt": "Smooth push-in shot, moving from a close-up on the running shoe's toe..."
}
\`\`\`

\`\`\`json
{
  "copy": "모든 한계를 넘어서는 시작"
}
\`\`\`

...이런 형식으로 전체 응답(_Section 2 전체 내용_)을 붙여넣으세요.`}
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
                        className="btn-submit px-8 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-700 disabled:to-gray-800 disabled:text-gray-500 text-white rounded-lg transition-all duration-200 font-medium disabled:cursor-not-allowed"
                        onClick={handleSubmit}
                        disabled={userRole !== 'owner'}
                    >
                        {userRole === 'owner' ? '다음 단계로 →' : '수정 권한 없음 (Owner 전용)'}
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

// src/components/ManualPromptModal.jsx
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function ManualPromptModal({ isOpen, onClose, onSubmit, formData }) {
    const [finalPrompt, setFinalPrompt] = useState('');
    const [geminiResponse, setGeminiResponse] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && formData) {
            setIsLoading(true);
            setError('');

            fetch(`${API_BASE}/api/generate-prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formData })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        setFinalPrompt(data.prompt);
                    } else {
                        setError(data.error || '프롬프트 생성 실패');
                    }
                })
                .catch(err => {
                    setError(`프롬프트 생성 오류: ${err.message}`);
                })
                .finally(() => {
                    setIsLoading(false);
                });
        }
    }, [isOpen, formData]);

    const handleCopy = () => {
        navigator.clipboard.writeText(finalPrompt);
        alert('프롬프트가 클립보드에 복사되었습니다!');
    };

    const handleSubmit = async () => {
        if (!geminiResponse.trim()) {
            setError('Gemini 응답을 입력해주세요.');
            return;
        }

        setError('');
        setIsSubmitting(true);

        try {
            await onSubmit(geminiResponse);
            setGeminiResponse('');
            onClose();
        } catch (e) {
            setError(`제출 실패: ${e.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[10000]">
            <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 w-[90%] h-[90%] flex flex-col">
                {/* 헤더 */}
                <div className="p-6 border-b border-gray-700">
                    <h2 className="text-2xl font-bold text-white">🔧 수동 프롬프트 입력</h2>
                    <p className="text-gray-400 text-sm mt-2">
                        1. 아래 프롬프트를 복사하여 외부 Gemini에 입력 → 2. 응답 결과를 붙여넣기
                    </p>
                </div>

                {/* 본문 */}
                <div className="flex-1 p-6 overflow-hidden flex flex-col gap-4">
                    {/* 상단: 최종 프롬프트 */}
                    <div className="flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold text-white">📄 Gemini에 전송할 프롬프트</h3>
                            <button
                                onClick={handleCopy}
                                disabled={isLoading || !finalPrompt}
                                className="px-4 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                📋 복사
                            </button>
                        </div>
                        <textarea
                            readOnly
                            value={isLoading ? '프롬프트 생성 중...' : finalPrompt}
                            className="flex-1 w-full bg-gray-900 text-gray-300 font-mono text-sm p-4 rounded-lg border border-gray-700 resize-none"
                        />
                    </div>

                    {/* 하단: Gemini 응답 입력 */}
                    <div className="flex-1 flex flex-col">
                        <h3 className="text-lg font-semibold text-white mb-2">📥 Gemini 응답 결과 붙여넣기</h3>
                        <textarea
                            value={geminiResponse}
                            onChange={(e) => setGeminiResponse(e.target.value)}
                            placeholder="Gemini 응답을 여기에 붙여넣으세요..."
                            className="flex-1 w-full bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none resize-none"
                            disabled={isSubmitting}
                        />
                    </div>

                    {error && (
                        <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 rounded-lg text-sm">
                            ❌ {error}
                        </div>
                    )}
                </div>

                {/* 푸터 */}
                <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-6 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !geminiResponse.trim() || isLoading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? '처리 중...' : '제출'}
                    </button>
                </div>
            </div>
        </div>
    );
}

ManualPromptModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    formData: PropTypes.object.isRequired,
};

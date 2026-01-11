import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

// 🔥 API_BASE를 /nexxii로 강제 (프로덕션/로컬 모두 호환)
const API_BASE = '/nexxii';

const Step5 = ({ storyboard, selectedConceptId, onPrev, onComplete, currentProject }) => {
    const [availableMoods, setAvailableMoods] = useState([]);
    const [selectedMood, setSelectedMood] = useState('');
    const [applyingBGM, setApplyingBGM] = useState(false);
    const [finalVideoWithBGM, setFinalVideoWithBGM] = useState(null);
    const [error, setError] = useState(null);
    const [logs, setLogs] = useState([]);

    const styles = storyboard?.styles || [];
    const selectedStyle = styles.find(s => s.concept_id === selectedConceptId || s.conceptId === selectedConceptId);
    const images = selectedStyle?.images || [];

    // 🔥 FIX: finalVideos 배열에서 영상 찾기 - conceptId가 있으면 매칭 (형변환 허용), 없으면 첫번째 영상 사용
    const finalVideo = selectedConceptId
        ? storyboard?.finalVideos?.find(v => String(v.conceptId) === String(selectedConceptId))
        : storyboard?.finalVideos?.[0];

    const log = (msg) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
        console.log(`[Step5] ${msg}`);
    };

    const getVideoSrc = (videoUrl) => {
        if (!videoUrl) return null;
        if (videoUrl.startsWith('http')) return videoUrl;
        if (videoUrl.startsWith('/') && !videoUrl.startsWith('//')) {
            return `${API_BASE}${videoUrl}`;
        }
        return videoUrl;
    };

    useEffect(() => {
        log('Step5 로드 - BGM 적용 단계');
        log(`storyboard.finalVideos: ${storyboard?.finalVideos?.length || 0}개`);
        log(`selectedConceptId: ${selectedConceptId} (type: ${typeof selectedConceptId})`);
        log(`finalVideo: ${finalVideo?.videoUrl || 'null'}`);

        const loadMoods = async () => {
            try {
                const response = await fetch(`${API_BASE}/api/apply-bgm`);
                const result = await response.json();
                if (result.success && result.moods) {
                    setAvailableMoods(result.moods);
                    if (result.moods.length > 0) {
                        setSelectedMood(result.moods[0]);
                    }
                    log(`BGM mood 목록 로드 성공: ${result.moods.length}개`);
                }
            } catch (error) {
                console.error('[Step5] Mood 목록 로드 실패:', error);
                setError('BGM 목록 로드 실패');
            }
        };
        loadMoods();
    }, []);

    const handleApplyBGM = async () => {
        if (!selectedMood) {
            setError('BGM mood를 선택해주세요.');
            return;
        }

        setApplyingBGM(true);
        setError(null);

        try {
            const videoUrl = finalVideo?.videoUrl || images.find(img => img.videoUrl)?.videoUrl;
            if (!videoUrl) {
                throw new Error('영상이 없습니다.');
            }

            log(`BGM 적용 시작 (mood: ${selectedMood}, video: ${videoUrl})`);

            const response = await fetch(`${API_BASE}/api/apply-bgm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoPath: videoUrl,
                    mood: selectedMood,
                    projectId: currentProject?.id, // 🔥 S3 업로드용
                    conceptId: selectedConceptId // 🔥 S3 업로드용
                })
            });

            const result = await response.json();

            if (result.success) {
                setFinalVideoWithBGM(result.mergedVideoPath);
                log(`BGM 적용 성공: ${result.mergedVideoPath}`);
            } else {
                throw new Error(result.error || 'BGM 적용 실패');
            }
        } catch (err) {
            const errorMsg = err.message || 'BGM 적용 중 오류가 발생했습니다.';
            setError(errorMsg);
            log(`❌ 에러: ${errorMsg}`);
        } finally {
            setApplyingBGM(false);
        }
    };

    const handleDownloadWithoutBGM = () => {
        const videoUrl = finalVideo?.videoUrl;
        if (!videoUrl) return;
        const link = document.createElement('a');
        link.href = getVideoSrc(videoUrl);
        link.download = `video_original_${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        log('BGM 없는 원본 영상 다운로드');
    };

    const handleDownloadFinalVideo = () => {
        if (!finalVideoWithBGM) return;
        const link = document.createElement('a');
        link.href = getVideoSrc(finalVideoWithBGM);
        link.download = `video_final_${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        log('BGM 적용된 최종 영상 다운로드');
    };

    const currentVideoUrl = finalVideoWithBGM || finalVideo?.videoUrl;

    return (
        <div className="min-h-screen bg-[#0A0A0B] py-12 px-4">
            <div className="max-w-4xl mx-auto">
                <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700 shadow-2xl">
                    <div className="flex items-center gap-3 mb-8">
                        <span className="text-3xl">🎵</span>
                        <div>
                            <h2 className="text-2xl font-bold text-white">배경음악 및 최종 완성</h2>
                            <p className="text-gray-400">최종 영상에 BGM을 적용하고 다운로드하세요</p>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-900/50 text-red-300 rounded-lg border border-red-700 flex items-center gap-2">
                            <span>⚠️</span>
                            {error}
                        </div>
                    )}

                    {/* 영상 재생 영역 */}
                    <div className="mb-8">
                        <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                            <span>📹</span>
                            현재 영상
                        </label>
                        <div className="aspect-video bg-black rounded-xl overflow-hidden border border-gray-700 relative">
                            {currentVideoUrl ? (
                                <video
                                    src={getVideoSrc(currentVideoUrl)}
                                    className="w-full h-full"
                                    controls
                                    onError={(e) => {
                                        console.error('[Step5] 영상 로드 실패:', currentVideoUrl);
                                    }}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-500">
                                    영상이 없습니다
                                </div>
                            )}
                        </div>
                    </div>

                    {/* BGM 선택 */}
                    {!finalVideoWithBGM && (
                        <div className="mb-8 bg-gray-900/50 rounded-xl p-6 border border-gray-700">
                            <h3 className="text-lg font-semibold text-white mb-4">🎵 배경음악 선택</h3>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    분위기 (Mood)
                                </label>
                                <select
                                    value={selectedMood}
                                    onChange={(e) => setSelectedMood(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                                    disabled={applyingBGM}
                                >
                                    {availableMoods.map(mood => (
                                        <option key={mood} value={mood}>{mood}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-2">
                                    선택한 분위기에 맞는 BGM이 랜덤으로 적용됩니다
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleDownloadWithoutBGM}
                                    disabled={applyingBGM}
                                    className="flex-1 px-6 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                                >
                                    BGM 없이 다운로드
                                </button>
                                <button
                                    onClick={handleApplyBGM}
                                    disabled={applyingBGM || !selectedMood}
                                    className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg transition-colors font-medium disabled:cursor-not-allowed"
                                >
                                    {applyingBGM ? 'BGM 적용 중...' : 'BGM 적용'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 다운로드 */}
                    {finalVideoWithBGM && (
                        <div className="mb-8 bg-green-900/30 rounded-xl p-6 border border-green-700">
                            <h3 className="text-lg font-semibold text-white mb-4">✅ 최종 영상 완성!</h3>
                            <button
                                onClick={handleDownloadFinalVideo}
                                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
                            >
                                📥 다운로드
                            </button>
                        </div>
                    )}

                    {/* 로그 */}
                    <details className="mb-6">
                        <summary className="cursor-pointer font-semibold text-gray-300 hover:text-white">
                            📋 진행 로그
                        </summary>
                        <div className="mt-2 h-32 overflow-auto bg-gray-900 text-green-400 p-3 text-xs font-mono whitespace-pre-wrap rounded-lg border border-gray-700">
                            {logs.length === 0 ? '로그가 없습니다.' : logs.join('\n')}
                        </div>
                    </details>

                    {/* 하단 버튼 */}
                    <div className="flex justify-between items-center pt-6 border-t border-gray-700">
                        <button
                            onClick={onPrev}
                            className="px-6 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
                        >
                            ← 이전 단계
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

Step5.propTypes = {
    storyboard: PropTypes.object,
    selectedConceptId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    onPrev: PropTypes.func.isRequired,
    onComplete: PropTypes.func.isRequired,
    currentProject: PropTypes.object
};

export default Step5;

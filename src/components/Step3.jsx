import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const Step3 = ({
  storyboard,
  selectedConceptId,
  setSelectedConceptId,
  onPrev,
  onNext,
  formData,
  user,
  currentProject
}) => {
  const [selectedId, setSelectedId] = useState(selectedConceptId || null);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);

  // 🔥 v4.1: styles 데이터 소스로 변경
  const styles = storyboard?.styles || [];
  const imageSetMode = storyboard?.imageSetMode || false;

  const log = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
    console.log(`[Step3] ${msg}`);
  };

  // 🔥 v4.1: 이미지 URL 헬퍼
  const getImageSrc = (imageUrl) => {
    if (!imageUrl) return '/placeholder.png';
    if (imageUrl.startsWith('http')) return imageUrl;
    if (imageUrl.startsWith('/') && !imageUrl.startsWith('//')) {
      return `${API_BASE}${imageUrl}`;
    }
    return imageUrl;
  };

  useEffect(() => {
    if (selectedConceptId && !selectedId) {
      setSelectedId(selectedConceptId);
    }
  }, [selectedConceptId, selectedId]);

  // 🔥 v4.1: 컨셉 선택 핸들러
  const handleSelectConcept = (conceptId) => {
    setSelectedId(conceptId);
    setSelectedConceptId(conceptId);
    log(`컨셉 ${conceptId} 선택됨`);
  };

  // 🔥 v4.1: Step4로 이동
  const handleGoToEdit = () => {
    if (!selectedId) {
      setError('편집할 이미지 세트를 선택해주세요.');
      return;
    }
    setSelectedConceptId(selectedId);
    log(`Step4로 이동 - 컨셉 ID: ${selectedId}`);
    onNext();
  };

  const selectedStyle = styles.find(s => s.conceptId === selectedId || s.id === selectedId);

  // 🔥 v4.1: 이미지 세트가 없는 경우
  if (styles.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black">
        <div className="max-w-7xl mx-auto p-6">
          <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-8">
            <h2 className="text-3xl font-bold mb-4 text-white">🖼️ 이미지 세트 선택</h2>
            <div className="bg-yellow-900/30 border border-yellow-800 text-yellow-300 p-6 rounded-lg">
              <p className="font-semibold mb-2">아직 생성된 이미지 세트가 없습니다.</p>
              <p className="text-sm">이전 단계에서 이미지 생성을 완료해주세요.</p>
            </div>
            <div className="mt-6">
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
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black">
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2 text-white">🖼️ 이미지 세트 선택</h2>
            <p className="text-gray-400">원하는 이미지 세트를 선택하고 편집을 시작하세요</p>
            {imageSetMode && (
              <div className="mt-2 text-sm text-blue-400">
                ✨ 이미지 세트 모드 - Step4에서 선택적으로 영상 변환 가능
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-300 p-4 mb-6 rounded-lg">
              <div className="font-semibold">오류</div>
              <div className="text-sm mt-1">{error}</div>
              <button
                onClick={() => setError(null)}
                className="mt-2 text-xs text-red-400 hover:text-red-300"
              >
                닫기
              </button>
            </div>
          )}

          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">📸 생성된 이미지 세트 ({styles.length}개)</h3>
            <div className="grid md:grid-cols-3 gap-6">
              {styles.map((style, idx) => (
                <div
                  key={style.conceptId || style.id || idx}
                  onClick={() => handleSelectConcept(style.conceptId || style.id)}
                  className={`border-2 rounded-xl p-4 cursor-pointer transition-all bg-gray-900/50 ${selectedId === (style.conceptId || style.id)
                      ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                      : 'border-gray-700 hover:border-gray-600'
                    }`}
                >
                  <h4 className="font-semibold text-white mb-2">
                    {style.concept_name || style.conceptName || `컨셉 ${idx + 1}`}
                  </h4>

                  {/* 🔥 v4.1: 이미지 그리드 표시 */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {(style.images || []).slice(0, 4).map((img, imgIdx) => (
                      <div key={imgIdx} className="relative">
                        <img
                          src={getImageSrc(img.imageUrl || img.url)}
                          alt={`Scene ${img.sceneNumber}`}
                          className="w-full aspect-square object-cover rounded-lg border border-gray-600"
                          onError={(e) => {
                            e.target.src = '/placeholder.png';
                          }}
                          loading="lazy"
                        />
                        <span className="absolute top-1 left-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                          #{img.sceneNumber}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs text-gray-400 mb-2">
                    씬 개수: {style.images?.length || 0}개
                  </div>

                  {style.big_idea && (
                    <div className="text-xs text-gray-500 mb-2 line-clamp-2">
                      {style.big_idea}
                    </div>
                  )}

                  {selectedId === (style.conceptId || style.id) && (
                    <div className="mt-2 text-xs text-blue-400 font-medium">
                      ✓ 선택됨
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {selectedStyle && (
            <div className="mb-8 bg-gray-900/50 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">
                ✅ 선택된 이미지 세트: {selectedStyle.concept_name || selectedStyle.conceptName}
              </h3>

              {/* 이미지 전체 미리보기 */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                {(selectedStyle.images || []).map((img, idx) => (
                  <div key={idx} className="relative">
                    <img
                      src={getImageSrc(img.imageUrl || img.url)}
                      alt={`Scene ${img.sceneNumber}`}
                      className="w-full aspect-video object-cover rounded-lg border border-gray-600"
                      onError={(e) => {
                        e.target.src = '/placeholder.png';
                      }}
                    />
                    <span className="absolute top-2 left-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                      씬 #{img.sceneNumber}
                    </span>
                    {img.title && (
                      <div className="mt-1 text-xs text-gray-400 truncate">
                        {img.title}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {selectedStyle.big_idea && (
                <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-white mb-2">💡 Big Idea</h4>
                  <p className="text-sm text-gray-300">{selectedStyle.big_idea}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleGoToEdit}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
                >
                  ✏️ 이미지 편집 및 영상 변환 (Step4)
                </button>
              </div>
            </div>
          )}

          <details className="mb-6">
            <summary className="cursor-pointer font-semibold text-gray-300 hover:text-white">
              📋 진행 로그
            </summary>
            <div className="mt-2 h-32 overflow-auto bg-gray-900 text-green-400 p-3 text-xs font-mono whitespace-pre-wrap rounded-lg border border-gray-700">
              {logs.length === 0 ? '로그가 없습니다.' : logs.join('\n')}
            </div>
          </details>

          <div className="flex justify-between pt-6 border-t border-gray-700">
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
            >
              ← 이전 단계
            </button>
            {!selectedStyle && (
              <div className="text-gray-500 text-sm self-center">
                이미지 세트를 선택해주세요
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

Step3.propTypes = {
  storyboard: PropTypes.shape({
    styles: PropTypes.arrayOf(PropTypes.shape({
      conceptId: PropTypes.number,
      id: PropTypes.number,
      concept_name: PropTypes.string,
      conceptName: PropTypes.string,
      images: PropTypes.array,
      big_idea: PropTypes.string
    })),
    imageSetMode: PropTypes.bool,
    finalVideos: PropTypes.array,
    metadata: PropTypes.object
  }),
  selectedConceptId: PropTypes.number,
  setSelectedConceptId: PropTypes.func.isRequired,
  onPrev: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  formData: PropTypes.object,
  user: PropTypes.object,
  currentProject: PropTypes.object
};

export default Step3;

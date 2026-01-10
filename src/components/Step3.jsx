import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { forceScrollTop } from '../forceScrollTop';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/nexxii';

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
  // 🔥 추가: 이미지 개별 로딩 상태
  const [imageLoadStates, setImageLoadStates] = useState({});
  const [refreshTimestamp, setRefreshTimestamp] = useState(Date.now());

  // 🔥 v4.1: styles 데이터 소스로 변경
  const styles = storyboard?.styles || [];
  const imageSetMode = storyboard?.imageSetMode || false;

  const log = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
    console.log(`[Step3] ${msg}`);
  };

  // 🔥 CRITICAL: storyboard 업데이트 감지 시 이미지 강제 새로고침
  useEffect(() => {
    if (storyboard?.styles && storyboard.styles.length > 0) {
      console.log('[Step3] 🔥 Storyboard 업데이트 감지! 이미지 강제 새로고침');
      setRefreshTimestamp(Date.now());
      setImageLoadStates({}); // 로딩 상태 초기화
    }
  }, [storyboard]);

  // 🔥 v4.1: 이미지 URL 헬퍼 (캐시 방지)
  const getImageSrc = (imageUrl) => {
    if (!imageUrl) return '/placeholder.png';

    // 🔥 캐시 방지: 타임스탬프 쿼리 파라미터 추가
    const separator = imageUrl.includes('?') ? '&' : '?';
    const cacheBuster = `${separator}_t=${refreshTimestamp}`;

    if (imageUrl.startsWith('http')) return imageUrl + cacheBuster;
    if (imageUrl.startsWith('/') && !imageUrl.startsWith('//')) {
      return imageUrl + cacheBuster;
    }
    return imageUrl + cacheBuster;
  };

  const handleImageLoad = (uniqueKey) => {
    setImageLoadStates(prev => ({ ...prev, [uniqueKey]: true }));
  };

  useEffect(() => {
    forceScrollTop();
  }, []);

  useEffect(() => {
    if (selectedConceptId && !selectedId) {
      setSelectedId(selectedConceptId);
    }
  }, [selectedConceptId, selectedId]);

  // 🔥 v4.1: 컨셉 선택 핸들러
  const handleSelectConcept = async (conceptId) => {
    setSelectedId(conceptId);
    setSelectedConceptId(conceptId);
    log(`컨셉 ${conceptId} 선택됨`);

    // 🔥 G-3: 프로젝트에 저장
    if (currentProject?.id) {
      try {
        const response = await fetch(`${API_BASE}/api/projects/${currentProject.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-username': user?.username || 'anonymous'
          },
          body: JSON.stringify({
            selectedConceptId: conceptId,
            lastStep: 3
          })
        });

        if (response.ok) {
          console.log('[Step3] 선택된 컨셉 저장 완료');
        }
      } catch (error) {
        console.error('[Step3] 컨셉 저장 오류:', error);
      }
    }
  };

  // 🔥 v4.1: Step4로 이동
  const handleGoToEdit = async () => {
    if (!selectedId) {
      setError('편집할 컨셉을 선택해주세요.');
      return;
    }
    setSelectedConceptId(selectedId);

    // 🔥 G-3: Step4로 이동 전 저장
    if (currentProject?.id) {
      try {
        await fetch(`${API_BASE}/api/projects/${currentProject.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-username': user?.username || 'anonymous'
          },
          body: JSON.stringify({
            selectedConceptId: selectedId,
            lastStep: 4  // Step4로 이동
          })
        });
      } catch (error) {
        console.error('[Step3] Step4 이동 전 저장 오류:', error);
      }
    }

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
            <h2 className="text-3xl font-bold mb-4 text-white">컨셉 선택</h2>
            <div className="bg-yellow-900/30 border border-yellow-800 text-yellow-300 p-6 rounded-lg">
              <p className="font-semibold mb-2">아직 생성된 컨셉이 없습니다.</p>
              <p className="text-sm">이전 단계에서 컨셉 생성을 완료해주세요.</p>
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
            <h2 className="text-3xl font-bold mb-2 text-white">🖼️ 컨셉 선택</h2>
            <p className="text-gray-400">
              {formData?.mode === 'manual'
                ? '각 씬을 검토하고 수정하세요'
                : '원하는 컨셉을 선택하고 편집해 보세요'}
            </p>
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
            <h3 className="text-lg font-semibold text-white mb-4">📸 컨셉 제안 ({styles.length}개)</h3>
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
                    Concept {idx + 1}
                  </h4>

                  {/* 🔥 v4.1: 이미지 그리드 표시 (개별 로딩 적용) */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {(style.images || []).slice(0, 4).map((img, imgIdx) => {
                      const uniqueKey = `thumb-${style.conceptId || style.id}-${imgIdx}`;
                      return (
                        <div key={imgIdx} className="relative aspect-square">
                          {/* 로딩 스켈레톤 */}
                          {!imageLoadStates[uniqueKey] && (
                            <div className="absolute inset-0 bg-gray-800 animate-pulse rounded-lg z-10 flex items-center justify-center">
                              <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin"></div>
                            </div>
                          )}
                          <img
                            src={getImageSrc(img.imageUrl || img.url)}
                            alt={`Scene ${img.sceneNumber}`}
                            className={`w-full h-full object-cover rounded-lg border border-gray-600 transition-opacity duration-300 ${imageLoadStates[uniqueKey] ? 'opacity-100' : 'opacity-0'
                              }`}
                            onLoad={() => handleImageLoad(uniqueKey)}
                            onError={(e) => {
                              e.target.src = '/placeholder.png';
                              handleImageLoad(uniqueKey); // 에러나도 로딩 완료 처리
                            }}
                            loading="lazy"
                          />
                          <span className="absolute top-1 left-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded z-20">
                            #{img.sceneNumber}
                          </span>
                        </div>
                      );
                    })}
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
                ✅ 선택된 컨셉: Concept {styles.findIndex(s => (s.conceptId || s.id) === (selectedStyle.conceptId || selectedStyle.id)) + 1}
              </h3>

              {/* 이미지 전체 미리보기 (개별 로딩 적용) */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                {(selectedStyle.images || []).map((img, idx) => {
                  const uniqueKey = `preview-${selectedStyle.conceptId || selectedStyle.id}-${idx}`;
                  return (
                    <div key={idx} className="relative aspect-video">
                      {/* 로딩 스켈레톤 */}
                      {!imageLoadStates[uniqueKey] && (
                        <div className="absolute inset-0 bg-gray-800 animate-pulse rounded-lg z-10 flex items-center justify-center">
                          <span className="text-xs text-gray-500">로딩 중...</span>
                        </div>
                      )}
                      <img
                        src={getImageSrc(img.imageUrl || img.url)}
                        alt={`Scene ${img.sceneNumber}`}
                        className={`w-full h-full object-cover rounded-lg border border-gray-600 transition-opacity duration-300 ${imageLoadStates[uniqueKey] ? 'opacity-100' : 'opacity-0'
                          }`}
                        onLoad={() => handleImageLoad(uniqueKey)}
                        onError={(e) => {
                          e.target.src = '/placeholder.png';
                          handleImageLoad(uniqueKey);
                        }}
                      />
                      <span className="absolute top-2 left-2 bg-black/80 text-white text-xs px-2 py-1 rounded z-20">
                        씬 #{img.sceneNumber}
                      </span>
                    </div>
                  );
                })}
              </div>

              {selectedStyle.big_idea && (
                <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-white mb-2">💡 Big Idea</h4>
                  <p className="text-sm text-gray-300">{selectedStyle.big_idea}</p>
                </div>
              )}

            </div>
          )}

          <div className="flex justify-between pt-6 border-t border-gray-700">
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
            >
              ← 이전 단계
            </button>
            {selectedStyle ? (
              <button
                onClick={handleGoToEdit}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
              >
                다음 단계 →
              </button>
            ) : (
              <div className="text-gray-500 text-sm self-center">
                컨셉을 선택해주세요
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

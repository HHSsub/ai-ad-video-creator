import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const ROLE_PERMISSIONS = {
  viewer: { view: true, comment: false, editPrompt: false, regenerate: false, confirm: false, invite: false },
  commenter: { view: true, comment: true, editPrompt: false, regenerate: false, confirm: false, invite: false },
  editor: { view: true, comment: true, editPrompt: true, regenerate: true, confirm: false, invite: false },
  manager: { view: true, comment: true, editPrompt: true, regenerate: true, confirm: true, invite: true },
  owner: { view: true, comment: true, editPrompt: true, regenerate: true, confirm: true, invite: true }
};

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer (보기만)' },
  { value: 'commenter', label: 'Commenter (코멘트)' },
  { value: 'editor', label: 'Editor (편집)' },
  { value: 'manager', label: 'Manager (관리)' }
];

const Step4 = ({
  storyboard,
  selectedConceptId,
  formData,
  onPrev,
  onComplete,
  user,
  currentProject,
  userRole = 'viewer'
}) => {
  const [editingPrompts, setEditingPrompts] = useState({});
  const [localComments, setLocalComments] = useState({});
  const [newComment, setNewComment] = useState({});
  const [regeneratingScenes, setRegeneratingScenes] = useState({});
  const [convertingScenes, setConvertingScenes] = useState({}); // 🔥 E-1: 씬별 영상 변환 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [modifiedScenes, setModifiedScenes] = useState([]);

  // 🔥 E-4: BGM 선택 및 적용 상태
  const [showBGMSelector, setShowBGMSelector] = useState(false);
  const [availableMoods, setAvailableMoods] = useState([]);
  const [selectedMood, setSelectedMood] = useState('');
  const [applyingBGM, setApplyingBGM] = useState(false);
  const [finalVideoWithBGM, setFinalVideoWithBGM] = useState(null);

  // 🔥 추가: 멤버 초대 모달 상태
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState(null);

  const permissions = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS.viewer;

  const styles = storyboard?.styles || [];
  const selectedStyle = styles.find(s => s.concept_id === selectedConceptId || s.conceptId === selectedConceptId);
  const images = selectedStyle?.images || [];

  const finalVideo = storyboard?.finalVideos?.find(v => v.conceptId === selectedConceptId);

  const sortedImages = [...images].sort((a, b) => a.sceneNumber - b.sceneNumber);

  const log = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
    console.log(`[Step4] ${msg}`);
  };

  // 🔥 추가: 이미지 URL 헬퍼
  const getImageSrc = (imageUrl) => {
    if (!imageUrl) return null;
    if (imageUrl.startsWith('http')) return imageUrl;
    if (imageUrl.startsWith('/') && !imageUrl.startsWith('//')) {
      return `${API_BASE}${imageUrl}`;
    }
    return imageUrl;
  };

  // 🔥 추가: 비디오 URL 헬퍼
  const getVideoSrc = (videoUrl) => {
    if (!videoUrl) return null;
    if (videoUrl.startsWith('http')) return videoUrl;
    if (videoUrl.startsWith('/') && !videoUrl.startsWith('//')) {
      return `${API_BASE}${videoUrl}`;
    }
    return videoUrl;
  };

  useEffect(() => {
    log(`Step4 로드 - 컨셉 ID: ${selectedConceptId}, 역할: ${userRole}`);
    log(`씬 개수: ${images.length}, 권한: ${JSON.stringify(permissions)}`);
  }, [selectedConceptId, userRole, images.length]);

  const handlePromptChange = (sceneNumber, field, value) => {
    if (!permissions.editPrompt) {
      setError('프롬프트 수정 권한이 없습니다.');
      return;
    }

    setEditingPrompts(prev => ({
      ...prev,
      [sceneNumber]: {
        ...prev[sceneNumber],
        [field]: value
      }
    }));

    if (!modifiedScenes.includes(sceneNumber)) {
      setModifiedScenes(prev => [...prev, sceneNumber]);
    }
  };

  const getEditedPrompt = (sceneNumber, field, originalValue) => {
    return editingPrompts[sceneNumber]?.[field] ?? originalValue;
  };

  const handleAddComment = (sceneNumber) => {
    if (!permissions.comment) {
      setError('코멘트 작성 권한이 없습니다.');
      return;
    }

    const commentText = newComment[sceneNumber];
    if (!commentText?.trim()) return;

    const comment = {
      id: Date.now(),
      username: user?.username || 'anonymous',
      text: commentText.trim(),
      timestamp: new Date().toISOString()
    };

    setLocalComments(prev => ({
      ...prev,
      [sceneNumber]: [...(prev[sceneNumber] || []), comment]
    }));

    setNewComment(prev => ({ ...prev, [sceneNumber]: '' }));
    log(`씬 ${sceneNumber}에 코멘트 추가: ${comment.text}`);
  };

  const handleRegenerateImage = async (sceneNumber) => {
    if (!permissions.regenerate) {
      setError('이미지 재생성 권한이 없습니다.');
      return;
    }

    const scene = sortedImages.find(img => img.sceneNumber === sceneNumber);
    if (!scene) return;

    const editedPrompt = getEditedPrompt(sceneNumber, 'prompt', scene.prompt);

    setRegeneratingScenes(prev => ({ ...prev, [sceneNumber]: true }));
    setError(null);
    log(`씬 ${sceneNumber} 이미지 재생성 시작...`);

    try {
      // 🔥 수정: API 요청 형식을 storyboard-render-image.js에 맞게 조정
      const response = await fetch(`${API_BASE}/nexxii/api/storyboard-render-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePrompt: {
            prompt: editedPrompt,
            aspect_ratio: formData?.aspectRatioCode || 'widescreen_16_9',
            guidance_scale: 2.5,
            seed: Math.floor(Math.random() * 1000000)
          },
          sceneNumber: sceneNumber,
          conceptId: selectedConceptId
        })
      });

      const result = await response.json();
      console.log(`[Step4] 씬 ${sceneNumber} 이미지 재생성 응답:`, result);

      // 🔥 수정: 응답 필드명 확인 (url 또는 imageUrl)
      if (result.success && (result.url || result.imageUrl)) {
        const newImageUrl = result.url || result.imageUrl;
        scene.imageUrl = newImageUrl;
        scene.prompt = editedPrompt;
        scene.videoUrl = null;
        scene.status = 'image_done';

        if (!modifiedScenes.includes(sceneNumber)) {
          setModifiedScenes(prev => [...prev, sceneNumber]);
        }

        log(`씬 ${sceneNumber} 이미지 재생성 완료: ${newImageUrl}`);
      } else {
        throw new Error(result.message || result.error || '이미지 재생성 실패');
      }
    } catch (err) {
      setError(`씬 ${sceneNumber} 재생성 오류: ${err.message}`);
      log(`씬 ${sceneNumber} 재생성 오류: ${err.message}`);
    } finally {
      setRegeneratingScenes(prev => ({ ...prev, [sceneNumber]: false }));
    }
  };

  // 🔥 E-1: 씬별 영상 변환
  const handleConvertSingleScene = async (sceneNumber) => {
    if (!permissions.regenerate) {
      setError('영상 변환 권한이 없습니다.');
      return;
    }

    const scene = sortedImages.find(img => img.sceneNumber === sceneNumber);
    if (!scene || !scene.imageUrl) {
      setError(`씬 ${sceneNumber}: 이미지가 없습니다.`);
      return;
    }

    setConvertingScenes(prev => ({ ...prev, [sceneNumber]: true }));
    setError(null);
    log(`씬 ${sceneNumber} 영상 변환 시작...`);

    try {
      const response = await fetch(`${API_BASE}/nexxii/api/convert-single-scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: scene.imageUrl,
          sceneNumber: sceneNumber,
          projectId: currentProject?.id,
          conceptId: selectedConceptId,
          duration: 3
        })
      });

      const result = await response.json();
      console.log(`[Step4] 씬 ${sceneNumber} 영상 변환 응답:`, result);

      if (result.success && result.videoUrl) {
        scene.videoUrl = result.videoUrl;
        scene.status = 'video_done';
        log(`씬 ${sceneNumber} 영상 변환 완료: ${result.videoUrl}`);
      } else {
        throw new Error(result.error || '영상 변환 실패');
      }
    } catch (err) {
      setError(`씬 ${sceneNumber} 변환 오류: ${err.message}`);
      log(`씬 ${sceneNumber} 변환 오류: ${err.message}`);
    } finally {
      setConvertingScenes(prev => ({ ...prev, [sceneNumber]: false }));
    }
  };

  // 🔥 E-2: 일괄 영상 변환
  const handleConvertAllScenes = async () => {
    if (!permissions.regenerate) {
      setError('영상 변환 권한이 없습니다.');
      return;
    }

    const scenesToConvert = sortedImages.filter(img => img.imageUrl && !img.videoUrl);

    if (scenesToConvert.length === 0) {
      setError('변환할 씬이 없습니다. (모든 씬이 이미 영상으로 변환되었습니다)');
      return;
    }

    setLoading(true);
    setError(null);
    log(`${scenesToConvert.length}개 씬 일괄 변환 시작...`);

    try {
      for (const scene of scenesToConvert) {
        await handleConvertSingleScene(scene.sceneNumber);
      }
      log('일괄 변환 완료');
    } catch (err) {
      setError(`일괄 변환 오류: ${err.message}`);
      log(`일괄 변환 오류: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateAllVideos = async () => {
    if (!permissions.regenerate) {
      setError('영상 재생성 권한이 없습니다.');
      return;
    }

    if (modifiedScenes.length === 0) {
      setError('수정된 씬이 없습니다.');
      return;
    }

    setLoading(true);
    setError(null);
    log('수정된 씬들의 영상 재생성 시작...');

    try {
      // 수정된 씬들만 재변환
      for (const sceneNumber of modifiedScenes) {
        await handleConvertSingleScene(sceneNumber);
      }

      setModifiedScenes([]);
      log('영상 재생성 완료');
    } catch (err) {
      setError(`영상 재생성 오류: ${err.message}`);
      log(`영상 재생성 오류: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 E-3: 컨펌 완료 (1개 이상 영상 필요)
  const handleConfirmAndComplete = () => {
    if (!permissions.confirm) {
      setError('영상 컨펌 권한이 없습니다.');
      return;
    }

    const videoSceneCount = sortedImages.filter(img => img.videoUrl).length;
    if (videoSceneCount === 0) {
      setError('최소 1개 씬을 영상으로 변환해주세요.');
      return;
    }

    log(`영상 컨펌 완료 (${videoSceneCount}개 씬). Step3으로 이동합니다.`);
    onComplete();
  };

  // 🔥 추가: 멤버 초대 핸들러
  const handleOpenInviteModal = () => {
    if (!permissions.invite) {
      setError('멤버 초대 권한이 없습니다.');
      return;
    }
    setShowInviteModal(true);
    setInviteUsername('');
    setInviteRole('viewer');
    setInviteError(null);
  };

  const handleCloseInviteModal = () => {
    setShowInviteModal(false);
    setInviteUsername('');
    setInviteRole('viewer');
    setInviteError(null);
  };

  const handleInviteMember = async () => {
    if (!inviteUsername.trim()) {
      setInviteError('사용자명을 입력해주세요.');
      return;
    }

    setInviteLoading(true);
    setInviteError(null);

    try {
      const response = await fetch(`${API_BASE}/nexxii/api/projects/${currentProject?.id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          username: inviteUsername.trim(),
          role: inviteRole
        })
      });

      const result = await response.json();
      console.log('[Step4] 멤버 초대 응답:', result);

      if (result.success) {
        log(`멤버 초대 완료: ${inviteUsername} (${inviteRole})`);
        handleCloseInviteModal();
        alert(`${inviteUsername}님을 ${inviteRole} 역할로 초대했습니다.`);
      } else {
        throw new Error(result.error || result.message || '멤버 초대 실패');
      }
    } catch (err) {
      setInviteError(err.message);
      log(`멤버 초대 오류: ${err.message}`);
    } finally {
      setInviteLoading(false);
    }
  };

  if (!selectedStyle) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black">
        <div className="max-w-7xl mx-auto p-6">
          <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-8">
            <h2 className="text-3xl font-bold mb-4 text-white">✏️ 씬별 편집</h2>
            <div className="bg-yellow-900/30 border border-yellow-800 text-yellow-300 p-6 rounded-lg">
              <p className="font-semibold mb-2">선택된 컨셉이 없습니다.</p>
              <p className="text-sm">Step3에서 편집할 영상을 선택해주세요.</p>
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
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-3xl font-bold mb-2 text-white">
                ✏️ 영상 편집 - {selectedStyle.conceptName || selectedStyle.style}
              </h2>
              <p className="text-gray-400">각 씬을 검토하고 수정하세요</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded">
                  역할: {userRole}
                </span>
                <span className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded">
                  씬: {sortedImages.length}개
                </span>
                {modifiedScenes.length > 0 && (
                  <span className="px-2 py-1 bg-yellow-900/50 text-yellow-300 text-xs rounded">
                    수정됨: {modifiedScenes.length}개
                  </span>
                )}
              </div>
            </div>
            {permissions.invite && (
              <button
                onClick={handleOpenInviteModal}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors text-sm"
              >
                👥 멤버 초대
              </button>
            )}
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-300 p-4 mb-6 rounded-lg">
              <div className="font-semibold">오류</div>
              <div className="text-sm mt-1">{error}</div>
              <button onClick={() => setError(null)} className="mt-2 text-xs text-red-400 hover:text-red-300">
                닫기
              </button>
            </div>
          )}

          {finalVideo && (
            <div className="mb-8 bg-gray-900/50 rounded-xl p-4 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-3">📹 현재 최종 영상</h3>
              <div className="aspect-video bg-black rounded-lg overflow-hidden max-w-2xl">
                <video
                  src={getVideoSrc(finalVideo.videoUrl)}
                  className="w-full h-full"
                  controls
                  onError={(e) => {
                    console.error('[Step4] 최종 영상 로드 실패:', finalVideo.videoUrl);
                  }}
                />
              </div>
            </div>
          )}

          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">📋 씬별 스토리보드</h3>
            <div className="space-y-6">
              {sortedImages.map((img) => {
                const isRegenerating = regeneratingScenes[img.sceneNumber];
                const isModified = modifiedScenes.includes(img.sceneNumber);
                const sceneComments = localComments[img.sceneNumber] || [];

                return (
                  <div
                    key={img.sceneNumber}
                    className={`bg-gray-900/50 rounded-xl p-6 border ${isModified ? 'border-yellow-600' : 'border-gray-700'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-semibold text-white">
                        Scene {img.sceneNumber}: {img.title || `씬 ${img.sceneNumber}`}
                      </h4>
                      <div className="flex items-center gap-2">
                        {isModified && (
                          <span className="px-2 py-1 bg-yellow-900/50 text-yellow-300 text-xs rounded">
                            수정됨
                          </span>
                        )}
                        <span className={`px-2 py-1 text-xs rounded ${img.status === 'video_done'
                          ? 'bg-green-900/50 text-green-300'
                          : 'bg-gray-700 text-gray-300'
                          }`}>
                          {img.status === 'video_done' ? '영상 완료' : img.status || '대기중'}
                        </span>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="md:col-span-1">
                        <div className="aspect-square bg-black rounded-lg overflow-hidden mb-2">
                          {img.imageUrl ? (
                            <img
                              src={getImageSrc(img.imageUrl)}
                              alt={`Scene ${img.sceneNumber}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                console.error(`[Step4] 씬 ${img.sceneNumber} 이미지 로드 실패:`, img.imageUrl);
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-500 text-sm">이미지 로드 실패</div>';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500">
                              이미지 없음
                            </div>
                          )}
                        </div>
                        {img.videoUrl && (
                          <video
                            src={getVideoSrc(img.videoUrl)}
                            className="w-full rounded-lg bg-black"
                            controls
                            muted
                            onError={(e) => {
                              console.error(`[Step4] 씬 ${img.sceneNumber} 영상 로드 실패:`, img.videoUrl);
                            }}
                          />
                        )}
                      </div>

                      <div className="md:col-span-1 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-400 mb-1">
                            📝 카피
                          </label>
                          <div className="p-3 bg-gray-800 rounded-lg text-white text-sm">
                            {img.copy || '(카피 없음)'}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-400 mb-1">
                            🔧 이미지 프롬프트
                            {!permissions.editPrompt && (
                              <span className="ml-2 text-xs text-gray-500">(읽기 전용)</span>
                            )}
                          </label>
                          <textarea
                            value={getEditedPrompt(img.sceneNumber, 'prompt', img.prompt || '')}
                            onChange={(e) => handlePromptChange(img.sceneNumber, 'prompt', e.target.value)}
                            disabled={!permissions.editPrompt || isRegenerating}
                            className="w-full h-24 p-3 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm resize-none focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="이미지 프롬프트..."
                          />
                          <div className="space-y-3">
                            {permissions.editPrompt && (
                              <button
                                onClick={() => handleRegenerateImage(img.sceneNumber)}
                                disabled={isRegenerating}
                                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg transition-colors text-sm"
                              >
                                {isRegenerating ? '이미지 생성 중...' : '🔄 이미지 재생성'}
                              </button>
                            )}

                            {/* 🔥 E-1: 씬별 영상 변환 버튼 */}
                            {permissions.regenerate && img.imageUrl && (
                              <button
                                onClick={() => handleConvertSingleScene(img.sceneNumber)}
                                disabled={convertingScenes[img.sceneNumber]}
                                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg transition-colors text-sm"
                              >
                                {convertingScenes[img.sceneNumber] ? '영상 변환 중...' :
                                  img.videoUrl ? '🎬 영상 재변환' : '🎬 영상 변환'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                          💬 코멘트 ({sceneComments.length})
                        </label>
                        <div className="h-40 overflow-y-auto bg-gray-800 rounded-lg p-3 mb-2 border border-gray-700">
                          {sceneComments.length === 0 ? (
                            <div className="text-gray-500 text-sm">코멘트가 없습니다.</div>
                          ) : (
                            <div className="space-y-2">
                              {sceneComments.map((comment) => (
                                <div key={comment.id} className="text-sm">
                                  <span className="text-blue-400">@{comment.username}</span>
                                  <span className="text-gray-500 ml-2 text-xs">
                                    {new Date(comment.timestamp).toLocaleString()}
                                  </span>
                                  <p className="text-gray-300 mt-1">{comment.text}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {permissions.comment && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newComment[img.sceneNumber] || ''}
                              onChange={(e) => setNewComment(prev => ({
                                ...prev,
                                [img.sceneNumber]: e.target.value
                              }))}
                              onKeyPress={(e) => e.key === 'Enter' && handleAddComment(img.sceneNumber)}
                              placeholder="코멘트 입력..."
                              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                            />
                            <button
                              onClick={() => handleAddComment(img.sceneNumber)}
                              className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors text-sm"
                            >
                              추가
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <details className="mb-6">
            <summary className="cursor-pointer font-semibold text-gray-300 hover:text-white">
              📋 진행 로그
            </summary>
            <div className="mt-2 h-32 overflow-auto bg-gray-900 text-green-400 p-3 text-xs font-mono whitespace-pre-wrap rounded-lg border border-gray-700">
              {logs.length === 0 ? '로그가 없습니다.' : logs.join('\n')}
            </div>
          </details>

          {/* 🔥 E-2: 일괄 영상 변환 버튼 */}
          <div className="mb-6 flex gap-3">
            {permissions.regenerate && (
              <button
                onClick={handleConvertAllScenes}
                disabled={loading || sortedImages.filter(img => img.imageUrl && !img.videoUrl).length === 0}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg transition-colors font-medium disabled:cursor-not-allowed"
              >
                {loading ? '변환 중...' : `🎬 모든 씬 영상 변환 (${sortedImages.filter(img => img.imageUrl && !img.videoUrl).length}개)`}
              </button>
            )}

            {modifiedScenes.length > 0 && permissions.regenerate && (
              <button
                onClick={handleRegenerateAllVideos}
                disabled={loading}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white rounded-lg transition-colors font-medium disabled:cursor-not-allowed"
              >
                {loading ? '재생성 중...' : `🔄 수정된 씬 재생성 (${modifiedScenes.length}개)`}
              </button>
            )}
          </div>

          {/* 🔥 E-3: 컨펌 완료 버튼 (1개 이상 영상 필요) */}
          <div className="flex justify-between items-center pt-6 border-t border-gray-700">
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
            >
              ← 이전 단계
            </button>

            {permissions.confirm && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">
                  영상 변환: {sortedImages.filter(img => img.videoUrl).length}/{sortedImages.length}개
                </span>
                <button
                  onClick={handleConfirmAndComplete}
                  disabled={sortedImages.filter(img => img.videoUrl).length === 0}
                  className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg transition-colors font-medium disabled:cursor-not-allowed"
                  title={sortedImages.filter(img => img.videoUrl).length === 0 ? '최소 1개 씬을 영상으로 변환해주세요' : ''}
                >
                  ✅ 컨펌 완료
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 🔥 추가: 멤버 초대 모달 */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">👥 멤버 초대</h3>

            {inviteError && (
              <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 mb-4 rounded-lg text-sm">
                {inviteError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  사용자명 (계정 ID)
                </label>
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="예: guest, test1"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                  disabled={inviteLoading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  시스템에 등록된 사용자만 초대할 수 있습니다.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  역할 선택
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                  disabled={inviteLoading}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseInviteModal}
                className="flex-1 px-4 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                disabled={inviteLoading}
              >
                취소
              </button>
              <button
                onClick={handleInviteMember}
                disabled={inviteLoading || !inviteUsername.trim()}
                className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {inviteLoading ? '초대 중...' : '초대하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 E-4: BGM 선택 모달 */}
      {showBGMSelector && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md border border-gray-700">
            <h3 className="text-2xl font-bold text-white mb-4">🎵 배경음악 선택</h3>
            <p className="text-gray-400 mb-6">최종 영상에 적용할 BGM의 분위기를 선택하세요</p>

            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 mb-4 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                분위기 (Mood)
              </label>
              <select
                value={selectedMood}
                onChange={(e) => setSelectedMood(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
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
                onClick={handleSkipBGM}
                disabled={applyingBGM}
                className="flex-1 px-6 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                BGM 없이 완료
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
        </div>
      )}

      {/* 🔥 E-5: 최종 영상 다운로드 UI */}
      {finalVideoWithBGM && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-2xl border border-gray-700">
            <h3 className="text-2xl font-bold text-white mb-4">✅ 최종 영상 완성!</h3>
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
              <video src={getVideoSrc(finalVideoWithBGM)} controls className="w-full h-full" />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDownloadFinalVideo}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
              >
                📥 다운로드
              </button>
              <button
                onClick={() => {
                  setFinalVideoWithBGM(null);
                  onComplete();
                }}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-medium"
              >
                ✅ 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

Step4.propTypes = {
  storyboard: PropTypes.shape({
    styles: PropTypes.arrayOf(PropTypes.shape({
      concept_id: PropTypes.number,
      conceptId: PropTypes.number,
      conceptName: PropTypes.string,
      style: PropTypes.string,
      images: PropTypes.arrayOf(PropTypes.shape({
        sceneNumber: PropTypes.number.isRequired,
        imageUrl: PropTypes.string,
        videoUrl: PropTypes.string,
        title: PropTypes.string,
        prompt: PropTypes.string,
        motionPrompt: PropTypes.object,
        copy: PropTypes.string,
        status: PropTypes.string
      }))
    })),
    finalVideos: PropTypes.array,
    metadata: PropTypes.object
  }),
  selectedConceptId: PropTypes.number,
  formData: PropTypes.object,
  onPrev: PropTypes.func.isRequired,
  onComplete: PropTypes.func.isRequired,
  user: PropTypes.object,
  currentProject: PropTypes.object,
  userRole: PropTypes.oneOf(['viewer', 'commenter', 'editor', 'manager', 'owner'])
};

export default Step4;

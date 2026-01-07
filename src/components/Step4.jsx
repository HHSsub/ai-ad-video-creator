import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { forceScrollTop } from '../forceScrollTop';

// 🔥 API_BASE를 /nexxii로 강제 (프로덕션/로컬 모두 호환)
const API_BASE = '/nexxii';

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

  // 🔥 추가: 멤버 초대 모달 상태
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState(null);

  // 🔥 인물 합성 관련 상태
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({ top: 0, left: 0 }); // Pos State
  const [targetSceneNumber, setTargetSceneNumber] = useState(null);
  const [featurePeople, setFeaturePeople] = useState([]);
  const [filteredPeople, setFilteredPeople] = useState([]);
  const [visiblePeopleCount, setVisiblePeopleCount] = useState(4); // Pagination State
  const [personFilters, setPersonFilters] = useState({
    age: [],
    gender: [],
    nationality: []
  });
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [synthesisLoading, setSynthesisLoading] = useState(false);

  const [imageLoadStates, setImageLoadStates] = useState({});
  // 🔥 Reference Video Recommendation State
  const [recommendedVideo, setRecommendedVideo] = useState(null);

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
      return imageUrl;
    }
    return imageUrl;
  };

  // 🔥 추가: 비디오 URL 헬퍼
  const getVideoSrc = (videoUrl) => {
    if (!videoUrl) return null;
    if (videoUrl.startsWith('http')) return videoUrl;
    if (videoUrl.startsWith('/') && !videoUrl.startsWith('//')) {
      return videoUrl; // 이미 절대 경로(또는 /nexxii 포함)라면 그대로 반환
    }
    return videoUrl;
  };

  useEffect(() => {
    forceScrollTop();
  }, []);

  useEffect(() => {
    log(`Step4 로드 - 컨셉 ID: ${selectedConceptId}, 역할: ${userRole}`);
    log(`씬 개수: ${images.length}, 권한: ${JSON.stringify(permissions)}`);
  }, [selectedConceptId, userRole, images.length]);

  const handleImageLoad = (sceneNumber) => {
    setImageLoadStates(prev => ({ ...prev, [sceneNumber]: true }));
  };

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

    setModifiedScenes(prev => {
      if (prev.includes(sceneNumber)) return prev;
      return [...prev, sceneNumber];
    });
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
      // 🔥 수정: API 요청 형식을 storyboard-render-image.js에 맞게 조정 (경로 수정)
      const response = await fetch(`${API_BASE}/api/storyboard-render-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          imagePrompt: {
            prompt: editedPrompt,
            aspect_ratio: formData?.aspectRatioCode || 'widescreen_16_9',
            guidance_scale: 2.5,
            seed: Math.floor(Math.random() * 1000000)
          },
          sceneNumber: sceneNumber,
          conceptId: selectedConceptId,
          projectId: currentProject?.id || null // 🔥 projectId 추가
        })
      });

      const result = await response.json();
      console.log(`[Step4] 씬 ${sceneNumber} 이미지 재생성 응답:`, result);

      // 🔥 수정: 응답 필드명 확인 (url 또는 imageUrl)
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

        // 🔥 중요: 변경된 스토리보드를 프로젝트에 저장 (영구 반영)
        try {
          // storyboard 객체는 참조로 수정되었으므로 그대로 사용
          await fetch(`${API_BASE}/api/projects/${currentProject?.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'x-username': user?.username || 'anonymous'
            },
            body: JSON.stringify({
              storyboard: storyboard, // 참조된 전체 스토리보드 저장
              formData: formData
            })
          });
          log('프로젝트 데이터 저장 완료 (URL 갱신)');
        } catch (saveErr) {
          console.error('프로젝트 저장 실패:', saveErr);
          log('⚠️ 프로젝트 저장 실패 (새로고침 시 유실될 수 있음)');
        }

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
      const response = await fetch(`${API_BASE}/api/convert-single-scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: scene.imageUrl,
          sceneNumber: sceneNumber,
          projectId: currentProject?.id,
          conceptId: selectedConceptId,
          prompt: scene.prompt, // 🔥 AI Video Prompt
          motionPrompt: scene.motionPrompt, // 🔥 Detailed Motion Guide
          // 🔥 Auto vs Manual Duration Logic
          // If scene has specific duration (Manual), use it. Else calculate average (Auto).
          duration: scene.duration ? scene.duration : (Math.round(formData.videoLength / sortedImages.length) || 5)
        })
      });

      const result = await response.json();
      console.log(`[Step4] 씬 ${sceneNumber} 영상 변환 응답:`, result);

      // 🔥 Async Polling Logic
      if (result.processing && result.taskId) {
        log(`씬 ${sceneNumber} 영상 생성 중... (Polling 시작)`);

        const POLLING_INTERVAL = 3000;
        const pollStatus = async () => {
          try {
            const statusRes = await fetch(`${API_BASE}/api/check-video-status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: result.taskId,
                sceneNumber,
                targetDuration: result.targetDuration, // Pass target for trimming
                projectId: currentProject?.id,
                conceptId: selectedConceptId
              })
            });
            const statusData = await statusRes.json();

            if (statusData.status === 'completed' && statusData.videoUrl) {
              // Success
              scene.videoUrl = statusData.videoUrl;
              scene.status = 'video_done';
              log(`씬 ${sceneNumber} 영상 변환 완료: ${statusData.videoUrl}`);
              setConvertingScenes(prev => ({ ...prev, [sceneNumber]: false }));
              setModifiedScenes(prev => [...prev, sceneNumber]);

              // 🔥 중요: Async Polling 완료 후 즉시 저장 (유실 방지)
              try {
                await fetch(`${API_BASE}/api/projects/${currentProject?.id}`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-username': user?.username || 'anonymous'
                  },
                  body: JSON.stringify({
                    storyboard: storyboard, // Updated storyboard with videoUrl
                    formData: formData
                  })
                });
                log(`씬 ${sceneNumber} 변환 결과 저장 완료`);
              } catch (saveErr) {
                console.error('프로젝트 저장 실패:', saveErr);
                log('⚠️ 프로젝트 저장 실패 (새로고침 시 유실될 수 있음)');
              }
            } else if (statusData.status === 'processing') {
              // Continue Polling
              setTimeout(pollStatus, POLLING_INTERVAL);
            } else {
              // Failed
              throw new Error(statusData.error || 'Generation failed');
            }
          } catch (pollErr) {
            console.error(`[Step4] Polling Error:`, pollErr);
            setError(`씬 ${sceneNumber} Polling 실패: ${pollErr.message}`);
            setConvertingScenes(prev => ({ ...prev, [sceneNumber]: false }));
          }
        };

        pollStatus(); // Start Polling
        return; // Exit main flow, polling handles the rest
      }

      if (result.success && result.videoUrl) {
        scene.videoUrl = result.videoUrl;
        scene.status = 'video_done';
        log(`씬 ${sceneNumber} 영상 변환 완료: ${result.videoUrl}`);

        // 🔥 중요: 영상 변환 즉시 프로젝트 저장 (새로고침 시 방지)
        try {
          await fetch(`${API_BASE}/api/projects/${currentProject?.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'x-username': user?.username || 'anonymous'
            },
            body: JSON.stringify({
              storyboard: storyboard, // 참조된 전체 스토리보드 저장
              formData: formData
            })
          });
          log('프로젝트 영상 데이터 저장 완료');
        } catch (saveErr) {
          console.error('프로젝트 저장 실패:', saveErr);
          log('⚠️ 프로젝트 저장 실패 (새로고침 시 유실될 수 있음)');
        }

      } else {
        throw new Error(result.error || '영상 변환 실패');
      }
    } catch (err) {
      setError(`씬 ${sceneNumber} 변환 오류: ${err.message}`);
      log(`씬 ${sceneNumber} 변환 오류: ${err.message}`);
      setConvertingScenes(prev => ({ ...prev, [sceneNumber]: false }));
    }
    // 🔥 Finally 제거: Polling 시에는 상태를 유지해야 함.
    // Polling 흐름에서는 내부적으로 false 처리함.
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

      // 🔥 일괄 변환 후 최종 저장
      await fetch(`${API_BASE}/api/projects/${currentProject?.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          storyboard: storyboard,
          formData: formData
        })
      });

      log('일괄 변환 완료 및 저장됨');
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

  // 🔥 E-3: 컨펌 완료 (영상 합치기 및 저장)
  const handleConfirmAndComplete = async () => {
    if (!permissions.confirm) {
      setError('영상 컨펌 권한이 없습니다.');
      return;
    }

    const videoScenes = sortedImages.filter(img => img.videoUrl);
    if (videoScenes.length === 0) {
      setError('최소 1개 씬을 영상으로 변환해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    log('최종 영상 합치기(Compile) 시작...');

    try {
      // 1. 영상 합치기 요청
      // 씬당 3초라고 가정하고 총 길이 계산 (또는 duration 필드 사용)
      const totalDuration = videoScenes.length * 3;

      const compileResponse = await fetch(`${API_BASE}/api/compile-videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          projectId: currentProject?.id,
          concept: selectedConceptId,
          segments: videoScenes.map(img => ({
            videoUrl: img.videoUrl,
            sceneNumber: img.sceneNumber
          })),
          jsonMode: true,
          mode: 'manual', // 🔥 Manual 모드: 제공된 세그먼트만 사용
          videoLength: totalDuration, // 총 길이 전달 (3초 * 개수)
          formData: formData
        })
      });

      const compileResult = await compileResponse.json();
      console.log('[Step4] 영상 합치기 결과:', compileResult);

      if (!compileResult.success || !compileResult.compiledVideoUrl) {
        throw new Error(compileResult.error || '영상 합치기 실패');
      }

      const finalVideoUrl = compileResult.compiledVideoUrl;
      log(`영상 합치기 성공: ${finalVideoUrl}`);

      // 2. 스토리보드에 finalVideo 업데이트
      // 기존 finalVideos 배열에서 현재 컨셉 제거 후 새로 추가
      const otherFinalVideos = (storyboard.finalVideos || []).filter(v => v.conceptId !== selectedConceptId);
      storyboard.finalVideos = [
        ...otherFinalVideos,
        {
          conceptId: selectedConceptId,
          videoUrl: finalVideoUrl,
          createdAt: new Date().toISOString()
        }
      ];

      // 3. 프로젝트 저장 (영구 반영)
      await fetch(`${API_BASE}/api/projects/${currentProject?.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          storyboard: storyboard, // 업데이트된 스토리보드 저장
          formData: formData
        })
      });

      log('프로젝트 최종 저장 완료. Step5로 이동합니다.');
      // 🔥 수정: 변경된 storyboard를 상위 컴포넌트로 전달
      onComplete(storyboard);

    } catch (err) {
      console.error('컨펌 처리 중 오류:', err);
      setError(`컨펌 처리 실패: ${err.message}`);
      log(`컨펌 처리 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
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
      const response = await fetch(`${API_BASE}/api/projects/${currentProject?.id}/members`, {
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

  // 🔥 인물 목록 불러오기
  const fetchFeaturePeople = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/persons`);
      const data = await res.json();
      if (data.success) {
        setFeaturePeople(data.persons);
        setFilteredPeople(data.persons); // 초기엔 전체 표시
      }
    } catch (err) {
      console.error('인물 목록 로드 실패:', err);
    }
  };

  // 🔥 모달 열기 (위치 계산: 버튼 중앙 정렬 - User Requested)
  const handleOpenPersonModal = (sceneNumber, e) => {
    e.preventDefault();
    e.stopPropagation();

    // 1. 버튼 위치 및 크기
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollY = window.scrollY;

    const modalWidth = 550;
    const modalHeight = 600;

    // 2. 정확히 버튼 중앙에 모달 중앙을 위치시킴 (Viewport 기준)
    let left = rect.left + (rect.width / 2) - (modalWidth / 2);
    let top = rect.top + (rect.height / 2) - (modalHeight / 2);

    // 4. 화면 밖으로 나가는 것 방지 (Viewport Constraints)
    // 왼쪽 확인
    if (left < 20) left = 20;

    // 오른쪽 확인
    if (left + modalWidth > window.innerWidth - 20) {
      left = window.innerWidth - modalWidth - 20;
    }
    // 위쪽 확인
    if (top < 20) top = 20;
    // 아래쪽 확인
    if (top + modalHeight > window.innerHeight - 20) {
      top = window.innerHeight - modalHeight - 20;
    }

    console.log('[handleOpenPersonModal] Clicked Button Rect:', rect);
    console.log('[handleOpenPersonModal] Calculated Position:', { top, left, scrollY: window.scrollY });

    setModalPosition({ top, left });
    setTargetSceneNumber(sceneNumber);
    setShowPersonModal(true);
    setVisiblePeopleCount(4);

    if (featurePeople.length === 0) {
      fetchFeaturePeople();
    }
  };

  // 🔥 필터 변경 처리
  const handleFilterChange = (category, value) => {
    setPersonFilters(prev => {
      const newFilters = { ...prev };
      if (newFilters[category].includes(value)) {
        newFilters[category] = newFilters[category].filter(item => item !== value);
      } else {
        newFilters[category] = [...newFilters[category], value];
      }
      return newFilters;
    });
  };

  // 🔥 필터 적용 (Effect)
  useEffect(() => {
    if (featurePeople.length === 0) return;

    let result = featurePeople;

    if (personFilters.age.length > 0) {
      result = result.filter(p => personFilters.age.includes(p.age));
    }
    if (personFilters.gender.length > 0) {
      result = result.filter(p => personFilters.gender.includes(p.gender));
    }
    if (personFilters.nationality.length > 0) {
      result = result.filter(p => personFilters.nationality.includes(p.nationality));
    }

    setFilteredPeople(result);
  }, [personFilters, featurePeople]);

  // 🔥 Task AA: 참고 영상 추천 가져오기 (Missing Logic Restored)
  useEffect(() => {
    const fetchRecommendation = async () => {
      try {
        // Correct field name: videoPurpose (NOT productService!)
        // Value: 'product' or 'service' (from fieldConfig.js)
        let conceptType = 'product'; // Default
        if (formData?.videoPurpose) {
          conceptType = formData.videoPurpose; // Already 'product' or 'service'
        } else if (storyboard?.formData?.videoPurpose) {
          conceptType = storyboard.formData.videoPurpose;
        }

        console.log(`[Step4] Fetching recommendation with conceptType=${conceptType}`);

        const res = await fetch(`${API_BASE}/api/recommend-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conceptType })
        });

        const data = await res.json();

        if (data.success && data.video) {
          setRecommendedVideo(data.video);
          console.log('[Step4] Recommendation loaded:', data.video);
        } else {
          console.log('[Step4] No recommendation returned');
        }
      } catch (err) {
        console.error('[Step4] Recommendation fetch failed:', err);
      }
    };

    // Execute if videoPurpose exists in formData or storyboard
    if (formData?.videoPurpose || storyboard?.formData?.videoPurpose) {
      console.log('[Step4] Fetching recommendation...');
      fetchRecommendation();
    } else {
      console.log('[Step4] Skipping recommendation: No videoPurpose found', { formData, storyboard });
    }
  }, [formData?.videoPurpose, storyboard?.formData?.videoPurpose]);



  // 🔥 합성 실행
  const handleSynthesizePerson = async () => {
    if (!selectedPerson || !targetSceneNumber) return;

    const scene = sortedImages.find(img => img.sceneNumber === targetSceneNumber);
    if (!scene) return;

    setSynthesisLoading(true);
    log(`씬 ${targetSceneNumber} 인물 합성 시작 (${selectedPerson.name})...`);

    try {
      const response = await fetch(`${API_BASE}/api/synthesis-person`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sceneImage: scene.imageUrl || '',
          personImage: selectedPerson.url,
          personMetadata: {
            age: selectedPerson.age,
            gender: selectedPerson.gender,
            nationality: selectedPerson.nationality,
            name: selectedPerson.name
          },
          sceneContext: scene.prompt || scene.copy,
          projectId: currentProject?.id,
          aspectRatio: formData?.aspectRatioCode // 🔥 Pass Aspect Ratio
        })
      });

      const result = await response.json();

      if (result.success) {
        // 성공 시 이미지 교체
        scene.imageUrl = result.imageUrl; // S3 URL
        scene.videoUrl = null; // 영상 초기화
        scene.status = 'image_synthesized';
        scene.prompt = scene.prompt || scene.copy; // Context update

        if (!modifiedScenes.includes(targetSceneNumber)) {
          setModifiedScenes(prev => [...prev, targetSceneNumber]);
        }

        log(`씬 ${targetSceneNumber} 인물 합성 완료: ${result.imageUrl}`);
        setShowPersonModal(false);
        setSelectedPerson(null);

        // 프로젝트 저장
        await fetch(`${API_BASE}/api/projects/${currentProject?.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-username': user?.username || 'anonymous' },
          body: JSON.stringify({ storyboard, formData })
        });

      } else {
        throw new Error(result.error || '합성 실패');
      }
    } catch (err) {
      log(`합성 오류: ${err.message}`);
      alert(`합성 실패: ${err.message}`);
    } finally {
      setSynthesisLoading(false);
    }
  };

  // 🔥 필터 옵션 추출 (Unique Values)
  const uniqueAges = [...new Set(featurePeople.map(p => p.age))].filter(Boolean).sort();
  const uniqueGenders = [...new Set(featurePeople.map(p => p.gender))].filter(Boolean).sort();
  const uniqueNationalities = [...new Set(featurePeople.map(p => p.nationality))].filter(Boolean).sort();



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
            <div className="flex items-center gap-4 mb-4">
              <h3 className="text-lg font-semibold text-white">📋 씬별 스토리보드</h3>
            </div>
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
                        <div className="aspect-square bg-black rounded-lg overflow-hidden mb-2 relative group">
                          {/* 🔥 로딩 스켈레톤 (이미지 로드 전 표시) */}
                          {!imageLoadStates[img.sceneNumber] && img.imageUrl && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 animate-pulse z-10">
                              <div className="w-8 h-8 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin mb-2"></div>
                              <span className="text-gray-400 text-xs">이미지 로딩 중...</span>
                            </div>
                          )}

                          {img.imageUrl ? (
                            <img
                              src={getImageSrc(img.imageUrl)}
                              alt={`Scene ${img.sceneNumber}`}
                              className={`w-full h-full object-cover transition-opacity duration-500 ${imageLoadStates[img.sceneNumber] ? 'opacity-100' : 'opacity-0'
                                }`}
                              onLoad={() => handleImageLoad(img.sceneNumber)}
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
                            🔒 기존 프롬프트
                          </label>
                          <textarea
                            value={img.prompt || ''}
                            readOnly
                            disabled
                            className="w-full h-20 p-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-400 text-sm resize-none mb-3"
                          />

                          <label className="block text-sm font-medium text-gray-400 mb-1">
                            ✏️ 프롬프트 수정
                          </label>
                          <textarea
                            value={getEditedPrompt(img.sceneNumber, 'prompt', img.prompt || '')}
                            onChange={(e) => handlePromptChange(img.sceneNumber, 'prompt', e.target.value)}
                            disabled={!permissions.editPrompt || isRegenerating}
                            className="w-full h-24 p-3 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm resize-none focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed mb-2"
                            placeholder="수정할 프롬프트를 입력하세요..."
                          />
                          <div className="space-y-3">
                            {permissions.editPrompt && (
                              <button
                                onClick={() => handleRegenerateImage(img.sceneNumber)}
                                disabled={isRegenerating}
                                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg transition-colors text-sm"
                              >
                                {isRegenerating ? '이미지 생성 중...' : '🔄 이미지 재생성 (새로운 변형)'}
                              </button>
                            )}

                            {/* 🔥 인물 합성 버튼 추가 (이벤트 전달) */}
                            {permissions.editPrompt && (
                              <button
                                onClick={(e) => handleOpenPersonModal(img.sceneNumber, e)}
                                disabled={loading || isRegenerating}
                                className="w-full px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:bg-gray-600 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                              >
                                <span>👤</span> 이미지 합성(인물/제품/로고)
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
              ✂️ 편집 포인트 제안
            </summary>
            <div className="mt-2 bg-gray-900 p-4 rounded-lg border border-gray-700">
              {/* 🔥 참고 영상 추천 */}
              {recommendedVideo && (
                <div className="mb-4 bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-blue-700/50 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-blue-300 mb-2">🎬 참고 영상 추천</h4>
                  <a
                    href={recommendedVideo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-white hover:text-blue-300 font-medium mb-2 transition-colors"
                  >
                    {recommendedVideo.title}
                  </a>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>👁️ {recommendedVideo.views?.toLocaleString() || 'N/A'} 조회</span>
                    <span>⏱️ {recommendedVideo.duration}</span>
                  </div>
                </div>
              )}

              {/* 🔥 SFX + Editing 메타데이터 */}
              {storyboard?.metadata?.audioEditingGuide && (
                <div className="space-y-3 text-sm">
                  {storyboard.metadata.audioEditingGuide.sfx && storyboard.metadata.audioEditingGuide.sfx !== '정보 없음' && (
                    <div>
                      <h4 className="font-semibold text-gray-300 mb-1">🔉 SFX (Sound Effects)</h4>
                      <p className="text-gray-400">{storyboard.metadata.audioEditingGuide.sfx}</p>
                    </div>
                  )}
                  {storyboard.metadata.audioEditingGuide.editing && storyboard.metadata.audioEditingGuide.editing !== '정보 없음' && (
                    <div>
                      <h4 className="font-semibold text-gray-300 mb-1">✏️ Editing Pace</h4>
                      <p className="text-gray-400">{storyboard.metadata.audioEditingGuide.editing}</p>
                    </div>
                  )}
                  {(!storyboard.metadata.audioEditingGuide.sfx || storyboard.metadata.audioEditingGuide.sfx === '정보 없음') &&
                    (!storyboard.metadata.audioEditingGuide.editing || storyboard.metadata.audioEditingGuide.editing === '정보 없음') && (
                      <p className="text-gray-500">편집 가이드 정보가 없습니다.</p>
                    )}
                </div>
              )}

              {!recommendedVideo && !storyboard?.metadata?.audioEditingGuide && (
                <p className="text-gray-500 text-sm">편집 포인트 제안이 없습니다.</p>
              )}
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
                  disabled={loading || sortedImages.filter(img => img.videoUrl).length === 0}
                  className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg transition-colors font-medium disabled:cursor-not-allowed"
                  title={sortedImages.filter(img => img.videoUrl).length === 0 ? '최소 1개 씬을 영상으로 변환해주세요' : ''}
                >
                  ✅ 최종 영상 제작
                </button>
              </div>
            )}

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

            {/* 🔥 필터 모달 (Fixed Position + Vertical Sidebar) */}
            {/* 🔥 필터 모달 (Fixed Position + Vertical Sidebar) - Portal 사용 */}
            {showPersonModal && createPortal(
              <>
                <div
                  className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]"
                  onClick={() => setShowPersonModal(false)}
                />

                <div
                  className="fixed z-50 bg-gray-900 rounded-xl border border-gray-600 shadow-2xl flex flex-col overflow-hidden"
                  style={{
                    top: modalPosition.top,
                    left: modalPosition.left,
                    width: '550px',
                    height: '600px'
                  }}
                >
                  {/* Header */}
                  <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      👤 인물 선택 <span className="text-xs font-normal text-gray-500">(Seedream)</span>
                    </h3>
                    <button onClick={() => setShowPersonModal(false)} className="text-gray-400 hover:text-white transition-colors p-1">✕</button>
                  </div>

                  {/* Body: Left Sidebar + Right Content */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Filter Sidebar (Vertical) */}
                    <div className="w-32 bg-gray-950 p-4 overflow-y-auto border-r border-gray-800 flex-shrink-0">

                      {/* Age Group */}
                      <div className="mb-6">
                        <label className="text-xs font-bold text-gray-500 mb-2 block uppercase tracking-wider">Age</label>
                        <div className="flex flex-col gap-2">
                          {uniqueAges.map(age => (
                            <label key={age} className="flex items-center gap-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={personFilters.age.includes(age)}
                                onChange={() => handleFilterChange('age', age)}
                                className="w-3.5 h-3.5 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-1 focus:ring-blue-500 checked:bg-blue-600"
                              />
                              <span className="text-gray-400 text-xs group-hover:text-gray-200">{age}대</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Gender Group */}
                      <div>
                        <label className="text-xs font-bold text-gray-500 mb-2 block uppercase tracking-wider">Sex</label>
                        <div className="flex flex-col gap-2">
                          {uniqueGenders.map(gender => (
                            <label key={gender} className="flex items-center gap-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={personFilters.gender.includes(gender)}
                                onChange={() => handleFilterChange('gender', gender)}
                                className="w-3.5 h-3.5 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-1 focus:ring-blue-500 checked:bg-blue-600"
                              />
                              <span className="text-gray-400 text-xs group-hover:text-gray-200">{gender}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Nationality Group */}
                      <div className="mt-6">
                        <label className="text-xs font-bold text-gray-500 mb-2 block uppercase tracking-wider">Nationality</label>
                        <div className="flex flex-col gap-2">
                          {uniqueNationalities.map(nat => (
                            <label key={nat} className="flex items-center gap-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={personFilters.nationality.includes(nat)}
                                onChange={() => handleFilterChange('nationality', nat)}
                                className="w-3.5 h-3.5 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-1 focus:ring-blue-500 checked:bg-blue-600"
                              />
                              <span className="text-gray-400 text-xs group-hover:text-gray-200">{nat}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Main Grid Content */}
                    <div className="flex-1 bg-gray-900 p-4 overflow-y-auto w-full">
                      <div className="grid grid-cols-3 gap-3">
                        {filteredPeople.slice(0, visiblePeopleCount).map(person => (
                          <div
                            key={person.key || person.url}
                            onClick={() => setSelectedPerson(person)}
                            className={`relative group cursor-pointer rounded-lg overflow-hidden border transition-all duration-200 aspect-[3/4] ${selectedPerson?.url === person.url
                              ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                              : 'border-gray-800 hover:border-gray-600'
                              }`}
                          >
                            <img src={person.url} alt={person.name} className="w-full h-full object-cover" loading="lazy" />

                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                              <p className="text-white font-bold text-[11px] truncate">{person.name}</p>
                              <p className="text-gray-400 text-[10px] truncate">{person.age} / {person.gender}</p>
                            </div>

                            {/* Selected Indicator */}
                            {selectedPerson?.url === person.url && (
                              <div className="absolute top-2 right-2 bg-blue-600 text-white p-0.5 rounded-full shadow-lg z-10">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Load More */}
                      {filteredPeople.length > visiblePeopleCount && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setVisiblePeopleCount(prev => prev + 4);
                          }}
                          className="w-full mt-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 text-xs transition-colors"
                        >
                          + Load More ({filteredPeople.length - visiblePeopleCount})
                        </button>
                      )}

                      {filteredPeople.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs">
                          <span>No persons found</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="p-4 border-t border-gray-800 bg-gray-900 flex justify-end gap-2">
                    <button
                      onClick={() => setShowPersonModal(false)}
                      className="px-3 py-2 text-gray-400 hover:text-white text-xs"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSynthesizePerson}
                      disabled={!selectedPerson || synthesisLoading}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                      {synthesisLoading ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Processing...
                        </>
                      ) : (
                        '합성'
                      )}
                    </button>
                  </div>
                </div >
              </>,
              document.body // 🔥 Render directly to Body
            )}
          </div >
        </div>
      </div>
    </div >
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
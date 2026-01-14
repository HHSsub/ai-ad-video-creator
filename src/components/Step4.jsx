import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { forceScrollTop } from '../forceScrollTop';
import MemberListModal from './MemberListModal';
import InviteMemberModal from './InviteMemberModal';

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
  const [koreanPrompts, setKoreanPrompts] = useState({}); // 🔥 복구: 번역된 한국어 프롬프트 저장
  const [isTranslating, setIsTranslating] = useState(false); // 번역 진행 상태

  // 🔥 추가: 멤버 관리 모달 상태
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // 🔥 인물 합성 관련 상태
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({ top: 0, left: 0 }); // Pos State
  const [targetSceneNumber, setTargetSceneNumber] = useState(null);
  const [featurePeople, setFeaturePeople] = useState([]);
  const [filteredPeople, setFilteredPeople] = useState([]);
  const [visiblePeopleCount, setVisiblePeopleCount] = useState(4); const [synthesisMode, setSynthesisMode] = useState(null); // null (selection), 'person', 'product', 'logo'
  const [uploadFile, setUploadFile] = useState(null); // For Product/Logo
  const [uploadPreview, setUploadPreview] = useState(null);
  const [personFilters, setPersonFilters] = useState({
    age: [],
    gender: [],
    nationality: []
  });
  // 🔥 추가: 씬 선택 및 삭제 관련 상태
  const [selectedScenes, setSelectedScenes] = useState([]);
  const [forceUpdate, setForceUpdate] = useState(0); // 강제 리렌더링용

  // 🔥 복구: 누락된 State 변수들
  const [imageLoadStates, setImageLoadStates] = useState({});
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [recommendedVideo, setRecommendedVideo] = useState(null);
  const [selectedScene, setSelectedScene] = useState(null); // Added for new synthesis logic

  const permissions = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS.viewer;

  const styles = storyboard?.styles || [];
  const selectedStyle = styles.find(s => String(s.concept_id) === String(selectedConceptId) || String(s.conceptId) === String(selectedConceptId));
  // 🔥 forceUpdate를 의존성에 추가하여 리렌더링 유도
  const images = selectedStyle?.images || [];

  // 🔥 씬 번호 강제 순차 재할당 (useMemo로 최적화)
  const renumberedImages = useMemo(() => {
    console.log('[Step4] 🔥 리넘버링 실행:', images.length, '개 씬');
    const result = images.map((img, index) => {
      const newNum = index + 1;
      console.log(`  씬 리넘버링: ${img.sceneNumber} -> ${newNum}`);
      return {
        ...img,
        originalSceneNumber: img.sceneNumber, // 🔥 Preserve Original DB ID
        sceneNumber: newNum
      };
    });
    return result;
  }, [images, forceUpdate]);

  const finalVideo = storyboard?.finalVideos?.find(v => v.conceptId === selectedConceptId);

  const sortedImages = [...renumberedImages].sort((a, b) => a.sceneNumber - b.sceneNumber);

  const log = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
    console.log(`[Step4] ${msg}`);
  };

  // 🔥 초기 진입 시 모든 씬 선택 상태로 초기화
  useEffect(() => {
    if (renumberedImages.length > 0 && selectedScenes.length === 0) {
      setSelectedScenes(renumberedImages.map(img => img.sceneNumber));
    }
  }, [renumberedImages.length]);

  // 🔥 씬 삭제 핸들러
  const handleDeleteScene = async (sceneNumber) => {
    // 1. 최소 1개 씬 유지 확인
    if (sortedImages.length <= 1) {
      alert('최소 1개의 씬은 남아있어야 합니다.');
      return;
    }

    if (!confirm(`Scene ${sceneNumber}을(를) 정말 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.`)) {
      return;
    }

    try {
      // 2. 씬 삭제 API 호출 (Atomically handled by backend)
      // 2. 씬 삭제 API 호출 (Updated to use projects route for stability)
      const requestUrl = `${API_BASE}/api/projects/${currentProject?.id}/scenes/delete`;
      console.log(`[Step4] 씬 삭제 요청: ${requestUrl}`);

      const delResponse = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          conceptId: selectedConceptId,
          sceneNumber: sceneNumber
        })
      });

      // HTML 응답 체크 (404/500 에러 페이지 방지)
      const contentType = delResponse.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        const text = await delResponse.text();
        console.error('[Step4] 씬 삭제 실패 (HTML 응답):', text.substring(0, 100));
        throw new Error(`서버 라우팅 오류 (HTML 응답 수신): ${delResponse.status}`);
      }

      const delResult = await delResponse.json();

      if (!delResponse.ok || !delResult.success) {
        throw new Error(delResult.error || '씬 삭제 실패');
      }

      // 3. 상태 업데이트 (Backend Source of Truth)
      // 부모 컴포넌트(Step4Consumer)나 상위에서 storyboard를 관리한다면 onComplete로 전파하거나
      // 여기서는 prop으로 받은 storyboard를 직접 수정하는 것이 아니라,
      // 리턴받은 updatedStoryboard를 사용하여 로컬 상태를 강제로 갱신해야 함.
      // 하지만 현재 구조상 storyboard prop을 직접 mutate하고 forceUpdate를 쓰는 패턴이므로
      // 백엔드에서 받은 최신 storyboard로 로컬 storyboard 객체 내용을 덮어씌움.

      // Update the reference object (since props are read-only but objects are mutable reference)
      // Better strategy: Call a refresh callback if available, or mutate carefully matching backend state.

      const newImages = delResult.storyboard.styles.find(s => s.conceptId == selectedConceptId || s.concept_id == selectedConceptId).images;

      // Mutate the prop object (Legacy pattern used in this file)
      const styleIndex = storyboard.styles.findIndex(s => s.conceptId === selectedConceptId);
      if (styleIndex !== -1) {
        storyboard.styles[styleIndex].images = newImages;
      }

      setForceUpdate(prev => prev + 1); // 리렌더링 트리거
      setSelectedScenes(newImages.map(img => img.sceneNumber)); // 선택 상태 리셋
      setModifiedScenes([]); // 수정 상태 리셋

      log(`씬 ${sceneNumber} 삭제 완료 (총 ${newImages.length}개)`);

    } catch (err) {
      console.error('씬 삭제 실패:', err);
      alert(`씬 삭제 실패: ${err.message}`);
    }
  };

  // 🔥 씬 선택 토글 핸들러
  const handleToggleSceneSelection = (sceneNumber) => {
    setSelectedScenes(prev => {
      if (prev.includes(sceneNumber)) {
        return prev.filter(n => n !== sceneNumber);
      } else {
        return [...prev, sceneNumber];
      }
    });
  };





  // ... (getImageSrc, getVideoSrc, useEffects exist here) ... 

  // ... existing handlers ...




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

  // 🔥 번역 API 호출 헬퍼
  const translateText = async (text, targetLang = 'ko') => {
    try {
      const response = await fetch(`${API_BASE}/api/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          text,
          targetLang
        })
      });

      if (!response.ok) throw new Error('Translation failed');
      const data = await response.json();
      return data.translatedText;
    } catch (error) {
      console.error('Translation error:', error);
      return null; // 실패 시 null 반환 (원본 영문 반환 X -> 재시도 가능하게)
    }
  };

  // 🔥 통합된 번역 및 영구 저장 로직
  useEffect(() => {
    // 1. 초기 로드 시, 이미 저장된 번역이 있는지 확인하여 상태 복구 (Persistence check)
    if (renumberedImages && renumberedImages.length > 0) {
      const loadedPrompts = {};
      renumberedImages.forEach(img => {
        if (img.koreanPrompt) {
          loadedPrompts[img.sceneNumber] = img.koreanPrompt;
        }
      });

      // 기존 상태와 병합
      setKoreanPrompts(prev => {
        const next = { ...prev, ...loadedPrompts };
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
        return next;
      });
    }

    // 2. 1.5초 후 누락된 번역 일괄 처리 (Batch)
    const timer = setTimeout(async () => {
      if (!renumberedImages || renumberedImages.length === 0) return;

      const missingTranslations = renumberedImages.filter(img =>
        img.prompt &&
        !img.koreanPrompt && // 이미 저장된 번역이 있으면 스킵
        !koreanPrompts[img.sceneNumber] && // 현재 메모리에 있으면 스킵
        /[a-zA-Z]/.test(img.prompt) // 영어가 포함된 경우만
      );

      if (missingTranslations.length > 0) {
        console.log(`[Step4] 번역 필요한 씬 발견: ${missingTranslations.length}개 -> 배치 번역 시작`);
        setIsTranslating(true);

        try {
          const textsToTranslate = missingTranslations.map(img => img.prompt);

          const response = await fetch(`${API_BASE}/api/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: textsToTranslate, targetLang: 'ko' })
          });

          if (!response.ok) throw new Error('Batch translation request failed');

          const data = await response.json();

          if (data.success && data.translatedTexts && Array.isArray(data.translatedTexts)) {
            const newTrans = {};
            const scenesToUpdate = [];

            missingTranslations.forEach((img, index) => {
              if (data.translatedTexts[index]) {
                newTrans[img.sceneNumber] = data.translatedTexts[index];
                scenesToUpdate.push({
                  sceneNumber: img.sceneNumber,
                  koreanPrompt: data.translatedTexts[index]
                });
              }
            });

            // A. 로컬 상태 업데이트
            setKoreanPrompts(prev => ({ ...prev, ...newTrans }));

            // B. 백엔드 영구 저장 (Persistence)
            // storyboard 객체를 직접 수정하여 PATCH 요청
            const styleIndex = storyboard.styles.findIndex(s => s.conceptId === selectedConceptId);
            if (styleIndex !== -1) {
              const updatedStyle = { ...storyboard.styles[styleIndex] };

              scenesToUpdate.forEach(update => {
                const sIdx = updatedStyle.images.findIndex(img => String(img.sceneNumber) === String(update.sceneNumber));
                if (sIdx !== -1) {
                  updatedStyle.images[sIdx].koreanPrompt = update.koreanPrompt;
                }
              });

              // 전체 스토리보드 업데이트 요청
              await fetch(`${API_BASE}/api/projects/${currentProject?.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-username': user?.username || 'anonymous' },
                body: JSON.stringify({ storyboard, formData })
              });
              console.log(`[Step4] 배치 번역 결과 ${scenesToUpdate.length}개 영구 저장 완료`);
            }
          }
        } catch (e) {
          console.error('[Step4] Batch translation error:', e);
        } finally {
          setIsTranslating(false);
        }
      } else {
        console.log('[Step4] 모든 씬 번역 완료 상태.');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [images, selectedConceptId]); // koreanPrompts 의존성 제거 (무한루프 방지)

  // 🔥 한글 입력 -> 영문 번역 -> 이미지 재생성 wrapper
  const handleRegenerateWithTranslation = async (sceneNumber) => {
    if (!permissions.regenerate) {
      setError('이미지 재생성 권한이 없습니다.');
      return;
    }

    const scene = sortedImages.find(img => img.sceneNumber === sceneNumber);
    if (!scene) return;

    // 현재 입력창에 있는 값 (한글일 수 있음)
    const currentInput = getEditedPrompt(sceneNumber, 'prompt', koreanPrompts[sceneNumber] || scene.prompt);

    // 🔥 1. 즉시 재생성 상태로 변경 (UI 반응성 개선)
    setRegeneratingScenes(prev => ({ ...prev, [sceneNumber]: true }));
    setError(null);
    setIsTranslating(true);

    log(`씬 ${sceneNumber} 프롬프트 번역 및 재생성 시작...`);

    try {
      // 2. 한글 -> 영문 번역
      const englishPrompt = await translateText(currentInput, 'en');
      log(`번역 완료: ${currentInput.substring(0, 20)}... -> ${englishPrompt.substring(0, 20)}...`);

      // 3. 번역된 영문 프롬프트로 재생성 요청
      const response = await fetch(`${API_BASE}/api/storyboard-render-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          imagePrompt: {
            prompt: englishPrompt, // 번역된 영문 프롬프트 사용
            aspect_ratio: formData?.aspectRatioCode || 'widescreen_16_9',
            guidance_scale: 2.5,
            seed: Math.floor(Math.random() * 1000000)
          },
          sceneNumber: sceneNumber,
          conceptId: selectedConceptId,
          projectId: currentProject?.id || null
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Image generation failed');
      }

      const data = await response.json();

      // 성공 시 이미지 URL 업데이트 (스토리보드 객체 직접 수정 및 강제 리렌더)
      console.log(`[Step4] 재생성된 이미지 URL: ${data.imageUrl}`);

      const styleIndex = storyboard.styles.findIndex(s => String(s.conceptId) === String(selectedConceptId));
      if (styleIndex !== -1) {
        const targetImage = storyboard.styles[styleIndex].images.find(img => String(img.sceneNumber) === String(sceneNumber));
        if (targetImage) {
          const newUrl = data.imageUrl || data.url;
          if (!newUrl) {
            console.error('[Step4] ❌ 이미지 생성 성공했으나 URL이 비어있음:', data);
            throw new Error('서버 응답오류: 이미지 URL이 없습니다.');
          }

          targetImage.imageUrl = `${newUrl}${newUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
          targetImage.prompt = englishPrompt;
          targetImage.koreanPrompt = currentInput;
          targetImage.status = 'regenerated';
          targetImage.videoUrl = null; // Reset video on image change

          // 🔥 백엔드 영구 저장 (Partial Update로 레이스 컨디션 방지)
          try {
            await fetch(`${API_BASE}/api/projects/${currentProject.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'x-username': user?.username || 'anonymous' },
              body: JSON.stringify({
                storyboardUpdate: {
                  conceptId: selectedConceptId,
                  sceneNumber: sceneNumber,
                  updates: {
                    imageUrl: targetImage.imageUrl,
                    prompt: englishPrompt,
                    koreanPrompt: currentInput,
                    status: 'regenerated',
                    videoUrl: null
                  }
                }
              })
            });
          } catch (saveErr) {
            console.error(`[Step4] 씬 ${sceneNumber} 저장 실패:`, saveErr);
          }
        }
      }

      // 한글 프롬프트 상태 업데이트 (입력한 내용 유지)
      setKoreanPrompts(prev => ({ ...prev, [sceneNumber]: currentInput }));

      setForceUpdate(prev => prev + 1);
      log(`씬 ${sceneNumber} 이미지 재생성 완료`);

    } catch (err) {
      console.error('재생성 실패:', err);
      setError(`재생성 실패: ${err.message}`);
    } finally {
      setIsTranslating(false);
      setRegeneratingScenes(prev => ({ ...prev, [sceneNumber]: false }));
    }
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

  // 🔥 초기 진입 시 코멘트 로드
  useEffect(() => {
    if (images.length > 0) {
      const initialComments = {};
      images.forEach(img => {
        if (img.comments && Array.isArray(img.comments)) {
          initialComments[img.sceneNumber] = img.comments;
        }
      });
      setLocalComments(initialComments);
    }
  }, [images]); // images가 변경될 때마다(초기 로드 포함) 코멘트 동기화


  const handleAddComment = async (sceneNumber) => {
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

    // 1. 로컬 상태 즉시 업데이트 (UI 반응성)
    setLocalComments(prev => ({
      ...prev,
      [sceneNumber]: [...(prev[sceneNumber] || []), comment]
    }));

    setNewComment(prev => ({ ...prev, [sceneNumber]: '' }));

    // 2. 스토리보드 객체 업데이트 (참조 수정)
    const scene = sortedImages.find(img => img.sceneNumber === sceneNumber);
    if (!scene) return;

    if (!scene.comments) scene.comments = [];
    scene.comments.push(comment);

    // 3. 백엔드 저장 (PATCH)
    try {
      log(`씬 ${sceneNumber} 코멘트 저장 중...`);
      await fetch(`${API_BASE}/api/projects/${currentProject?.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          storyboard: storyboard, // 변경된 코멘트가 포함된 전체 스토리보드 저장
          formData: formData
        })
      });
      log(`씬 ${sceneNumber} 코멘트 저장 완료`);
    } catch (saveErr) {
      console.error('코멘트 저장 실패:', saveErr);
      setError('코멘트 저장 실패 (네트워크 오류)');
      // 실패 시 롤백 로직이 필요할 수 있으나, 현재는 에러만 표시
    }
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
      if (result.success && (result.url || result.imageUrl)) {
        const styleIndex = storyboard.styles.findIndex(s => String(s.conceptId) === String(selectedConceptId));
        if (styleIndex !== -1) {
          const targetImage = storyboard.styles[styleIndex].images.find(img => String(img.sceneNumber) === String(sceneNumber));
          if (targetImage) {
            const newImageUrl = result.url || result.imageUrl;
            targetImage.imageUrl = newImageUrl;
            targetImage.prompt = editedPrompt;
            targetImage.videoUrl = null;
            targetImage.status = 'image_done';

            log(`씬 ${sceneNumber} 이미지 재생성 완료: ${newImageUrl}`);

            // 🔥 중요: 변경된 스토리보드를 프로젝트에 저장 (영구 반영)
            try {
              await fetch(`${API_BASE}/api/projects/${currentProject?.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-username': user?.username || 'anonymous' },
                body: JSON.stringify({ storyboard, formData })
              });
              log('프로젝트 데이터 저장 완료 (URL 갱신)');
            } catch (saveErr) {
              console.error('프로젝트 저장 실패:', saveErr);
            }
          }
        }
      } else {
        throw new Error(result.message || result.error || '이미지 재생성 실패');
      }
    } catch (err) {
      setError(`씬 ${sceneNumber} 재생성 오류: ${err.message}`);
      log(`씬 ${sceneNumber} 재생성 오류: ${err.message}`);
    } finally {
      // setIsRegenerating(false); // This state variable is not defined
      setRegeneratingScenes(prev => ({ ...prev, [sceneNumber]: false }));
    }
  };

  // 🔥 E-1: 씬별 영상 변환
  // 🔥 E-1: 씬별 영상 변환
  const handleConvertSingleScene = async (sceneNumber) => {
    if (!permissions.regenerate) {
      setError('영상 변환 권한이 없습니다.');
      return;
    }

    // 🔥 Fix: Find the REAL reference in the storyboard object, not the shallow copy from renumberedImages
    const styleIndex = storyboard.styles.findIndex(s =>
      String(s.conceptId) === String(selectedConceptId) ||
      String(s.concept_id) === String(selectedConceptId)
    );

    if (styleIndex === -1) {
      console.error(`[Step4] Critical Error: Concept ${selectedConceptId} not found in storyboard`);
      return;
    }

    const realStyle = storyboard.styles[styleIndex];

    // 🔥 Fix: 'scene' is not defined here. We must find it from renumberedImages using the display 'sceneNumber'.
    const displayScene = renumberedImages.find(img => img.sceneNumber === sceneNumber);
    // Use originalSceneNumber if available, otherwise fallback to sceneNumber
    const targetSceneNumber = displayScene?.originalSceneNumber || sceneNumber;

    const realScene = realStyle.images.find(img => String(img.sceneNumber) === String(targetSceneNumber));

    if (!realScene || !realScene.imageUrl) {
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
          imageUrl: realScene.imageUrl,
          sceneNumber: sceneNumber,
          projectId: currentProject?.id,
          conceptId: selectedConceptId,
          prompt: realScene.prompt, // 🔥 AI Video Prompt
          motionPrompt: realScene.motionPrompt, // 🔥 Detailed Motion Guide
          // 🔥 Auto vs Manual Duration Logic
          duration: realScene.duration ? realScene.duration : (Math.round(formData.videoLength / sortedImages.length) || 5)
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
                targetDuration: result.targetDuration,
                projectId: currentProject?.id,
                conceptId: selectedConceptId
              })
            });
            const statusData = await statusRes.json();

            if (statusData.status === 'completed' && statusData.videoUrl) {
              // Success - Update Real Reference
              realScene.videoUrl = statusData.videoUrl;
              realScene.status = 'video_done';

              log(`씬 ${sceneNumber} 영상 변환 완료: ${statusData.videoUrl}`);
              setConvertingScenes(prev => ({ ...prev, [sceneNumber]: false }));
              setModifiedScenes(prev => [...prev, sceneNumber]);
              setForceUpdate(prev => prev + 1); // 🔥 Update UI

              // 🔥 중요: Async Polling 완료 후 즉시 부분 업데이트 (레이스 컨디션 방지)
              try {
                await fetch(`${API_BASE}/api/projects/${currentProject?.id}`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-username': user?.username || 'anonymous'
                  },
                  body: JSON.stringify({
                    storyboardUpdate: {
                      conceptId: selectedConceptId,
                      sceneNumber: sceneNumber,
                      updates: {
                        videoUrl: statusData.videoUrl,
                        status: 'video_done',
                        videoStatus: 'completed',
                        taskId: null
                      }
                    }
                  })
                });
                log(`씬 ${sceneNumber} 변환 결과 저장 완료 (Partial)`);
              } catch (saveErr) {
                console.error('프로젝트 부분 저장 실패:', saveErr);
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
        realScene.videoUrl = result.videoUrl;
        realScene.status = 'video_done';

        log(`씬 ${sceneNumber} 영상 변환 완료: ${result.videoUrl}`);
        setForceUpdate(prev => prev + 1); // 🔥 Update UI

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

    // 🔥 수정: 선택된 씬만 필터링
    const videoScenes = sortedImages.filter(img =>
      img.videoUrl && selectedScenes.includes(img.sceneNumber)
    );

    if (videoScenes.length === 0) {
      setError('최소 1개 이상의 선택된 씬이 영상으로 변환되어 있어야 합니다.');
      return;
    }

    setLoading(true);
    setError(null);
    log('최종 영상 합치기(Compile) 시작...');

    // 🔥 씬이 1개뿐인 경우: 합치기 과정 생략 (Bypass)
    let finalVideoUrl = null;

    if (videoScenes.length === 1) {
      log('단일 씬이므로 영상 합치기 과정을 생략하고 바로 완료합니다.');
      finalVideoUrl = videoScenes[0].videoUrl;
    } else {
      try {
        // 1. 영상 합치기 요청
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

        finalVideoUrl = compileResult.compiledVideoUrl;
        log(`영상 합치기 성공: ${finalVideoUrl}`);

      } catch (err) {
        console.error('컨펌 처리 중 오류:', err);
        setError(`컨펌 처리 실패: ${err.message}`);
        log(`컨펌 처리 실패: ${err.message}`);
        setLoading(false);
        return;
      }
    }

    try {
      // 2. 스토리보드에 finalVideo 업데이트 (공통 로직)

      // Legacy block removed - simplified above


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
  // 🔥 모달 열기 (버튼 위치 기준)
  const handleOpenPersonModal = (scene, e) => {
    e.preventDefault();
    e.stopPropagation();

    // 1. 버튼 위치 및 크기 계산
    // 🔥 "정확히 씬 정중앙 가릴만큼" -> 버튼의 부모(씬 카드)를 찾아서 그 중앙에 위치시키기 시도
    let targetRect = e.currentTarget.getBoundingClientRect();
    // Fix: Invalid selector syntax error. Use data-attribute for robustness.
    const sceneCard = e.currentTarget.closest('[data-scene-card="true"]');

    if (sceneCard) {
      targetRect = sceneCard.getBoundingClientRect();
    }

    const modalWidth = 320; // Type Selection Modal Width
    const modalHeight = 400; // Approx Height

    // 2. 타겟(씬 카드 혹은 버튼) 정중앙에 위치시키기
    let left = targetRect.left + (targetRect.width / 2) - (modalWidth / 2);
    let top = targetRect.top + (targetRect.height / 2) - (modalHeight / 2);

    // 3. 화면 밖으로 나가는 것 방지 (Viewport Constraints)
    // 왼쪽/오른쪽 확인
    if (left < 10) left = 10;
    if (left + modalWidth > window.innerWidth - 10) {
      left = window.innerWidth - modalWidth - 10;
    }

    // 위/아래 확인
    if (top < 10) top = 10;
    if (top + modalHeight > window.innerHeight - 10) {
      top = window.innerHeight - modalHeight - 10;
    }

    setModalPosition({ top, left });
    setSelectedScene(scene);

    // Reset states
    setSynthesisMode(null);
    setUploadFile(null);
    setUploadPreview(null);

    // Open Modal
    setShowPersonModal(true);

    // 🔥 리스트가 비어있으면 데이터 로드
    if (featurePeople.length === 0) {
      fetchFeaturePeople();
    }
  };

  const handleModeSelect = (mode) => {
    setSynthesisMode(mode);
    if (mode === 'person') {
      // Existing person filter reset logic if needed
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadFile(file);
      setUploadPreview(URL.createObjectURL(file));
    }
  };
  // Original modal position calculation logic (now unused due to new handleOpenPersonModal)
  // const handleOpenPersonModal = (sceneNumber, e) => {
  //   e.preventDefault();
  //   e.stopPropagation();

  //   // 1. 버튼 위치 및 크기
  //   const rect = e.currentTarget.getBoundingClientRect();
  //   const scrollY = window.scrollY;

  //   const modalWidth = 550;
  //   const modalHeight = 600;

  //   // 2. 정확히 버튼 중앙에 모달 중앙을 위치시킴 (Viewport 기준)
  //   let left = rect.left + (rect.width / 2) - (modalWidth / 2);
  //   let top = rect.top + (rect.height / 2) - (modalHeight / 2);

  //   // 4. 화면 밖으로 나가는 것 방지 (Viewport Constraints)
  //   // 왼쪽 확인
  //   if (left < 20) left = 20;

  //   // 오른쪽 확인
  //   if (left + modalWidth > window.innerWidth - 20) {
  //     left = window.innerWidth - modalWidth - 20;
  //   }
  //   // 위쪽 확인
  //   if (top < 20) top = 20;
  //   // 아래쪽 확인
  //   if (top + modalHeight > window.innerHeight - 20) {
  //     top = window.innerHeight - modalHeight - 20;
  //   }

  //   console.log('[handleOpenPersonModal] Clicked Button Rect:', rect);
  //   console.log('[handleOpenPersonModal] Calculated Position:', { top, left, scrollY: window.scrollY });

  //   setModalPosition({ top, left });
  //   setTargetSceneNumber(sceneNumber);
  //   setShowPersonModal(true);
  //   setVisiblePeopleCount(4);

  //   if (featurePeople.length === 0) {
  //     fetchFeaturePeople();
  //   }
  // };

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
    if (!selectedScene) return;

    // Validation
    if (synthesisMode === 'person' && !selectedPerson) return;
    if ((synthesisMode === 'product' || synthesisMode === 'logo') && !uploadFile) return;

    setSynthesisLoading(true);
    log(`씬 ${selectedScene.sceneNumber} ${synthesisMode} 합성 시작...`);

    try {
      let referenceImagePayload = null;
      let metadata = {};

      if (synthesisMode === 'person') {
        referenceImagePayload = selectedPerson.url;
        metadata = {
          name: selectedPerson.name,
          age: selectedPerson.age,
          gender: selectedPerson.gender,
          nationality: selectedPerson.nationality
        };
      } else {
        // File to Base64
        const toBase64 = file => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = error => reject(error);
        });
        referenceImagePayload = await toBase64(uploadFile);
      }

      const response = await fetch(`${API_BASE}/api/synthesis-person`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sceneImage: selectedScene.imageUrl,
          personImage: referenceImagePayload,
          personMetadata: metadata,
          sceneContext: selectedScene.prompt || selectedScene.copy,
          projectId: currentProject?.id, // Use currentProject?.id
          aspectRatio: formData?.aspectRatioCode, // Use formData?.aspectRatioCode
          synthesisType: synthesisMode // 🔥 Pass synthesis type
        }),
      });

      const data = await response.json();

      if (data.success && data.imageUrl) {
        // Update Storyboard
        // Find the style object for the current concept (Robust Match)
        const styleIndex = storyboard.styles.findIndex(s =>
          String(s.conceptId) === String(selectedConceptId) ||
          String(s.concept_id) === String(selectedConceptId)
        );

        if (styleIndex === -1) {
          console.error(`[Step4] Critical Error: Concept ${selectedConceptId} not found in storyboard styles`, storyboard.styles);
        }
        if (styleIndex !== -1) {
          const currentStyle = storyboard.styles[styleIndex];
          const sceneIndex = currentStyle.images.findIndex(s => String(s.sceneNumber) === String(selectedScene.originalSceneNumber || selectedScene.sceneNumber));
          if (sceneIndex !== -1) {
            // Update Image URL and Add Cache Buster
            currentStyle.images[sceneIndex].imageUrl = `${data.imageUrl}?t=${Date.now()}`;
            currentStyle.images[sceneIndex].videoUrl = null; // Reset video on image change
            currentStyle.images[sceneIndex].status = 'image_synthesized';

            // Mark as modified
            setModifiedScenes(prev => {
              if (prev.includes(selectedScene.sceneNumber)) return prev;
              return [...prev, selectedScene.sceneNumber];
            });
          }
        }

        setForceUpdate(prev => prev + 1); // Force Re-render
        setShowPersonModal(false); // Close Modal
        setSelectedPerson(null); // Reset selected person
        setUploadFile(null); // Reset uploaded file
        setUploadPreview(null); // Reset upload preview
        log(`씬 ${selectedScene.sceneNumber} ${synthesisMode} 합성 완료: ${data.imageUrl}`);

        // Save the updated storyboard to the backend (Partial Update for safety)
        await fetch(`${API_BASE}/api/projects/${currentProject?.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-username': user?.username || 'anonymous' },
          body: JSON.stringify({
            storyboardUpdate: {
              conceptId: selectedConceptId,
              sceneNumber: selectedScene.originalSceneNumber || selectedScene.sceneNumber, // 🔥 Robust ID
              updates: {
                imageUrl: data.imageUrl, // S3 URL is unique, no cache buster needed for DB
                videoUrl: null,
                status: 'image_synthesized'
              }
            }
          })
        });

      } else {
        throw new Error(data.error || '합성 실패');
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
              <h2 className="text-3xl font-bold text-white">
                ✏️ 영상 편집 - Concept {selectedConceptId}
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
            {/* 멤버 관리 버튼 그룹 */}
            <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
              <button
                onClick={() => setShowMemberModal(true)}
                className="px-3 py-1.5 hover:bg-gray-700 text-green-400 rounded-md transition-colors text-xs flex items-center gap-1.5 border-r border-gray-700"
                title="멤버 목록 보기"
              >
                <span>👥</span> 멤버 목록
              </button>
              {permissions.invite && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="px-3 py-1.5 hover:bg-gray-700 text-purple-400 rounded-md transition-colors text-xs flex items-center gap-1.5"
                  title="새 멤버 초대"
                >
                  <span>➕</span> 멤버 초대
                </button>
              )}
            </div>
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
              {sortedImages.map((img, index) => {
                const isRegenerating = regeneratingScenes[img.sceneNumber];
                const isModified = modifiedScenes.includes(img.sceneNumber);
                const sceneComments = localComments[img.sceneNumber] || [];

                return (
                  <div
                    key={img.sceneNumber}
                    data-scene-card="true"
                    className={`bg-gray-900/50 rounded-xl p-6 border ${isModified ? 'border-yellow-600' : 'border-gray-700'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedScenes.includes(img.sceneNumber)}
                            onChange={() => handleToggleSceneSelection(img.sceneNumber)}
                            className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span className={`text-sm font-medium ${selectedScenes.includes(img.sceneNumber) ? 'text-blue-300' : 'text-gray-500'}`}>
                            영상 변환 포함
                          </span>
                        </label>
                        <h4 className="text-lg font-semibold text-white">
                          | Scene {img.sceneNumber}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* 🔥 씬 삭제 버튼 */}
                        {permissions.editPrompt && (
                          <button
                            onClick={() => handleDeleteScene(img.sceneNumber)}
                            className="flex items-center gap-1 px-2 py-1 bg-red-900/30 hover:bg-red-900/60 text-red-400 hover:text-red-300 rounded transition-colors text-xs border border-red-900/50"
                            title="이 씬을 영구 삭제합니다"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            씬 삭제
                          </button>
                        )}

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
                        <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-gray-700 group">
                          {img.imageUrl ? (
                            <>
                              <div className="relative w-full h-full">
                                {/* 🔥 Loading Spinner */}
                                {!imageLoadStates[img.sceneNumber] && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                                  </div>
                                )}

                                <img
                                  src={getImageSrc(img.imageUrl)}
                                  alt={`Scene ${img.sceneNumber}`}
                                  className={`w-full h-full object-contain transition-opacity duration-300 ${imageLoadStates[img.sceneNumber] ? 'opacity-100' : 'opacity-0'
                                    }`}
                                  onLoad={() => handleImageLoad(img.sceneNumber)}
                                  onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = 'https://via.placeholder.com/400x225?text=Image+Load+Error';
                                    handleImageLoad(img.sceneNumber); // 에러나도 로딩 완료 처리
                                  }}
                                  onClick={() => handleImagePreview(img.imageUrl, img.prompt)}
                                />
                              </div>
                              {/* Overlay for regenerate/convert status */}
                              {isRegenerating || convertingScenes[img.sceneNumber] ? (
                                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
                                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-3"></div>
                                  <span className="text-white font-medium text-sm">
                                    {isRegenerating ? '이미지 생성 중...' : '영상 변환 중...'}
                                  </span>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                              이미지 없음
                            </div>
                          )}

                          {/* Video Preview Overlay */}
                          {!convertingScenes[img.sceneNumber] && img.videoUrl && (
                            <div className="absolute bottom-2 right-2 flex gap-1">
                              <span className="bg-green-600 text-white text-xs px-2 py-1 rounded-md shadow-lg flex items-center">
                                🎬 영상 완료
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Video Player Check */}
                        {img.videoUrl && !convertingScenes[img.sceneNumber] && (
                          <div className="mt-2 text-center">
                            <video
                              src={getVideoSrc(img.videoUrl)}
                              controls
                              className="w-full rounded-lg border border-gray-700 bg-black"
                            />
                          </div>
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
                            🔒 기존 프롬프트 (한글 번역됨)
                          </label>
                          <textarea
                            value={
                              koreanPrompts[img.sceneNumber] ||
                              img.koreanPrompt ||
                              (/[a-zA-Z]/.test(img.prompt) ? '번역 중...' : img.prompt)
                            }
                            readOnly
                            disabled
                            className="w-full h-20 p-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-400 text-sm resize-none mb-3"
                          />

                          <label className="block text-sm font-medium text-gray-400 mb-1">
                            ✏️ 프롬프트 수정 (한글 입력 가능)
                          </label>
                          <textarea
                            value={getEditedPrompt(img.sceneNumber, 'prompt',
                              koreanPrompts[img.sceneNumber] ||
                              (img.koreanPrompt) ||
                              ''
                            )}
                            onChange={(e) => handlePromptChange(img.sceneNumber, 'prompt', e.target.value)}
                            disabled={!permissions.editPrompt || isRegenerating}
                            className="w-full h-24 p-3 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm resize-none focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed mb-2"
                            placeholder="수정할 프롬프트를 한글로 입력하세요..."
                          />
                          <div className="space-y-3">
                            {permissions.editPrompt && (
                              <button
                                onClick={() => handleRegenerateWithTranslation(img.sceneNumber)}
                                disabled={isRegenerating}
                                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg transition-colors text-sm"
                              >
                                {isRegenerating ? '이미지 생성 중...' : '🔄 이미지 재생성 (새로운 변형)'}
                              </button>
                            )}

                            {/* 🔥 인물 합성 버튼 추가 (이벤트 전달) */}
                            {permissions.editPrompt && (
                              <button
                                onClick={(e) => handleOpenPersonModal(img, e)}
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
                        <style>{`
                            .blue-scrollbar::-webkit-scrollbar {
                              width: 8px;
                            }
                            .blue-scrollbar::-webkit-scrollbar-track {
                              background: #1f2937; 
                            }
                            .blue-scrollbar::-webkit-scrollbar-thumb {
                              background-color: #3b82f6; 
                              border-radius: 20px;
                              border: 3px solid #1f2937;
                            }
                            .blue-scrollbar::-webkit-scrollbar-thumb:hover {
                              background-color: #60a5fa; 
                            }
                          `}</style>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                          💬 코멘트 ({sceneComments.length})
                        </label>
                        <div className="h-96 overflow-y-auto bg-gray-800 rounded-lg p-3 mb-2 border border-gray-700 blue-scrollbar">
                          {sceneComments.length === 0 ? (
                            <div className="text-gray-500 text-sm">코멘트가 없습니다.</div>
                          ) : (
                            <div className="space-y-4">
                              {sceneComments.map((comment) => (
                                <div key={comment.id} className="text-sm bg-gray-700/50 p-3 rounded-lg border border-gray-600/30">
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-blue-400">@{comment.username}</span>
                                    <span className="text-gray-500 text-xs">
                                      {new Date(comment.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="text-gray-200 whitespace-pre-wrap leading-relaxed">{comment.text}</p>
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
                              className="flex-1 px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none placeholder-gray-500"
                            />
                            <button
                              onClick={() => handleAddComment(img.sceneNumber)}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-bold whitespace-nowrap"
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

          {formData?.mode !== 'auto' && (
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
          )}

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


            {/* 3-Mode Selection UI - 🔥 POTAL 적용 & 중앙 정렬 */}
            {showPersonModal && !synthesisMode && createPortal(
              <>
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowPersonModal(false)} />
                <div className="fixed z-50 bg-gray-900 rounded-xl border border-gray-600 shadow-2xl flex flex-col overflow-hidden"
                  style={{
                    top: modalPosition.top,
                    left: modalPosition.left,
                    width: '320px',
                    maxHeight: '90vh'
                  }}>
                  <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900">
                    <h3 className="text-lg font-bold text-white">이미지 합성 유형 선택</h3>
                    <button onClick={() => setShowPersonModal(false)} className="text-gray-400 hover:text-white transition-colors p-1">✕</button>
                  </div>
                  <div className="p-4 flex flex-col gap-3">
                    <button onClick={() => handleModeSelect('person')} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors border border-gray-700 hover:border-blue-500 group">
                      <div className="text-sm font-bold text-white group-hover:text-blue-400">👤 인물 합성 (Person)</div>
                      <div className="text-xs text-gray-400 mt-1">기존 인물 라이브러리에서 선택하여 얼굴/몸 합성</div>
                    </button>
                    <button onClick={() => handleModeSelect('product')} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors border border-gray-700 hover:border-purple-500 group">
                      <div className="text-sm font-bold text-white group-hover:text-purple-400">🛍️ 제품 합성 (Product)</div>
                      <div className="text-xs text-gray-400 mt-1">제품 이미지를 업로드하여 자연스럽게 배치</div>
                    </button>
                    <button onClick={() => handleModeSelect('logo')} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors border border-gray-700 hover:border-green-500 group">
                      <div className="text-sm font-bold text-white group-hover:text-green-400">🏢 로고 합성 (Logo)</div>
                      <div className="text-xs text-gray-400 mt-1">로고 이미지를 업로드하여 중앙에 선명하게 삽입</div>
                    </button>
                  </div>
                </div>
              </>,
              document.body
            )}

            {/* Product/Logo Upload UI - 🔥 POTAL 적용 & 중앙 정렬 */}
            {showPersonModal && (synthesisMode === 'product' || synthesisMode === 'logo') && createPortal(
              <>
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowPersonModal(false)} />
                <div className="fixed z-50 bg-gray-900 rounded-xl border border-gray-600 shadow-2xl flex flex-col overflow-hidden"
                  style={{
                    top: modalPosition.top,
                    left: modalPosition.left,
                    width: '400px',
                    maxHeight: '90vh'
                  }}>
                  <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900">
                    <h3 className="text-lg font-bold text-white">
                      {synthesisMode === 'product' ? '🛍️ 제품 이미지 업로드' : '🏢 로고 이미지 업로드'}
                    </h3>
                    <button onClick={() => setShowPersonModal(false)} className="text-gray-400 hover:text-white transition-colors p-1">✕</button>
                  </div>
                  <div className="p-6 flex flex-col items-center gap-4">
                    <div className="w-full aspect-video border-2 border-dashed border-gray-700 rounded-lg flex flex-col items-center justify-center bg-gray-800/50 hover:bg-gray-800/80 transition-colors cursor-pointer relative overflow-hidden">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      {uploadPreview ? (
                        <img src={uploadPreview} alt="Preview" className="w-full h-full object-contain" />
                      ) : (
                        <>
                          <div className="text-4xl mb-2 text-gray-600">+</div>
                          <span className="text-sm text-gray-400">이미지 파일을 드래그하거나 클릭하여 업로드</span>
                        </>
                      )}
                    </div>
                    <button
                      onClick={handleSynthesizePerson}
                      disabled={!uploadFile || synthesisLoading}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg disabled:opacity-50 transition-colors"
                    >
                      {synthesisLoading ? '합성 진행중...' : '합성 시작하기'}
                    </button>
                    <div className="flex gap-4">
                      <button onClick={() => setSynthesisMode(null)} className="text-xs text-gray-500 hover:text-gray-300 underline">
                        뒤로 가기
                      </button>
                    </div>
                  </div>
                </div>
              </>,
              document.body
            )}
            {/* 🔥 필터 모달 (Fixed Position + Vertical Sidebar) - Portal 사용 */}
            {showPersonModal && synthesisMode === 'person' && createPortal(
              <>
                <div
                  className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]"
                  onClick={() => setShowPersonModal(false)}
                />
                아
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
                    <div className="flex gap-2">
                      <button onClick={() => setSynthesisMode(null)} className="text-xs text-gray-400 hover:text-white px-2 py-1 border border-gray-700 rounded">뒤로</button>
                      <button onClick={() => setShowPersonModal(false)} className="text-gray-400 hover:text-white transition-colors p-1">✕</button>
                    </div>
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
                            <img src={person.url} alt={person.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />

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
                          + 더보기 ({filteredPeople.length - visiblePeopleCount})
                        </button>
                      )}

                      {filteredPeople.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs">
                          <span>인물 없음</span>
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
                          진행중...
                        </>
                      ) : (
                        '합성'
                      )}
                    </button>
                  </div>
                </div>
              </>,
              document.body // 🔥 Render directly to Body
            )}
          </div>
        </div>
      </div>
      {/* 멤버 목록 모달 추가 (ID 가드) */}
      {currentProject?.id && (
        <MemberListModal
          isOpen={showMemberModal}
          onClose={() => setShowMemberModal(false)}
          projectId={currentProject.id}
          currentUser={user?.username || 'anonymous'}
          isAdmin={user?.username === 'admin'}
        />
      )}

      {/* 멤버 초대 모달 추가 (ID 가드) */}
      {currentProject?.id && (
        <InviteMemberModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          projectId={currentProject.id}
          currentUser={user?.username || 'anonymous'}
        />
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
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import UserManagement from './UserManagement';
import PersonManagement from './PersonManagement';

const AdminPanel = ({ currentUser }) => {
  // ===== 상태 관리 =====
  const [activeMainTab, setActiveMainTab] = useState('prompts'); // prompts, engines, storage, users

  // 프롬프트 관리 (12개 엔진 조합 매트릭스)
  const [selectedImageEngine, setSelectedImageEngine] = useState('seedream-v4');
  const [selectedVideoEngine, setSelectedVideoEngine] = useState('hailuo-2.3-standard');
  const [selectedPromptType, setSelectedPromptType] = useState('manual'); // auto_product, auto_service, manual
  const [allPrompts, setAllPrompts] = useState({}); // { 'engineId': { 'manual': '...', ... } }
  const [currentPrompt, setCurrentPrompt] = useState('');

  // 기존 히스토리/디자인 상태 (그대로 유지)
  const [prompts, setPrompts] = useState({}); // 구버전 호환용 (필요시 제거 예정이나 지금은 유지)
  const [activePromptTab, setActivePromptTab] = useState('');
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [geminiResponses, setGeminiResponses] = useState([]);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [testMode, setTestMode] = useState(false);
  const [testFormData, setTestFormData] = useState({
    brandName: '테스트 브랜드',
    industryCategory: '전자제품',
    productServiceCategory: '스마트폰',
    productServiceName: '갤럭시 S24',
    videoPurpose: '제품',
    videoLength: '10초',
    coreTarget: '20-30대 직장인',
    coreDifferentiation: '최신 AI 카메라 기능',
    aspectRatioCode: 'widescreen_16_9'
  });

  // 엔진 관리 상태
  const [currentEngines, setCurrentEngines] = useState(null);
  const [availableEngines, setAvailableEngines] = useState(null);
  const [engineHistory, setEngineHistory] = useState([]);
  const [loadingEngines, setLoadingEngines] = useState(false);
  const [updatingEngine, setUpdatingEngine] = useState(false);
  // selectedEngineType 제거 (더 이상 탭 방식 아님)

  // 저장소 관리 상태
  const [storageInfo, setStorageInfo] = useState(null);
  const [currentPath, setCurrentPath] = useState('');
  const [directoryContents, setDirectoryContents] = useState([]);
  const [storageLoading, setStorageLoading] = useState(false);

  const versionsPerPage = 10;

  // ===== 초기 로드 =====
  useEffect(() => {
    loadEngineInfo();
    loadAllPrompts();
    if (activeMainTab === 'storage') {
      browseDirectory('');
      loadStorageInfo();
    }
  }, [activeMainTab]);

  // ===== 엔진 조합/타입 변경 시 프롬프트 및 히스토리 로드 =====
  useEffect(() => {
    const engineId = `${selectedImageEngine}_${selectedVideoEngine}`;
    const promptKey = selectedPromptType;

    if (allPrompts[engineId] && allPrompts[engineId][promptKey]) {
      setCurrentPrompt(allPrompts[engineId][promptKey]);
    } else {
      setCurrentPrompt('');
    }

    // 🔥 엔진 조합이 바뀌면 히스토리도 새로 로드
    loadVersions(engineId, promptKey);
    loadGeminiResponses(engineId, promptKey);
  }, [selectedImageEngine, selectedVideoEngine, selectedPromptType, allPrompts]);

  useEffect(() => {
    if (Object.keys(prompts).length > 0 && !activePromptTab) {
      // 🔥 수정: manual 우선, 그 다음 auto_product, auto_service
      const keys = Object.keys(prompts);
      const manualKey = keys.find(k => k.includes('_manual'));
      const productKey = keys.find(k => k.includes('_auto_product'));
      const serviceKey = keys.find(k => k.includes('_auto_service'));

      setActivePromptTab(manualKey || productKey || serviceKey || keys[0]);
    }
  }, [prompts, activePromptTab]);

  useEffect(() => {
    if (Object.keys(prompts).length > 0) {
      loadVersions();
    }
  }, [prompts]);

  useEffect(() => {
    if (selectedVersion) {
      const promptKey = selectedVersion.promptKey || getPromptKeyFromVersion(selectedVersion);
      loadGeminiResponses(promptKey);
    }
  }, [selectedVersion]);

  // ===== 엔진 관리 함수 =====
  const loadEngineInfo = async () => {
    setLoadingEngines(true);
    try {
      const response = await fetch('/nexxii/api/engines');
      const data = await response.json();

      if (data.success) {
        setCurrentEngines(data.currentEngine);
        setAvailableEngines(data.availableEngines);
        setEngineHistory(data.engineHistory || []);

        // 🔥 현재 활성화된 엔진으로 프롬프트 매트릭스 선택 동기화
        if (data.currentEngine.textToImage?.model && data.currentEngine.imageToVideo?.model) {
          // ID와 Model이 동일하다고 가정 (또는 engines.json 구조상 호환)
          setSelectedImageEngine(data.currentEngine.textToImage.model);
          setSelectedVideoEngine(data.currentEngine.imageToVideo.model);
        }

        console.log('[AdminPanel] ✅ 엔진 정보 로드 성공');
      } else {
        showMessage('error', '엔진 정보 로드 실패');
      }
    } catch (error) {
      console.error('[AdminPanel] 엔진 정보 로드 오류:', error);
      showMessage('error', '서버 연결 실패');
    } finally {
      setLoadingEngines(false);
    }
  };

  const handleUpdateEngine = async (engineType, newEngineId) => {
    if (!confirm(`엔진을 변경하시겠습니까?\n\n${engineType === 'textToImage' ? '이미지 생성' : '영상 생성'} 엔진을 변경하면 시스템이 자동으로 재시작됩니다.`)) {
      return;
    }

    setUpdatingEngine(true);
    try {
      const response = await fetch('/nexxii/api/engines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': 'admin'
        },
        body: JSON.stringify({
          engineType,
          newEngineId,
          autoRestart: true
        })
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', `✅ 엔진 변경 성공!\n\n이전: ${data.previousEngine}\n새 엔진: ${data.newEngine}\n\n${data.restartResult.success ? '시스템이 재시작되었습니다.' : '재시작은 수동으로 해주세요.'}`);

        setTimeout(() => {
          loadEngineInfo();
        }, 2000);
      } else {
        showMessage('error', `엔진 변경 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('[AdminPanel] 엔진 업데이트 오류:', error);
      showMessage('error', '서버 연결 실패');
    } finally {
      setUpdatingEngine(false);
    }
  };

  // ===== 프롬프트 관리 함수 =====
  const getPromptKeyFromVersion = (version) => {
    if (version.id && version.id.startsWith('current_')) {
      return version.id.replace('current_', '');
    }

    const filename = version.filename || version.id;
    const parts = filename.split('_');
    if (parts.length >= 2) {
      return `${parts[0]}_${parts[1]}`;
    }

    return Object.keys(prompts)[0] || '';
  };

  // 🔥 수정: 프롬프트 탭 이름을 보기 좋게 변환
  const getPromptDisplayName = (promptKey) => {
    if (promptKey.includes('_manual')) return '🎯 Manual 모드';
    if (promptKey.includes('_auto_product')) return '🛍️ Auto - Product';
    if (promptKey.includes('_auto_service')) return '🎨 Auto - Service';
    return promptKey;
  };

  const loadAllPrompts = async () => {
    setPromptLoading(true);
    try {
      const response = await fetch('/nexxii/api/prompts/all');
      const data = await response.json();

      if (data.success) {
        setAllPrompts(data.prompts);
        console.log('[AdminPanel] ✅ 모든 프롬프트 로드 완료');
      } else {
        showMessage('error', '프롬프트 로드 실패');
      }
    } catch (error) {
      console.error('[AdminPanel] 프롬프트 로드 오류:', error);
      showMessage('error', '서버 연결 실패');
    } finally {
      setPromptLoading(false);
    }
  };

  const loadVersions = async (engineId, promptType) => {
    try {
      const id = engineId || `${selectedImageEngine}_${selectedVideoEngine}`;
      const type = promptType || selectedPromptType;

      const response = await fetch(`/nexxii/api/prompts/versions?engineId=${id}&promptType=${type}`);
      const data = await response.json();

      if (data.success) {
        let allVersions = data.versions || [];

        // 현재 편집 중인 내용도 [현재] 항목으로 리스트 상단에 표시 (기존 디자인 유지)
        const currentVersions = [{
          id: `current_${type}`,
          filename: `[현재] ${getPromptDisplayName(type)}`,
          promptKey: type,
          timestamp: new Date().toISOString(),
          preview: currentPrompt?.substring(0, 150) + '...',
          isCurrent: true,
          versionFile: null
        }];

        setVersions([...currentVersions, ...allVersions]);
      } else {
        setVersions([]);
      }
    } catch (error) {
      console.error('버전 로드 실패:', error);
      setVersions([]);
    }
  };

  const loadGeminiResponses = async (engineId, promptType) => {
    try {
      const id = engineId || `${selectedImageEngine}_${selectedVideoEngine}`;
      const type = promptType || selectedPromptType;

      const response = await fetch(`/nexxii/api/prompts/responses/${id}/${type}`);
      const data = await response.json();

      if (data.success) {
        setGeminiResponses(data.responses || []);
      } else {
        setGeminiResponses([]);
      }
    } catch (error) {
      console.error('Gemini 응답 로드 실패:', error);
      setGeminiResponses([]);
    }
  };

  const savePrompt = async () => {
    setSaving(true);
    try {
      const engineId = `${selectedImageEngine}_${selectedVideoEngine}`;

      const response = await fetch('/nexxii/api/prompts/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engineId,
          promptType: selectedPromptType,
          content: currentPrompt
        })
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', '✅ 프롬프트 저장 완료 (버전 자동 생성됨)');
        loadAllPrompts();
        loadVersions(engineId, selectedPromptType);
      } else {
        showMessage('error', data.message || '저장 실패');
      }
    } catch (error) {
      showMessage('error', '서버 연결에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const restoreVersion = async (version) => {
    if (!version.versionFile) return;
    if (!confirm(`이 버전으로 되돌리시겠습니까?\n${version.filename}`)) return;

    try {
      const engineId = `${selectedImageEngine}_${selectedVideoEngine}`;

      const response = await fetch('/nexxii/api/prompts/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: version.id,
          versionFile: version.versionFile,
          engineId,
          promptType: selectedPromptType
        }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', '성공적으로 복원되었습니다.');
        loadAllPrompts();
        loadVersions(engineId, selectedPromptType);
      } else {
        showMessage('error', data.message || '복원에 실패했습니다.');
      }
    } catch (error) {
      showMessage('error', '서버 연결에 실패했습니다.');
    }
  };

  const testPrompt = async () => {
    setTestMode(true);
    setMessage({ type: '', text: '' });

    try {
      showMessage('info', '⏳ 프롬프트 테스트 진행 중...');
      const engineId = `${selectedImageEngine}_${selectedVideoEngine}`;

      const response = await fetch('/nexxii/api/prompts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engineId,
          promptType: selectedPromptType,
          formData: testFormData,
          promptContent: currentPrompt
        })
      });

      const data = await response.json();

      if (data.success) {
        let successMsg = '✅ 프롬프트 테스트 완료!\n\n';
        successMsg += `📝 응답: ${data.response?.length || 0}자\n`;
        successMsg += `⏱️ 처리 시간: ${Math.round(data.processingTime / 1000)}초`;
        successMsg += `\n💾 응답이 히스토리에 저장되었습니다.`;

        showMessage('success', successMsg);

        if (selectedVersion) {
          const promptKeyToRefresh = selectedVersion.promptKey || getPromptKeyFromVersion(selectedVersion);
          loadGeminiResponses(promptKeyToRefresh);
        }
      } else {
        let errorMsg = '❌ 프롬프트 테스트 실패\n\n';
        errorMsg += data.error || '알 수 없는 오류가 발생했습니다.';
        showMessage('error', errorMsg);
      }

    } catch (error) {
      showMessage('error', `❌ 프롬프트 테스트 실패\n\n네트워크 오류: ${error.message}`);
    } finally {
      setTestMode(false);
    }
  };


  const showMessage = (type, text) => {
    setMessage({ type, text });

    if (type !== 'info') {
      setTimeout(() => setMessage({ type: '', text: '' }), 10000);
    }
  };


  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString('ko-KR');
  };

  const handlePromptChange = (value) => {
    setCurrentPrompt(value);

    // allPrompts 객체도 업데이트하여 탭 전환 시 내용 유지
    const engineId = `${selectedImageEngine}_${selectedVideoEngine}`;
    setAllPrompts(prev => ({
      ...prev,
      [engineId]: {
        ...(prev[engineId] || {}),
        [selectedPromptType]: value
      }
    }));
  };

  // ===== 저장소 관리 함수 =====
  const loadStorageInfo = async () => {
    setStorageLoading(true);
    try {
      const response = await fetch('/nexxii/api/storage/info');
      const data = await response.json();
      if (data.success) setStorageInfo(data);
    } catch (error) {
      console.error('저장소 정보 로드 실패:', error);
    } finally {
      setStorageLoading(false);
    }
  };

  const browseDirectory = async (path) => {
    setStorageLoading(true);
    try {
      const response = await fetch(`/nexxii/api/storage/browse?path=${encodeURIComponent(path)}`);
      const data = await response.json();

      if (data.success) {
        setCurrentPath(data.currentPath);
        setDirectoryContents(data.contents);
      } else {
        showMessage('error', data.error || '디렉토리 조회 실패');
      }
    } catch (error) {
      console.error('디렉토리 조회 오류:', error);
    } finally {
      setStorageLoading(false);
    }
  };

  const deleteItem = async (itemPath) => {
    if (!confirm(`정말 삭제하시겠습니까?\n\n${itemPath}`)) return;

    try {
      const response = await fetch('/nexxii/api/storage/browse', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: itemPath })
      });

      const data = await response.json();
      if (data.success) {
        showMessage('success', '✅ 삭제 완료');
        browseDirectory(currentPath);
      } else {
        showMessage('error', data.error || '삭제 실패');
      }
    } catch (error) {
      console.error('삭제 오류:', error);
    }
  };

  const getCurrentPageVersions = () => {
    const startIndex = (currentPage - 1) * versionsPerPage;
    return versions.slice(startIndex, startIndex + versionsPerPage);
  };

  const viewResponseDetail = async (fileName) => {
    try {
      const engineId = `${selectedImageEngine}_${selectedVideoEngine}`;
      const response = await fetch(`/nexxii/api/prompts/responses/detail/${engineId}/${selectedPromptType}/${fileName}`);
      const data = await response.json();

      if (data.success) {
        setSelectedResponse(data.detail);
      } else {
        showMessage('error', '상세 내용을 가져오는데 실패했습니다.');
      }
    } catch (error) {
      console.error('응답 상세 로드 실패:', error);
      showMessage('error', '서버 연결 실패');
    }
  };

  const totalPages = Math.ceil(versions.length / versionsPerPage);

  // ===== 렌더링 =====
  if (loading || loadingEngines) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <div className="max-w-full mx-auto py-6 px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">관리자 패널</h1>
          <p className="text-gray-400">시스템 엔진, 프롬프트, 저장소 및 사용자를 관리합니다</p>
        </div>

        {/* 메인 탭 네비게이션 */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'prompts', label: '📝 프롬프트 관리' },
            { id: 'engines', label: '🎨 엔진 관리' },
            { id: 'persons', label: '👤 인물 관리' },
            { id: 'storage', label: '💾 저장소 관리' },
            { id: 'users', label: '👥 사용자 관리' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveMainTab(tab.id)}
              className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${activeMainTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 전역 메시지 표시 */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg whitespace-pre-wrap flex justify-between items-center ${message.type === 'success'
            ? 'bg-green-900/30 text-green-300 border border-green-800'
            : message.type === 'info'
              ? 'bg-blue-900/30 text-blue-300 border border-blue-800'
              : 'bg-red-900/30 text-red-300 border border-red-800'
            }`}>
            <span>{message.text}</span>
            <button onClick={() => setMessage({ type: '', text: '' })} className="text-current opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* 1. 프롬프트 관리 탭 */}
        {activeMainTab === 'prompts' && (
          <div className="space-y-6">
            {/* 엔진 선택 매트릭스 */}
            <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700 p-6">
              <h2 className="text-xl font-bold text-white mb-4">🎯 엔진 조합 선택 (12가지 매트릭스)</h2>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h3 className="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wider">이미지 생성 엔진</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {['seedream-v4', 'mystic', 'hyperflux'].map(id => (
                      <button
                        key={id}
                        onClick={() => setSelectedImageEngine(id)}
                        className={`px-4 py-3 rounded-lg text-left transition-all ${selectedImageEngine === id
                          ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-800'
                          : 'bg-gray-900/50 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
                          }`}
                      >
                        <div className="font-medium text-sm">
                          {id === 'seedream-v4' ? 'Seedream v4' : id === 'mystic' ? 'Mystic AI' : 'HyperFlux'}
                        </div>
                        <div className="text-[10px] opacity-60 font-mono mt-0.5">{id}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-purple-400 mb-3 uppercase tracking-wider">영상 생성 엔진</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {['kling-v2-5-pro', 'kling-v2-1-std', 'kling-v2-1-master', 'hailuo-2.3-standard'].map(id => (
                      <button
                        key={id}
                        onClick={() => setSelectedVideoEngine(id)}
                        className={`px-4 py-3 rounded-lg text-left transition-all ${selectedVideoEngine === id
                          ? 'bg-purple-600 text-white ring-2 ring-purple-400 ring-offset-2 ring-offset-gray-800'
                          : 'bg-gray-900/50 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
                          }`}
                      >
                        <div className="font-medium text-sm">
                          {id === 'kling-v2-5-pro' ? 'Kling v2.5 Pro' : id.includes('kling') ? `Kling v2.1 (${id.split('-').pop()})` : 'Hailuo 2.3 (MiniMax)'}
                        </div>
                        <div className="text-[10px] opacity-60 font-mono mt-0.5">{id}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 메인 편집 영역 (3단 구성) */}
            <div className="grid grid-cols-12 gap-6">
              {/* 좌측: 버전 히스토리 */}
              <div className="col-span-3">
                <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700 sticky top-20">
                  <div className="px-4 py-3 border-b border-gray-700 flex justify-between items-center">
                    <div>
                      <h3 className="text-sm font-bold text-white">버전 히스토리</h3>
                      <p className="text-[10px] text-gray-500">자동 저장된 이력</p>
                    </div>
                    <button onClick={() => loadVersions()} className="text-gray-500 hover:text-white">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                  </div>
                  <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {versions.map(v => (
                      <div
                        key={v.id}
                        onClick={() => setSelectedVersion(v)}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-all ${selectedVersion?.id === v.id
                          ? 'bg-blue-600/20 border-blue-500 shadow-inner'
                          : v.isCurrent ? 'bg-green-900/10 border-green-800/50 hover:bg-green-900/20' : 'bg-gray-900/30 border-gray-800 hover:bg-gray-800'
                          }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-[11px] font-bold ${v.isCurrent ? 'text-green-400' : 'text-gray-300'}`}>
                            {v.isCurrent ? '⚡ CURRENT' : v.filename.split('_').pop().replace('.txt', '')}
                          </span>
                          {!v.isCurrent && (
                            <button
                              onClick={(e) => { e.stopPropagation(); restoreVersion(v); }}
                              className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100"
                            >복원</button>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500">{formatDateTime(v.timestamp)}</div>
                      </div>
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="p-3 border-t border-gray-700 flex justify-center gap-2">
                      <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="text-xs text-gray-400">Prev</button>
                      <span className="text-xs text-gray-600">{currentPage}/{totalPages}</span>
                      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="text-xs text-gray-400">Next</button>
                    </div>
                  )}
                </div>
              </div>

              {/* 중앙: 프롬프트 편집기 */}
              <div className="col-span-6">
                <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700 overflow-hidden">
                  <div className="bg-gray-900/50 px-6 py-4 border-b border-gray-700 flex justify-between items-center">
                    <div className="flex gap-1 bg-gray-950 p-1 rounded-lg border border-gray-800">
                      {['auto_product', 'auto_service', 'manual'].map(type => (
                        <button
                          key={type}
                          onClick={() => setSelectedPromptType(type)}
                          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedPromptType === type
                            ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'}`}
                        >
                          {type.split('_').pop().toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={testPrompt}
                        disabled={testMode}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                      >
                        {testMode ? 'TESTING...' : '🚀 TEST'}
                      </button>
                      <button
                        onClick={savePrompt}
                        disabled={saving}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                      >
                        {saving ? 'SAVING...' : '💾 SAVE'}
                      </button>
                    </div>
                  </div>
                  <div className="p-0 relative">
                    <textarea
                      value={currentPrompt}
                      onChange={(e) => handlePromptChange(e.target.value)}
                      className="w-full h-[65vh] p-6 bg-[#0E0E10] text-gray-300 font-mono text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      placeholder="프롬프트 내용을 입력하세요..."
                      spellCheck="false"
                    />
                    <div className="absolute top-2 right-4 text-[10px] font-mono text-gray-700 select-none">
                      {currentPrompt?.length || 0} chars
                    </div>
                  </div>
                </div>
              </div>

              {/* 우측: Gemini 응답 로그 */}
              <div className="col-span-3">
                <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700 sticky top-20">
                  <div className="px-4 py-3 border-b border-gray-700">
                    <h3 className="text-sm font-bold text-white">Gemini 응답 로그</h3>
                    <p className="text-[10px] text-gray-500">최근 생성 결과</p>
                  </div>
                  <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {geminiResponses.length === 0 ? (
                      <div className="py-12 text-center text-gray-600 text-xs">응답 내역이 없습니다.</div>
                    ) : (
                      geminiResponses.map(res => (
                        <div
                          key={res.fileName}
                          onClick={() => viewResponseDetail(res.fileName)}
                          className="p-3 bg-gray-900/50 border border-gray-800 rounded-lg hover:border-gray-600 cursor-pointer group transition-all"
                        >
                          <div className="flex justify-between items-start mb-1.5">
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded">
                              {res.step?.replace('storyboard_', '').toUpperCase() || 'RESULT'}
                            </span>
                            <span className="text-[9px] text-gray-600">{formatDateTime(res.timestamp)}</span>
                          </div>
                          <p className="text-[11px] text-gray-400 line-clamp-3 leading-relaxed">
                            {res.preview}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. 엔진 관리 탭 */}
        {activeMainTab === 'engines' && currentEngines && availableEngines && (
          <div className="space-y-6">
            {/* 현재 엔진 정보 */}
            <div className="flex gap-4">
              <div className="flex-1 bg-gray-800/90 rounded-lg p-6 border border-gray-700 shadow-xl">
                <h3 className="text-blue-400 font-bold mb-4 flex items-center gap-2">🖼️ 현재 이미지 엔진</h3>
                <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <div className="text-2xl font-bold text-white mb-1">{currentEngines.textToImage.displayName}</div>
                  <div className="text-xs font-mono text-gray-500 mb-4">{currentEngines.textToImage.model}</div>
                  <p className="text-sm text-gray-400 mb-4 leading-relaxed">{currentEngines.textToImage.description}</p>
                  <div className="text-[10px] text-gray-600">최종 업데이트: {formatDateTime(currentEngines.textToImage.updatedAt)} by {currentEngines.textToImage.updatedBy}</div>
                </div>
              </div>
              <div className="flex-1 bg-gray-800/90 rounded-lg p-6 border border-gray-700 shadow-xl">
                <h3 className="text-purple-400 font-bold mb-4 flex items-center gap-2">🎬 현재 영상 엔진</h3>
                <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <div className="text-2xl font-bold text-white mb-1">{currentEngines.imageToVideo.displayName}</div>
                  <div className="text-xs font-mono text-gray-500 mb-4">{currentEngines.imageToVideo.model}</div>
                  <p className="text-sm text-gray-400 mb-4 leading-relaxed">{currentEngines.imageToVideo.description}</p>
                  <div className="text-[10px] text-gray-600">최종 업데이트: {formatDateTime(currentEngines.imageToVideo.updatedAt)} by {currentEngines.imageToVideo.updatedBy}</div>
                </div>
              </div>
            </div>

            {/* 엔진 대교체 (좌우 분할 레이아웃) */}
            <div className="bg-gray-800/90 rounded-lg p-8 border border-gray-700 shadow-xl">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2 underline decoration-blue-500 decoration-4 underline-offset-8">🔄 엔진 대교체</h2>
                <p className="text-gray-500 text-sm">원하는 엔진을 선택하여 즉시 시스템 전체 엔진을 교체합니다.</p>
              </div>

              <div className="grid grid-cols-2 gap-8">
                {/* 이미지 엔진 목록 */}
                <div>
                  <h3 className="text-lg font-black text-blue-400 mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
                    <span>🖼️ IMAGE ENGINES</span>
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {availableEngines['textToImage'].map(engine => {
                      const isCurrent = currentEngines['textToImage'].model === engine.model;
                      return (
                        <div key={engine.id} className={`p-5 rounded-2xl border transition-all ${isCurrent
                          ? 'bg-blue-900/20 border-blue-500 shadow-lg'
                          : 'bg-gray-900/40 border-gray-700 hover:border-gray-500'
                          }`}>
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="text-lg font-bold text-white">{engine.displayName}</h4>
                            {isCurrent && <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full">ACTIVE</span>}
                          </div>
                          <p className="text-xs text-gray-400 mb-4 line-clamp-2">{engine.description}</p>
                          <div className="flex justify-between items-center mt-auto">
                            <span className="font-mono text-[10px] text-gray-600">{engine.model}</span>
                            {!isCurrent && (
                              <button
                                onClick={() => handleUpdateEngine('textToImage', engine.id)}
                                disabled={updatingEngine}
                                className="px-4 py-2 bg-gray-100 hover:bg-blue-500 hover:text-white text-black text-xs font-bold rounded-lg transition-colors"
                              >
                                {updatingEngine ? 'Changing...' : '이 엔진 사용'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 영상 엔진 목록 */}
                <div>
                  <h3 className="text-lg font-black text-purple-400 mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
                    <span>🎬 VIDEO ENGINES</span>
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {availableEngines['imageToVideo'].map(engine => {
                      const isCurrent = currentEngines['imageToVideo'].model === engine.model;
                      return (
                        <div key={engine.id} className={`p-5 rounded-2xl border transition-all ${isCurrent
                          ? 'bg-purple-900/20 border-purple-500 shadow-lg'
                          : 'bg-gray-900/40 border-gray-700 hover:border-gray-500'
                          }`}>
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="text-lg font-bold text-white">{engine.displayName}</h4>
                            {isCurrent && <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold rounded-full">ACTIVE</span>}
                          </div>
                          <p className="text-xs text-gray-400 mb-4 line-clamp-2">{engine.description}</p>
                          <div className="flex justify-between items-center mt-auto">
                            <span className="font-mono text-[10px] text-gray-600">{engine.model}</span>
                            {!isCurrent && (
                              <button
                                onClick={() => handleUpdateEngine('imageToVideo', engine.id)}
                                disabled={updatingEngine}
                                className="px-4 py-2 bg-gray-100 hover:bg-purple-500 hover:text-white text-black text-xs font-bold rounded-lg transition-colors"
                              >
                                {updatingEngine ? 'Changing...' : '이 엔진 사용'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. 인물 관리 탭 */}
        {activeMainTab === 'persons' && <PersonManagement />}

        {/* 4. 저장소 관리 탭 */}
        {activeMainTab === 'storage' && (
          <div className="space-y-6">
            {storageInfo && (
              <div className="bg-gray-800/90 rounded-lg p-6 border border-gray-700 shadow-xl">
                <div className="flex justify-between items-start mb-6">
                  <h2 className="text-xl font-black text-white flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-sm italic">S3</span>
                    AWS Cloud Storage
                  </h2>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Provider</span>
                    <div className="text-sm font-bold text-blue-400">{storageInfo.provider}</div>
                    <div className="text-[10px] font-mono text-gray-600">{storageInfo.bucketName}</div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 mb-8">
                  {[
                    // S3 Usage
                    { label: 'Total Used Storage', value: storageInfo.usage.totalBytesFormatted, sub: `${storageInfo.usage.objectCount} objects`, color: 'text-white' },
                    // Cost
                    { label: 'Est. Cost (Current)', value: `$${storageInfo.cost.currentMonth}`, sub: 'Month-to-Date', color: 'text-orange-500' },
                    { label: 'Est. Cost (Projected)', value: `$${storageInfo.cost.projectedMonth}`, sub: 'End of Month', color: 'text-pink-500' },
                    { label: 'Pricing Tier', value: 'Standard', sub: 'ap-northeast-2', color: 'text-blue-500' }
                  ].map(stat => (
                    <div key={stat.label} className="bg-gray-950 p-5 rounded-2xl border border-gray-800 shadow-inner">
                      <div className="text-[10px] font-black text-gray-600 uppercase mb-1">{stat.label}</div>
                      <div className={`text-2xl font-black ${stat.color} font-mono tracking-tight`}>{stat.value}</div>
                      <div className="text-[10px] font-medium text-gray-500 mt-1">{stat.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold text-gray-500 mb-3 px-2">Key Directories</div>
                  {storageInfo.folders.map(dir => (
                    <div key={dir.name} className="flex justify-between items-center p-3.5 bg-gray-900 shadow-inner rounded-xl border border-gray-800 hover:border-gray-600 transition-all">
                      <div className="flex items-center gap-3">
                        <span className="text-blue-500">BUCKET/</span>
                        <span className="text-gray-200 font-bold">{dir.name}</span>
                      </div>
                      <span className="font-mono text-sm text-gray-400 bg-black px-3 py-1 rounded-md">{dir.sizeFormatted}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-gray-900/50 rounded-xl border border-gray-800">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2">AWS S3 Pricing Info (Seoul)</h4>
                  <div className="grid grid-cols-3 gap-4 text-[11px] text-gray-400 font-mono">
                    <div>0 - 50 TB: <span className="text-white">$0.023</span> / GB</div>
                    <div>50 - 500 TB: <span className="text-white">$0.022</span> / GB</div>
                    <div>500+ TB: <span className="text-white">$0.021</span> / GB</div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gray-800/90 rounded-lg p-6 border border-gray-700 shadow-xl overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-black">/PREFIX:</span>
                  <span className="bg-gray-950 px-4 py-2 rounded-lg font-mono text-sm text-green-400 border border-gray-800">
                    {currentPath || '(root)'}
                  </span>
                </div>
                {currentPath && currentPath !== '' && (
                  <button
                    onClick={() => {
                      const parts = currentPath.split('/').filter(p => p);
                      parts.pop();
                      const parent = parts.length > 0 ? parts.join('/') + '/' : '';
                      browseDirectory(parent);
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs font-black">
                    ⬆ UP
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-1">
                {directoryContents.length === 0 ? <div className="p-12 text-center text-gray-600 italic">No objects found.</div> :
                  directoryContents.map(item => (
                    <div key={item.path} className="flex justify-between items-center p-3 hover:bg-gray-700/50 rounded-xl group transition-all">
                      <div className="flex items-center gap-4 cursor-pointer" onClick={() => item.isDirectory && browseDirectory(item.path)}>
                        <span className="text-2xl filter drop-shadow-md">{item.isDirectory ? '📁' : '📄'}</span>
                        <div>
                          <div className="text-sm font-bold text-gray-200 group-hover:text-blue-400">{item.name}</div>
                          <div className="text-[10px] text-gray-600">
                            {!item.isDirectory && `${(item.size / 1024).toFixed(1)} KB • `}
                            {item.modified ? formatDateTime(item.modified) : '-'}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.isDirectory ? (
                          <button onClick={() => browseDirectory(item.path)} className="p-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg text-[10px] font-black">OPEN</button>
                        ) : (
                          <button
                            onClick={() => {
                              // CloudFront URL Construction
                              // item.path is the specific S3 Key (e.g., "nexxii-storage/projects/...")
                              // We just need to append it to the domain.
                              const cdnUrl = `https://upnexx.ai/${item.path}`;
                              console.log('[S3 Download] Opening URL:', cdnUrl);
                              window.open(cdnUrl, '_blank');
                            }}
                            className="p-2 bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded-lg text-[10px] font-black"
                            title="Download/Open via CloudFront"
                          >
                            VIEW
                          </button>
                        )}
                        {item.deletable && (
                          <button onClick={() => deleteItem(item.path)} className="p-2 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white rounded-lg text-[10px] font-black">DELETE</button>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        )}

        {/* 4. 사용자 관리 탭 */}
        {activeMainTab === 'users' && (
          <UserManagement currentUser={currentUser} />
        )}
      </div>

      {/* 응답 상세보기 모달 (공통) */}
      {selectedResponse && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] px-4">
          <div className="bg-[#121214] rounded-3xl shadow-2xl max-w-5xl w-full border border-gray-700/50 overflow-hidden scale-in">
            <div className="px-8 py-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/40">
              <div>
                <h3 className="text-xl font-black text-white">GEMINI INTELLIGENCE LOG</h3>
                <p className="text-xs text-blue-500 font-mono mt-1">Generated: {formatDateTime(selectedResponse.timestamp)}</p>
              </div>
              <button onClick={() => setSelectedResponse(null)} className="w-10 h-10 rounded-full bg-gray-800 hover:bg-red-600 text-white flex items-center justify-center transition-all">✕</button>
            </div>
            <div className="p-8 grid grid-cols-2 gap-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                <h4 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">Input Parameters</h4>
                <div className="bg-gray-950 rounded-2xl p-6 border border-gray-800 shadow-inner overflow-hidden">
                  <pre className="text-[12px] font-mono text-blue-300 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedResponse.formData || selectedResponse.input || {}, null, 2)}
                  </pre>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">Generated Output</h4>
                <div className="bg-gray-950 rounded-2xl p-6 border border-gray-800 shadow-inner overflow-hidden">
                  <div className="text-[13px] font-serif italic text-gray-400 leading-loose whitespace-pre-wrap selection:bg-blue-600/50">
                    {selectedResponse.response || selectedResponse.rawResponse || '(No response data)'}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-8 py-4 border-t border-gray-800 bg-gray-950 flex justify-center">
              <button onClick={() => setSelectedResponse(null)} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs transition-all shadow-lg shadow-blue-900/30">CLOSE INSPECTOR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

AdminPanel.propTypes = {
  currentUser: PropTypes.shape({
    username: PropTypes.string.isRequired,
    role: PropTypes.string
  })
};

export default AdminPanel;

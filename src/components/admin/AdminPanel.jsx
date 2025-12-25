import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import UserManagement from './UserManagement';

const AdminPanel = () => {
  // ===== 상태 관리 =====
  const [activeMainTab, setActiveMainTab] = useState('engines');

  // 저장소 관리 상태
  const [storageInfo, setStorageInfo] = useState(null);
  const [currentPath, setCurrentPath] = useState('.');
  const [directoryContents, setDirectoryContents] = useState([]);
  const [storageLoading, setStorageLoading] = useState(false);

  // 프롬프트 관리 상태
  const [prompts, setPrompts] = useState({});
  const [activePromptTab, setActivePromptTab] = useState('');
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [geminiResponses, setGeminiResponses] = useState([]);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [loading, setLoading] = useState(false);
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
  const [selectedEngineType, setSelectedEngineType] = useState('textToImage');

  const versionsPerPage = 10;

  // ===== 엔진 정보 로드 =====
  useEffect(() => {
    loadEngineInfo();
  }, []);

  // ===== 프롬프트 로드 =====
  useEffect(() => {
    if (activeMainTab === 'prompts') {
      loadPrompts();
    }
  }, [activeMainTab]);

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

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/nexxii/api/prompts/get');
      const data = await response.json();

      if (data.success) {
        setPrompts(data.prompts);
        console.log('[AdminPanel] ✅ 프롬프트 로드:', Object.keys(data.prompts));
      } else {
        showMessage('error', '프롬프트 로드에 실패했습니다.');
      }
    } catch (error) {
      showMessage('error', '서버 연결에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async () => {
    try {
      const response = await fetch('/nexxii/api/prompts/versions');
      const data = await response.json();

      if (data.success) {
        let allVersions = data.versions || [];

        const currentVersions = Object.keys(prompts).map(key => ({
          id: `current_${key}`,
          filename: `[현재] ${getPromptDisplayName(key)}`,
          promptKey: key,
          timestamp: new Date().toISOString(),
          preview: prompts[key]?.substring(0, 150) + '...',
          isCurrent: true,
          versionFile: null
        }));

        setVersions([...currentVersions, ...allVersions]);
      } else {
        showMessage('error', '버전 목록 로드에 실패했습니다.');
      }
    } catch (error) {
      showMessage('error', '서버 연결에 실패했습니다.');
    }
  };

  const loadGeminiResponses = async (promptKey) => {
    try {
      const response = await fetch(`/nexxii/api/prompts/responses/${promptKey}`);
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

  const savePrompt = async (filename) => {
    setSaving(true);
    try {
      const response = await fetch('/nexxii/api/prompts/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          content: prompts[filename]
        }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', '프롬프트가 성공적으로 저장되었습니다.');
        loadVersions();
      } else {
        showMessage('error', data.message || '저장에 실패했습니다.');
      }
    } catch (error) {
      showMessage('error', '서버 연결에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const restoreVersion = async (version) => {
    if (!version.versionFile) {
      showMessage('error', '복원할 버전 파일이 없습니다.');
      return;
    }

    if (!confirm(`이 버전으로 되돌리시겠습니까?\n${version.filename}`)) return;

    try {
      const promptKey = getPromptKeyFromVersion(version);

      const response = await fetch('/nexxii/api/prompts/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          versionId: version.id,
          versionFile: version.versionFile,
          promptKey: promptKey
        }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', '성공적으로 복원되었습니다.');
        setActivePromptTab(promptKey);
        loadPrompts();
        loadVersions();
      } else {
        showMessage('error', data.message || '복원에 실패했습니다.');
      }
    } catch (error) {
      showMessage('error', '서버 연결에 실패했습니다.');
    }
  };

  const testPrompt = async (promptKey) => {
    setTestMode(true);
    setMessage({ type: '', text: '' });

    try {
      showMessage('info', '⏳ 프롬프트 테스트 진행 중...');

      const response = await fetch('/nexxii/api/prompts/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          promptKey,
          formData: testFormData,
          promptContent: prompts[promptKey]
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

  const viewResponseDetail = async (fileName) => {
    try {
      const response = await fetch(`/nexxii/api/prompts/response-detail/${fileName}`);
      const data = await response.json();

      if (data.success) {
        setSelectedResponse(data.data);
      }
    } catch (error) {
      showMessage('error', '응답 상세 정보 로드에 실패했습니다.');
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });

    if (type !== 'info') {
      setTimeout(() => setMessage({ type: '', text: '' }), 10000);
    }
  };

  const handlePromptChange = (filename, value) => {
    setPrompts(prev => ({
      ...prev,
      [filename]: value
    }));
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString('ko-KR');
  };

  const getCurrentPageVersions = () => {
    const startIndex = (currentPage - 1) * versionsPerPage;
    return versions.slice(startIndex, startIndex + versionsPerPage);
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
          <p className="text-gray-400">시스템 엔진 및 프롬프트를 관리합니다</p>
        </div>

        {/* 메인 탭 */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveMainTab('engines')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${activeMainTab === 'engines'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            🎨 엔진 관리
          </button>
          <button
            onClick={() => setActiveMainTab('prompts')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${activeMainTab === 'prompts'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            📝 프롬프트 관리
          </button>
          <button
            onClick={() => setActiveMainTab('storage')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${activeMainTab === 'storage'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            💾 저장소 관리
          </button>
          <button
            onClick={() => setActiveMainTab('users')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${activeMainTab === 'users'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            👥 사용자 관리
          </button>
        </div>

        {message.text && (
          <div className={`mb-6 p-4 rounded-lg whitespace-pre-wrap ${message.type === 'success'
            ? 'bg-green-900/30 text-green-300 border border-green-800'
            : message.type === 'info'
              ? 'bg-blue-900/30 text-blue-300 border border-blue-800'
              : 'bg-red-900/30 text-red-300 border border-red-800'
            }`}>
            {message.text}
          </div>
        )}

        {/* ===== 엔진 관리 탭 ===== */}
        {activeMainTab === 'engines' && currentEngines && availableEngines && (
          <div className="space-y-6">
            {/* 현재 엔진 정보 */}
            <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700 p-6">
              <h2 className="text-xl font-bold text-white mb-4">🎯 현재 사용 중인 엔진</h2>

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <h3 className="text-lg font-semibold text-blue-400 mb-2">🖼️ 이미지 생성</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">모델:</span>
                      <span className="text-white font-medium">{currentEngines.textToImage.displayName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">ID:</span>
                      <span className="text-gray-300 font-mono text-xs">{currentEngines.textToImage.model}</span>
                    </div>
                    <div className="text-gray-400 text-xs mt-2">{currentEngines.textToImage.description}</div>
                    <div className="text-gray-500 text-xs mt-2">
                      업데이트: {formatDateTime(currentEngines.textToImage.updatedAt)}
                      <br />by {currentEngines.textToImage.updatedBy}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <h3 className="text-lg font-semibold text-purple-400 mb-2">🎬 영상 생성</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">모델:</span>
                      <span className="text-white font-medium">{currentEngines.imageToVideo.displayName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">ID:</span>
                      <span className="text-gray-300 font-mono text-xs">{currentEngines.imageToVideo.model}</span>
                    </div>
                    <div className="text-gray-400 text-xs mt-2">{currentEngines.imageToVideo.description}</div>
                    <div className="text-gray-500 text-xs mt-2">
                      업데이트: {formatDateTime(currentEngines.imageToVideo.updatedAt)}
                      <br />by {currentEngines.imageToVideo.updatedBy}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 엔진 변경 */}
            <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700 p-6">
              <h2 className="text-xl font-bold text-white mb-4">🔄 엔진 변경</h2>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setSelectedEngineType('textToImage')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedEngineType === 'textToImage'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                  🖼️ 이미지 생성 엔진
                </button>
                <button
                  onClick={() => setSelectedEngineType('imageToVideo')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedEngineType === 'imageToVideo'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                  🎬 영상 생성 엔진
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableEngines[selectedEngineType].map(engine => {
                  const isCurrent = currentEngines[selectedEngineType].model === engine.model;

                  return (
                    <div
                      key={engine.id}
                      className={`bg-gray-900/50 rounded-lg p-4 border transition-all ${isCurrent
                        ? 'border-green-600 bg-green-900/20'
                        : 'border-gray-700 hover:border-gray-600'
                        }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-white font-semibold">{engine.displayName}</h3>
                        {isCurrent && (
                          <span className="px-2 py-1 text-xs bg-green-600 text-white rounded">현재</span>
                        )}
                      </div>

                      <p className="text-gray-400 text-xs mb-3">{engine.description}</p>

                      <div className="text-xs text-gray-500 space-y-1 mb-3">
                        <div>모델 ID: <span className="font-mono">{engine.model}</span></div>
                        {engine.maxResolution && <div>최대 해상도: {engine.maxResolution}</div>}
                        {engine.supportedDurations && (
                          <div>지원 길이: {engine.supportedDurations.join(', ')}초</div>
                        )}
                        {engine.costPerImage && <div>비용: ${engine.costPerImage}/image</div>}
                        {engine.costPerVideo && <div>비용: ${engine.costPerVideo}/video</div>}
                      </div>

                      {!isCurrent && (
                        <button
                          onClick={() => handleUpdateEngine(selectedEngineType, engine.id)}
                          disabled={updatingEngine}
                          className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          {updatingEngine ? '변경 중...' : '이 엔진으로 변경'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 엔진 변경 히스토리 */}
            {engineHistory.length > 0 && (
              <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700 p-6">
                <h2 className="text-xl font-bold text-white mb-4">📜 변경 히스토리</h2>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {engineHistory.slice(0, 20).map((entry, index) => (
                    <div
                      key={index}
                      className="bg-gray-900/50 rounded-lg p-3 border border-gray-700 text-sm"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-gray-400">
                          {entry.engineType === 'textToImage' ? '🖼️ 이미지' : '🎬 영상'} 엔진 변경
                        </span>
                        <span className="text-gray-500 text-xs">{formatDateTime(entry.timestamp)}</span>
                      </div>
                      <div className="text-gray-300">
                        <span className="text-red-400">{entry.previousEngine}</span>
                        {' → '}
                        <span className="text-green-400">{entry.newEngine}</span>
                      </div>
                      <div className="text-gray-500 text-xs mt-1">by {entry.updatedBy}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== 프롬프트 관리 탭 ===== */}
        {activeMainTab === 'prompts' && Object.keys(prompts).length > 0 && (
          <div className="grid grid-cols-12 gap-6">
            {/* 버전 히스토리 */}
            <div className="col-span-3">
              <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700">
                <div className="px-4 py-3 border-b border-gray-700">
                  <h3 className="text-lg font-medium text-white">버전 히스토리</h3>
                  <p className="text-sm text-gray-400">프롬프트 수정 이력</p>
                </div>

                <div className="p-4">
                  {versions.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">버전 히스토리가 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {getCurrentPageVersions().map((version) => (
                        <div
                          key={version.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors relative group
                            ${version.isCurrent
                              ? 'border-green-600 bg-green-900/20'
                              : selectedVersion?.id === version.id
                                ? 'border-blue-600 bg-blue-900/20'
                                : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'}`}
                          onClick={() => setSelectedVersion(version)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className={`text-sm font-medium line-clamp-1
                              ${version.isCurrent ? 'text-green-400 font-bold' : 'text-gray-200'}`}>
                              {version.filename}
                            </span>
                            {version.versionFile && !version.isCurrent && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  restoreVersion(version);
                                }}
                                className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                되돌리기
                              </button>
                            )}
                            {version.isCurrent && (
                              <span className="ml-2 px-2 py-1 text-xs bg-green-600 text-white rounded">
                                현재
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {formatDateTime(version.timestamp)}
                          </p>
                          {version.preview && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                              {version.preview}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {totalPages > 1 && (
                    <div className="mt-4 flex justify-center space-x-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 text-sm border border-gray-700 rounded disabled:opacity-50 text-gray-300 hover:bg-gray-800"
                      >
                        이전
                      </button>
                      <span className="px-3 py-1 text-sm text-gray-400">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 text-sm border border-gray-700 rounded disabled:opacity-50 text-gray-300 hover:bg-gray-800"
                      >
                        다음
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 프롬프트 편집기 */}
            <div className="col-span-6">
              <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700">
                <div className="px-4 py-3 border-b border-gray-700">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.keys(prompts).map((key) => (
                      <button
                        key={key}
                        onClick={() => setActivePromptTab(key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activePromptTab === key
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                      >
                        {getPromptDisplayName(key)}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium text-white">{getPromptDisplayName(activePromptTab)}</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => testPrompt(activePromptTab)}
                        disabled={testMode}
                        className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                      >
                        {testMode ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            테스트 중...
                          </>
                        ) : '프롬프트 테스트'}
                      </button>
                      <button
                        onClick={() => savePrompt(activePromptTab)}
                        disabled={saving}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 disabled:opacity-50"
                      >
                        {saving ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={prompts[activePromptTab] || ''}
                    onChange={(e) => handlePromptChange(activePromptTab, e.target.value)}
                    className="w-full h-96 p-4 bg-gray-900 border border-gray-700 rounded-lg font-mono text-sm text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-4"
                    placeholder="프롬프트 내용을 입력하세요..."
                  />

                  <div className="mt-4 flex items-center text-sm text-gray-500">
                    <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    저장하면 서버의 파일이 즉시 업데이트되며 버전이 자동으로 백업됩니다.
                  </div>
                </div>
              </div>
            </div>

            {/* Gemini 응답 */}
            <div className="col-span-3">
              <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700">
                <div className="px-4 py-3 border-b border-gray-700">
                  <h3 className="text-lg font-medium text-white">Gemini 응답</h3>
                  <p className="text-sm text-gray-400">
                    {selectedVersion ? selectedVersion.filename : '버전을 선택하세요'}
                  </p>
                </div>

                <div className="p-4">
                  {!selectedVersion ? (
                    <p className="text-gray-500 text-center py-8">좌측에서 버전을 선택하세요.</p>
                  ) : geminiResponses.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      해당 프롬프트의 응답 히스토리가 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {geminiResponses.map((response) => (
                        <div
                          key={response.fileName}
                          className="p-3 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer bg-gray-900/50"
                          onClick={() => viewResponseDetail(response.fileName)}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-medium text-green-400">
                              {response.step?.toUpperCase() || 'RESPONSE'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDateTime(response.timestamp)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 line-clamp-3">
                            {response.preview}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 응답 상세보기 모달 */}
        {selectedResponse && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden border border-gray-700">
              <div className="px-6 py-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-white">
                    Gemini 응답 상세보기
                  </h3>
                  <button
                    onClick={() => setSelectedResponse(null)}
                    className="text-gray-400 hover:text-white"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[75vh]">
                <div className="mb-6">
                  <h4 className="font-medium text-white mb-2 flex items-center">
                    <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded mr-2">1</span>
                    입력 데이터
                  </h4>
                  <pre className="bg-gray-900 p-4 rounded-lg text-sm overflow-x-auto text-gray-300">
                    {JSON.stringify(selectedResponse.formData || selectedResponse.input || {}, null, 2)}
                  </pre>
                </div>

                <div className="mb-6">
                  <h4 className="font-medium text-white mb-2 flex items-center">
                    <span className="bg-green-600 text-white text-xs px-2 py-1 rounded mr-2">2</span>
                    응답
                  </h4>
                  <div className="bg-gray-900 p-4 rounded-lg">
                    <pre className="whitespace-pre-wrap text-sm text-gray-300">
                      {selectedResponse.response || selectedResponse.rawResponse || '(응답 데이터 없음)'}
                    </pre>
                  </div>
                </div>

                <div className="mt-4 text-xs text-gray-500 text-center">
                  생성 시간: {formatDateTime(selectedResponse.timestamp || new Date())}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

AdminPanel.propTypes = {};

export default AdminPanel;

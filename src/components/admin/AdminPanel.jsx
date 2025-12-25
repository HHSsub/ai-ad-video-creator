import { useState, useEffect } from 'react';
import UserManagement from './UserManagement'; // 🔥 사용자 관리 컴포넌트

const API_BASE = '/nexxii';

const AdminPanel = () => {
  // ===== 메인 탭 상태 =====
  const [activeSubTab, setActiveSubTab] = useState('prompts'); // prompts, engines, storage

  // ===== 프롬프트 관리 상태 =====
  const [selectedImageEngine, setSelectedImageEngine] = useState('seedream-v4');
  const [selectedVideoEngine, setSelectedVideoEngine] = useState('hailuo-2.3-standard');
  const [selectedPromptType, setSelectedPromptType] = useState('manual'); // auto_product, auto_service, manual
  const [allPrompts, setAllPrompts] = useState({});
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);

  // ===== 엔진 관리 상태 =====
  const [currentEngines, setCurrentEngines] = useState(null);
  const [availableEngines, setAvailableEngines] = useState(null);
  const [engineHistory, setEngineHistory] = useState([]);
  const [loadingEngines, setLoadingEngines] = useState(false);
  const [updatingEngine, setUpdatingEngine] = useState(false);
  const [selectedEngineType, setSelectedEngineType] = useState('textToImage');

  // ===== 저장소 관리 상태 =====
  const [storageInfo, setStorageInfo] = useState(null);
  const [currentPath, setCurrentPath] = useState('.');
  const [directoryContents, setDirectoryContents] = useState([]);
  const [storageLoading, setStorageLoading] = useState(false);

  // ===== 공통 상태 =====
  const [message, setMessage] = useState({ type: '', text: '' });

  // ===== 초기 로드 =====
  useEffect(() => {
    loadEngineInfo();
    loadAllPrompts();
    loadStorageInfo();
  }, []);

  // ===== 엔진 조합 변경 시 프롬프트 로드 =====
  useEffect(() => {
    const engineId = `${selectedImageEngine}_${selectedVideoEngine}`;
    const promptKey = selectedPromptType;

    if (allPrompts[engineId] && allPrompts[engineId][promptKey]) {
      setCurrentPrompt(allPrompts[engineId][promptKey]);
    } else {
      setCurrentPrompt('');
    }
  }, [selectedImageEngine, selectedVideoEngine, selectedPromptType, allPrompts]);

  // ===== API 함수들 =====

  const showMessage = (type, text) => {
    setMessage({ type, text });
    if (type !== 'info') {
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    }
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString('ko-KR');
  };

  // 프롬프트 관리
  const loadAllPrompts = async () => {
    setPromptLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/prompts/all`);
      const data = await response.json();

      if (data.success) {
        setAllPrompts(data.prompts);
        console.log('[AdminPanel] ✅ 모든 프롬프트 로드:', data.engines);
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

  const savePrompt = async () => {
    setPromptSaving(true);
    try {
      const engineId = `${selectedImageEngine}_${selectedVideoEngine}`;

      const response = await fetch(`${API_BASE}/api/prompts/update`, {
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
        showMessage('success', '✅ 프롬프트 저장 완료');
        loadAllPrompts();
      } else {
        showMessage('error', data.error || '저장 실패');
      }
    } catch (error) {
      console.error('[AdminPanel] 저장 오류:', error);
      showMessage('error', '서버 연결 실패');
    } finally {
      setPromptSaving(false);
    }
  };

  // 엔진 관리
  const loadEngineInfo = async () => {
    setLoadingEngines(true);
    try {
      const response = await fetch(`${API_BASE}/api/engines`);
      const data = await response.json();

      if (data.success) {
        setCurrentEngines(data.currentEngine);
        setAvailableEngines(data.availableEngines);
        setEngineHistory(data.engineHistory || []);
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
      const response = await fetch(`${API_BASE}/api/engines`, {
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
        showMessage('success', `✅ 엔진 변경 성공!\n\n이전: ${data.previousEngine}\n새 엔진: ${data.newEngine}`);
        setTimeout(() => loadEngineInfo(), 2000);
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

  // 저장소 관리
  const loadStorageInfo = async () => {
    setStorageLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/storage/info`);
      const data = await response.json();

      if (data.success) {
        setStorageInfo(data);
      } else {
        showMessage('error', '저장소 정보 로드 실패');
      }
    } catch (error) {
      console.error('[AdminPanel] 저장소 정보 로드 오류:', error);
      showMessage('error', '서버 연결 실패');
    } finally {
      setStorageLoading(false);
    }
  };

  const browseDirectory = async (path) => {
    setStorageLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/storage/browse?path=${encodeURIComponent(path)}`);
      const data = await response.json();

      if (data.success) {
        setCurrentPath(data.currentPath);
        setDirectoryContents(data.contents);
      } else {
        showMessage('error', data.error || '디렉토리 조회 실패');
      }
    } catch (error) {
      console.error('[AdminPanel] 디렉토리 조회 오류:', error);
      showMessage('error', '서버 연결 실패');
    } finally {
      setStorageLoading(false);
    }
  };

  const deleteItem = async (itemPath) => {
    if (!confirm(`정말 삭제하시겠습니까?\n\n${itemPath}`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/storage/browse`, {
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
      console.error('[AdminPanel] 삭제 오류:', error);
      showMessage('error', '서버 연결 실패');
    }
  };

  useEffect(() => {
    if (activeSubTab === 'storage') {
      browseDirectory('.');
    }
  }, [activeSubTab]);

  // ===== 렌더링 =====
  if (promptLoading && !allPrompts) {
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
          <h1 className="text-2xl font-bold text-white">관리자</h1>
          <p className="text-gray-400">시스템 설정 및 관리</p>
        </div>

        {/* 서브 탭 */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveSubTab('prompts')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${activeSubTab === 'prompts'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            📝 프롬프트 관리
          </button>
          <button
            onClick={() => setActiveSubTab('engines')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${activeSubTab === 'engines'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            🎨 엔진 관리
          </button>
          <button
            onClick={() => setActiveSubTab('storage')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${activeSubTab === 'storage'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            💾 저장소 관리
          </button>
          <button
            onClick={() => setActiveSubTab('users')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${activeSubTab === 'users'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            👥 사용자 관리
          </button>
        </div>

        {/* 메시지 */}
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

        {/* ===== 프롬프트 관리 탭 ===== */}
        {activeSubTab === 'prompts' && (
          <div className="space-y-6">
            {/* 엔진 선택 */}
            <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700 p-6">
              <h2 className="text-xl font-bold text-white mb-4">🎯 엔진 선택</h2>

              <div className="grid grid-cols-2 gap-6">
                {/* 이미지 엔진 */}
                <div>
                  <h3 className="text-lg font-semibold text-blue-400 mb-3">🖼️ 이미지 생성 엔진</h3>
                  <div className="space-y-2">
                    {['seedream-v4', 'mystic', 'hyperflux'].map(engine => (
                      <button
                        key={engine}
                        onClick={() => setSelectedImageEngine(engine)}
                        className={`w-full px-4 py-3 rounded-lg text-left transition-colors ${selectedImageEngine === engine
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                      >
                        {engine === 'seedream-v4' && 'Seedream v4'}
                        {engine === 'mystic' && 'Mystic AI'}
                        {engine === 'hyperflux' && 'HyperFlux'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 동영상 엔진 */}
                <div>
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">🎬 영상 생성 엔진</h3>
                  <div className="space-y-2">
                    {['kling-v2-1-pro', 'kling-v2-1-std', 'kling-v2-1-master', 'hailuo-2.3-standard'].map(engine => (
                      <button
                        key={engine}
                        onClick={() => setSelectedVideoEngine(engine)}
                        className={`w-full px-4 py-3 rounded-lg text-left transition-colors ${selectedVideoEngine === engine
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                      >
                        {engine === 'kling-v2-1-pro' && 'Kling v2.1 Pro'}
                        {engine === 'kling-v2-1-std' && 'Kling v2.1 Standard'}
                        {engine === 'kling-v2-1-master' && 'Kling v2.1 Master'}
                        {engine === 'hailuo-2.3-standard' && 'Hailuo 2.3 (MiniMax)'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-900/50 rounded-lg">
                <div className="text-sm text-gray-400">현재 선택된 엔진 조합:</div>
                <div className="text-lg font-mono text-white mt-1">
                  {selectedImageEngine} + {selectedVideoEngine}
                </div>
              </div>
            </div>

            {/* 프롬프트 타입 선택 */}
            <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700 p-6">
              <h2 className="text-xl font-bold text-white mb-4">📋 프롬프트 타입</h2>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setSelectedPromptType('auto_product')}
                  className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${selectedPromptType === 'auto_product'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                  🛍️ Auto - Product
                </button>
                <button
                  onClick={() => setSelectedPromptType('auto_service')}
                  className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${selectedPromptType === 'auto_service'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                  🎨 Auto - Service
                </button>
                <button
                  onClick={() => setSelectedPromptType('manual')}
                  className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${selectedPromptType === 'manual'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                  🎯 Manual
                </button>
              </div>

              {/* 프롬프트 편집기 */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-white">프롬프트 편집</h3>
                  <button
                    onClick={savePrompt}
                    disabled={promptSaving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    {promptSaving ? '저장 중...' : '💾 저장'}
                  </button>
                </div>

                <textarea
                  value={currentPrompt}
                  onChange={(e) => setCurrentPrompt(e.target.value)}
                  className="w-full h-96 p-4 bg-gray-900 border border-gray-700 rounded-lg font-mono text-sm text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="프롬프트 내용을 입력하세요..."
                />

                <div className="flex items-center text-sm text-gray-500">
                  <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  저장하면 서버의 파일이 즉시 업데이트되며 버전이 자동으로 백업됩니다.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== 엔진 관리 탭 ===== */}
        {activeSubTab === 'engines' && currentEngines && availableEngines && (
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

        {/* ===== 저장소 관리 탭 ===== */}
        {activeSubTab === 'storage' && (
          <div className="space-y-6">
            {/* 디스크 정보 */}
            {storageInfo && (
              <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700 p-6">
                <h2 className="text-xl font-bold text-white mb-4">💾 디스크 정보</h2>

                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">전체 용량</div>
                    <div className="text-2xl font-bold text-white">{storageInfo.disk.total}</div>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">사용 중</div>
                    <div className="text-2xl font-bold text-orange-400">{storageInfo.disk.used}</div>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">사용 가능</div>
                    <div className="text-2xl font-bold text-green-400">{storageInfo.disk.available}</div>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">사용률</div>
                    <div className="text-2xl font-bold text-blue-400">{storageInfo.disk.usePercent}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white mb-3">주요 폴더 용량</h3>
                  {storageInfo.directories.map(dir => (
                    <div key={dir.name} className="flex justify-between items-center p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                      <span className="text-gray-300">📁 {dir.name}</span>
                      <span className="text-white font-mono">{dir.sizeFormatted}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 디렉토리 탐색 */}
            <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700 p-6">
              <h2 className="text-xl font-bold text-white mb-4">📂 디렉토리 탐색</h2>

              <div className="mb-4 flex items-center gap-2">
                <span className="text-gray-400">현재 경로:</span>
                <span className="text-white font-mono bg-gray-900/50 px-3 py-1 rounded">{currentPath || '/'}</span>
                {currentPath && currentPath !== '.' && (
                  <button
                    onClick={() => browseDirectory(currentPath.split('/').slice(0, -1).join('/') || '.')}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-sm"
                  >
                    ⬆️ 상위 폴더
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {directoryContents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">폴더가 비어있습니다</div>
                ) : (
                  directoryContents.map(item => (
                    <div
                      key={item.path}
                      className="flex justify-between items-center p-3 bg-gray-900/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-2xl">{item.isDirectory ? '📁' : '📄'}</span>
                        <div className="flex-1">
                          <div className="text-white">{item.name}</div>
                          <div className="text-xs text-gray-500">
                            {!item.isDirectory && `${(item.size / 1024).toFixed(2)} KB`}
                            {' • '}
                            {new Date(item.modified).toLocaleString('ko-KR')}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {item.isDirectory && (
                          <button
                            onClick={() => browseDirectory(item.path)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
                          >
                            열기
                          </button>
                        )}
                        {item.deletable && (
                          <button
                            onClick={() => deleteItem(item.path)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm transition-colors"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== 사용자 관리 탭 ===== */}
        {activeSubTab === 'users' && (
          <UserManagement />
        )}
      </div>
    </div>
  );
};

export default AdminPanel;

import { useState, useEffect } from 'react';

const AdminPanel = () => {
  const [prompts, setPrompts] = useState({
    step1_product: '',
    step1_service: '',
    step2_product: '',
    step2_service: ''
  });
  const [activeTab, setActiveTab] = useState('step1_product');
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

  const versionsPerPage = 10;

  const promptLabels = {
    step1_product: 'Step1 제품 프롬프트',
    step1_service: 'Step1 서비스 프롬프트',
    step2_product: 'Step2 제품 프롬프트',
    step2_service: 'Step2 서비스 프롬프트'
  };

  // 컴포넌트 마운트 시 데이터 로드
  useEffect(() => {
    loadPrompts();
    loadVersions();
  }, []);

  // 선택된 버전이 변경되면 해당 프롬프트의 Gemini 응답 로드
  useEffect(() => {
    if (selectedVersion) {
      loadGeminiResponses(selectedVersion.promptKey || getPromptKeyFromVersion(selectedVersion));
    }
  }, [selectedVersion]);

  const getPromptKeyFromVersion = (version) => {
    // 버전 ID에서 프롬프트 키 추출
    const parts = version.id.split('_');
    if (parts.length >= 2) {
      return `${parts[0]}_${parts[1]}`;
    }
    return 'step1_product'; // fallback
  };

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/prompts/get');
      const data = await response.json();
      
      if (data.success) {
        setPrompts(data.prompts);
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
      const response = await fetch('/api/prompts/versions');
      const data = await response.json();
      
      if (data.success) {
        setVersions(data.versions);
      }
    } catch (error) {
      console.error('버전 로드 실패:', error);
    }
  };

  const loadGeminiResponses = async (promptKey) => {
    try {
      const response = await fetch(`/api/prompts/responses/${promptKey}`);
      const data = await response.json();
      
      if (data.success) {
        setGeminiResponses(data.responses);
      }
    } catch (error) {
      console.error('Gemini 응답 로드 실패:', error);
    }
  };

  const savePrompt = async (filename) => {
    setSaving(true);
    try {
      const response = await fetch('/api/prompts/update', {
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
        loadVersions(); // 버전 목록 새로고침
      } else {
        showMessage('error', data.message || '저장에 실패했습니다.');
      }
    } catch (error) {
      showMessage('error', '서버 연결에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const restoreVersion = async (versionId) => {
    if (!confirm('이 버전으로 되돌리시겠습니까?')) return;

    try {
      const response = await fetch('/api/prompts/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ versionId }),
      });

      const data = await response.json();
      
      if (data.success) {
        showMessage('success', '성공적으로 복원되었습니다.');
        loadPrompts();
        loadVersions();
      } else {
        showMessage('error', data.message || '복원에 실패했습니다.');
      }
    } catch (error) {
      showMessage('error', '서버 연결에 실패했습니다.');
    }
  };

  const testPrompt = async (promptKey, step) => {
    setTestMode(true);
    try {
      // 실제로는 Gemini API를 호출해야 하지만, 여기서는 모의 테스트
      const testResponse = `[테스트 응답] ${promptKey} - ${step}단계\n현재 프롬프트로 생성된 응답입니다.\n시간: ${new Date().toLocaleString()}`;
      
      // 응답 저장
      await fetch('/api/prompts/save-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          promptKey,
          step,
          formData: testFormData,
          response: testResponse,
          timestamp: Date.now()
        })
      });

      // 응답 목록 새로고침
      loadGeminiResponses(promptKey);
      showMessage('success', '프롬프트 테스트가 완료되었습니다.');
      
    } catch (error) {
      showMessage('error', '프롬프트 테스트에 실패했습니다.');
    } finally {
      setTestMode(false);
    }
  };

  const viewResponseDetail = async (fileName) => {
    try {
      const response = await fetch(`/api/prompts/response-detail/${fileName}`);
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
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto py-6 px-4">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">프롬프트 관리자 패널</h1>
        <p className="text-gray-600">4개의 프롬프트를 관리하고 버전별 Gemini 응답을 확인할 수 있습니다.</p>
      </div>

      {/* 메시지 알림 */}
      {message.text && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* 좌측: 버전 히스토리 */}
        <div className="col-span-3">
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">버전 히스토리</h3>
              <p className="text-sm text-gray-600">프롬프트 수정 이력</p>
            </div>

            <div className="p-4">
              {versions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">버전 히스토리가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {getCurrentPageVersions().map((version) => (
                    <div
                      key={version.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedVersion?.id === version.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedVersion(version)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-blue-600">
                          {promptLabels[version.promptKey] || version.filename}
                        </span>
                        {version.isBackup && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-1 rounded">백업</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDateTime(version.timestamp)}
                      </div>
                      <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {version.preview}
                      </div>
                    </div>
                  ))}

                  {/* 페이지네이션 */}
                  {totalPages > 1 && (
                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="text-sm text-blue-600 disabled:text-gray-400"
                      >
                        이전
                      </button>
                      <span className="text-sm text-gray-500">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="text-sm text-blue-600 disabled:text-gray-400"
                      >
                        다음
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 중앙: 프롬프트 편집 */}
        <div className="col-span-6">
          <div className="bg-white rounded-lg shadow">
            {/* 4개 프롬프트 탭 */}
            <div className="border-b border-gray-200">
              <nav className="flex space-x-0">
                {Object.keys(promptLabels).map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 ${
                      activeTab === key
                        ? 'border-blue-500 text-blue-600 bg-blue-50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {promptLabels[key]}
                  </button>
                ))}
              </nav>
            </div>

            {/* 편집 영역 */}
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">
                  {promptLabels[activeTab]} 편집
                </h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => testPrompt(activeTab, activeTab.includes('step1') ? 'step1' : 'step2')}
                    disabled={testMode}
                    className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                  >
                    {testMode ? '테스트 중...' : '프롬프트 테스트'}
                  </button>
                  <button
                    onClick={() => savePrompt(activeTab)}
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>

              <textarea
                value={prompts[activeTab]}
                onChange={(e) => handlePromptChange(activeTab, e.target.value)}
                className="w-full h-96 p-4 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

        {/* 우측: Gemini 응답 히스토리 */}
        <div className="col-span-3">
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Gemini 응답</h3>
              <p className="text-sm text-gray-600">
                {selectedVersion ? promptLabels[selectedVersion.promptKey || getPromptKeyFromVersion(selectedVersion)] : '버전을 선택하세요'}
              </p>
            </div>

            <div className="p-4">
              {!selectedVersion ? (
                <p className="text-gray-500 text-center py-8">좌측에서 버전을 선택하세요.</p>
              ) : geminiResponses.length === 0 ? (
                <p className="text-gray-500 text-center py-8">응답 히스토리가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {geminiResponses.map((response) => (
                    <div
                      key={response.fileName}
                      className="p-3 rounded-lg border border-gray-200 hover:border-gray-300 cursor-pointer"
                      onClick={() => viewResponseDetail(response.fileName)}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-green-600">
                          {response.step.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDateTime(response.timestamp)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 line-clamp-3">
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

      {/* 응답 상세 보기 모달 */}
      {selectedResponse && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  Gemini 응답 상세보기 - {selectedResponse.step.toUpperCase()}
                </h3>
                <button
                  onClick={() => setSelectedResponse(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="mb-4">
                <h4 className="font-medium text-gray-900 mb-2">입력 데이터</h4>
                <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
                  {JSON.stringify(selectedResponse.formData, null, 2)}
                </pre>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Gemini 응답</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm">
                    {selectedResponse.response}
                  </pre>
                </div>
              </div>
              
              <div className="mt-4 text-xs text-gray-500">
                생성 시간: {formatDateTime(selectedResponse.timestamp)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 테스트 데이터 설정 모달 */}
      {testMode && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">테스트 데이터 설정</h3>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">브랜드명</label>
                  <input
                    type="text"
                    value={testFormData.brandName}
                    onChange={(e) => setTestFormData(prev => ({...prev, brandName: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">산업 카테고리</label>
                  <input
                    type="text"
                    value={testFormData.industryCategory}
                    onChange={(e) => setTestFormData(prev => ({...prev, industryCategory: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">제품/서비스 카테고리</label>
                  <input
                    type="text"
                    value={testFormData.productServiceCategory}
                    onChange={(e) => setTestFormData(prev => ({...prev, productServiceCategory: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">영상 목적</label>
                  <select
                    value={testFormData.videoPurpose}
                    onChange={(e) => setTestFormData(prev => ({...prev, videoPurpose: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="제품">제품</option>
                    <option value="서비스">서비스</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">핵심 타겟</label>
                <textarea
                  value={testFormData.coreTarget}
                  onChange={(e) => setTestFormData(prev => ({...prev, coreTarget: e.target.value}))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">핵심 차별점</label>
                <textarea
                  value={testFormData.coreDifferentiation}
                  onChange={(e) => setTestFormData(prev => ({...prev, coreDifferentiation: e.target.value}))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setTestMode(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  취소
                </button>
                <button
                  onClick={() => testPrompt(activeTab, activeTab.includes('step1') ? 'step1' : 'step2')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  테스트 실행
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;

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

  useEffect(() => {
    loadPrompts();
  }, []);

  useEffect(() => {
    if (Object.keys(prompts).length > 0 && prompts.step1_product !== '') {
      loadVersions();
    }
  }, [prompts]);

  useEffect(() => {
    if (selectedVersion) {
      const promptKey = selectedVersion.promptKey || getPromptKeyFromVersion(selectedVersion);
      loadGeminiResponses(promptKey);
    }
  }, [selectedVersion]);

  const getPromptKeyFromVersion = (version) => {
    if (version.id && version.id.startsWith('current_')) {
      return version.id.replace('current_', '');
    }
    
    const filename = version.filename || version.id;
    
    if (filename.includes('step1') && filename.includes('product')) return 'step1_product';
    if (filename.includes('step1') && filename.includes('service')) return 'step1_service';
    if (filename.includes('step2') && filename.includes('product')) return 'step2_product';
    if (filename.includes('step2') && filename.includes('service')) return 'step2_service';
    
    const parts = filename.split('_');
    if (parts.length >= 2) {
      return `${parts[0]}_${parts[1]}`;
    }
    
    return 'step1_product';
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
        let allVersions = data.versions || [];
        
        const currentVersions = Object.keys(promptLabels).map(key => ({
          id: `current_${key}`,
          filename: `[현재] ${promptLabels[key]}`,
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
      const response = await fetch(`/api/prompts/responses/${promptKey}`);
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
      
      const response = await fetch('/api/prompts/restore', {
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
        setActiveTab(promptKey);
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
      const response = await fetch('/api/prompts/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          promptKey,
          step,
          formData: testFormData,
          promptContent: prompts[promptKey]
        })
      });

      const data = await response.json();
      
      if (data.success) {
        loadGeminiResponses(promptKey);
        showMessage('success', '프롬프트 테스트가 완료되었습니다.');
      } else {
        showMessage('error', data.message || '테스트 실패');
      }
      
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
        const responseData = data.data;
        
        if (!responseData.rawStep1Response && !responseData.rawStep2Response) {
          responseData.rawStep1Response = '(Step1 응답 데이터가 없습니다)';
          responseData.rawStep2Response = responseData.response || responseData.geminiResponse || '(응답 데이터 없음)';
        }
        
        setSelectedResponse(responseData);
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
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <div className="max-w-full mx-auto py-6 px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">프롬프트 관리자 패널</h1>
          <p className="text-gray-400">4개의 프롬프트를 관리하고 버전별 Gemini 응답을 확인할 수 있습니다.</p>
        </div>

        {message.text && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-red-900/30 text-red-300 border border-red-800'
          }`}>
            {message.text}
          </div>
        )}
        
        <div className="grid grid-cols-12 gap-6">
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

          <div className="col-span-6">
            <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700">
              <div className="px-4 py-3 border-b border-gray-700">
                <div className="flex flex-wrap gap-2 mb-4">
                  {Object.keys(promptLabels).map((key) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === key
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {promptLabels[key]}
                    </button>
                  ))}
                </div>

                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-white">{promptLabels[activeTab]}</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => testPrompt(activeTab, activeTab.includes('step1') ? 'step1' : 'step2')}
                      disabled={testMode}
                      className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-500 disabled:opacity-50 text-sm"
                    >
                      {testMode ? '테스트 중...' : '프롬프트 테스트'}
                    </button>
                    <button
                      onClick={() => savePrompt(activeTab)}
                      disabled={saving}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 disabled:opacity-50"
                    >
                      {saving ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>

                <textarea
                  value={prompts[activeTab]}
                  onChange={(e) => handlePromptChange(activeTab, e.target.value)}
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

          <div className="col-span-3">
            <div className="bg-gray-800/90 rounded-lg shadow-xl border border-gray-700">
              <div className="px-4 py-3 border-b border-gray-700">
                <h3 className="text-lg font-medium text-white">Gemini 응답</h3>
                <p className="text-sm text-gray-400">
                  {selectedVersion ? promptLabels[getPromptKeyFromVersion(selectedVersion)] || '버전을 선택하세요' : '버전을 선택하세요'}
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
                    Step1 프롬프트 응답
                  </h4>
                  <div className="bg-gray-900 p-4 rounded-lg">
                    <pre className="whitespace-pre-wrap text-sm text-gray-300">
                      {selectedResponse.rawStep1Response || '(Step1 응답 데이터가 없습니다)'}
                    </pre>
                  </div>
                </div>
                
                <div className="mb-6">
                  <h4 className="font-medium text-white mb-2 flex items-center">
                    <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded mr-2">3</span>
                    Step2 프롬프트 응답
                  </h4>
                  <div className="bg-gray-900 p-4 rounded-lg">
                    <pre className="whitespace-pre-wrap text-sm text-gray-300">
                      {selectedResponse.rawStep2Response || selectedResponse.response || '(Step2 응답 데이터가 없습니다)'}
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

        {testMode && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-40">
            <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 border border-gray-700">
              <div className="px-6 py-4 border-b border-gray-700">
                <h3 className="text-lg font-medium text-white">테스트 데이터 설정</h3>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  {Object.keys(testFormData).map((key) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        {key}
                      </label>
                      <input
                        type="text"
                        value={testFormData[key]}
                        onChange={(e) => setTestFormData(prev => ({...prev, [key]: e.target.value}))}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setTestMode(false)}
                    className="px-4 py-2 text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => testPrompt(activeTab, activeTab.includes('step1') ? 'step1' : 'step2')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                  >
                    테스트 실행
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;

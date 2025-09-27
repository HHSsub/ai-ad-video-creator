// src/components/admin/AdminPanel.jsx - 전체 수정본

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
      // 🔥 선택된 버전의 프롬프트 타입에 맞는 응답만 로드
      const promptKey = selectedVersion.promptKey || getPromptKeyFromVersion(selectedVersion);
      loadGeminiResponses(promptKey);
    }
  }, [selectedVersion]);

  const getPromptKeyFromVersion = (version) => {
    // 버전 ID나 파일명에서 프롬프트 키 추출
    if (version.id === 'current_prompt') {
      return activeTab; // 현재 활성 탭의 프롬프트
    }
    
    const filename = version.filename || version.id;
    
    // 파일명에서 step1/step2와 product/service 추출
    if (filename.includes('step1') && filename.includes('product')) return 'step1_product';
    if (filename.includes('step1') && filename.includes('service')) return 'step1_service';
    if (filename.includes('step2') && filename.includes('product')) return 'step2_product';
    if (filename.includes('step2') && filename.includes('service')) return 'step2_service';
    
    // 파일명 패턴으로 추출 (예: step1_product_2025_...)
    const parts = filename.split('_');
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
    setLoading(true);
    try {
      const response = await fetch('/api/prompts/versions');
      const data = await response.json();
      
      if (data.success) {
        setVersions(data.versions || []);
      } else {
        showMessage('error', '버전 목록 로드에 실패했습니다.');
      }
    } catch (error) {
      showMessage('error', '서버 연결에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadGeminiResponses = async (promptKey) => {
    try {
      // 🔥 promptKey에 맞는 응답만 가져오기
      const response = await fetch(`/api/prompts/responses/${promptKey}`);
      const data = await response.json();
      
      if (data.success) {
        setGeminiResponses(data.responses || []);
      } else {
        setGeminiResponses([]); // 응답이 없으면 빈 배열
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

  // 🔥 버전 되돌리기 기능 수정
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
        
        // 🔥 복원된 프롬프트 탭으로 자동 전환
        setActiveTab(promptKey);
        
        // 프롬프트와 버전 목록 새로고침
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
      // API 호출하여 실제 Gemini 응답 생성
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
        // 응답 목록 새로고침
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

  // 🔥 응답 상세 보기 수정 - 3단계 응답 모두 표시
  const viewResponseDetail = async (fileName) => {
    try {
      const response = await fetch(`/api/prompts/response-detail/${fileName}`);
      const data = await response.json();
      
      if (data.success) {
        // 🔥 Step1과 Step2 응답을 구분하여 저장
        const responseData = data.data;
        
        // rawStep1Response와 rawStep2Response가 있는지 확인
        if (!responseData.rawStep1Response && !responseData.rawStep2Response) {
          // 구버전 응답인 경우
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
      
      {/* 좌측: 버전 히스토리 */}
      <div className="grid grid-cols-12 gap-6">
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
                      className={`p-3 rounded-lg border cursor-pointer transition-colors relative group
                        ${selectedVersion?.id === version.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setSelectedVersion(version)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-gray-900 line-clamp-1">
                          {version.filename}
                        </span>
                        {version.versionFile && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              restoreVersion(version);
                            }}
                            className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            되돌리기
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(version.timestamp)}
                      </p>
                      {version.preview && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {version.preview}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="mt-4 flex justify-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                  >
                    이전
                  </button>
                  <span className="px-3 py-1 text-sm">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                  >
                    다음
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 중앙: 프롬프트 편집기 */}
        <div className="col-span-6">
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.keys(promptLabels).map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {promptLabels[key]}
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">{promptLabels[activeTab]}</h3>
                <div className="flex gap-2">
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
                className="w-full h-96 p-4 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-4"
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
                {selectedVersion ? promptLabels[getPromptKeyFromVersion(selectedVersion)] : '버전을 선택하세요'}
              </p>
            </div>

            <div className="p-4">
              {!selectedVersion ? (
                <p className="text-gray-500 text-center py-8">좌측에서 버전을 선택하세요.</p>
              ) : geminiResponses.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  {getPromptKeyFromVersion(selectedVersion).includes('service') 
                    ? '해당 프롬프트의 응답 히스토리가 없습니다.' 
                    : '응답 히스토리가 없습니다.'}
                </p>
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
                          {response.step?.toUpperCase() || 'RESPONSE'}
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

      {/* 🔥 응답 상세 보기 모달 - 3단계 응답 모두 표시 */}
      {selectedResponse && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  Gemini 응답 상세보기
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
            
            <div className="p-6 overflow-y-auto max-h-[75vh]">
              {/* 1) 입력 데이터 */}
              <div className="mb-6">
                <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-2">1</span>
                  입력 데이터
                </h4>
                <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
                  {JSON.stringify(selectedResponse.formData || selectedResponse.input || {}, null, 2)}
                </pre>
              </div>
              
              {/* 2) Step1 Gemini 응답 */}
              <div className="mb-6">
                <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded mr-2">2</span>
                  Step1 프롬프트 응답
                </h4>
                <div className="bg-green-50 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm">
                    {selectedResponse.rawStep1Response || '(Step1 응답 데이터가 없습니다)'}
                  </pre>
                </div>
              </div>
              
              {/* 3) Step2 Gemini 응답 */}
              <div className="mb-6">
                <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                  <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded mr-2">3</span>
                  Step2 프롬프트 응답
                </h4>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm">
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

      {/* 테스트 데이터 설정 모달 */}
      {testMode && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">테스트 데이터 설정</h3>
            </div>
            
            <div className="p-6">
              {/* 테스트 데이터 입력 폼 */}
              <div className="grid grid-cols-2 gap-4">
                {Object.keys(testFormData).map((key) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {key}
                    </label>
                    <input
                      type="text"
                      value={testFormData[key]}
                      onChange={(e) => setTestFormData(prev => ({...prev, [key]: e.target.value}))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                ))}
              </div>
              
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setTestMode(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  취소
                </button>
                <button
                  onClick={() => testPrompt(activeTab, activeTab.includes('step1') ? 'step1' : 'step2')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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

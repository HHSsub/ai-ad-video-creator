import { useState, useEffect } from 'react';

const AdminPanel = () => {
  const [prompts, setPrompts] = useState({
    input_second_prompt: '',
    final_prompt: ''
  });
  const [activeTab, setActiveTab] = useState('input_second_prompt');
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const versionsPerPage = 10;

  // 컴포넌트 마운트 시 프롬프트 데이터 로드
  useEffect(() => {
    loadPrompts();
    loadVersions();
  }, []);

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
    <div className="max-w-7xl mx-auto py-6 px-4">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">관리자 패널</h1>
        <p className="text-gray-600">프롬프트 파일을 관리하고 버전을 추적합니다.</p>
      </div>

      {/* 메시지 알림 */}
      {message.text && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 프롬프트 편집 영역 */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow">
            {/* 탭 네비게이션 */}
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8 px-6">
                <button
                  onClick={() => setActiveTab('input_second_prompt')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'input_second_prompt'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Input Second Prompt
                </button>
                <button
                  onClick={() => setActiveTab('final_prompt')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'final_prompt'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Final Prompt
                </button>
              </nav>
            </div>

            {/* 편집 영역 */}
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">
                  {activeTab === 'input_second_prompt' ? 'Input Second Prompt 편집' : 'Final Prompt 편집'}
                </h2>
                <button
                  onClick={() => savePrompt(activeTab)}
                  disabled={saving}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
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

        {/* 버전 히스토리 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">버전 히스토리</h3>
            <p className="text-sm text-gray-600">최근 수정 내역을 확인하고 되돌릴 수 있습니다.</p>
          </div>

          <div className="p-6">
            {versions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">저장된 버전이 없습니다.</p>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  {getCurrentPageVersions().map((version) => (
                    <div key={version.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium text-sm text-gray-900">
                            {version.filename === 'input_second_prompt.txt' ? 'Input Second' : 'Final Prompt'}
                          </p>
                          <p className="text-xs text-gray-500">{formatDateTime(version.timestamp)}</p>
                        </div>
                        <button
                          onClick={() => restoreVersion(version.id)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          되돌리기
                        </button>
                      </div>
                      <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 max-h-20 overflow-y-auto">
                        {version.preview}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 페이지네이션 */}
                {totalPages > 1 && (
                  <div className="flex justify-center space-x-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      이전
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-600">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      다음
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;

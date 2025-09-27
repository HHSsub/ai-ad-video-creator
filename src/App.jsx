import { useState, useEffect } from 'react';
import './styles/main.css';
import Login from './components/auth/Login';
import AdminPanel from './components/admin/AdminPanel';
import Step1 from './components/Step1';
import Step2 from './components/Step2';
import Step3 from './components/Step3';
import Step4 from './components/Step4';

function App(){
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('main'); // 'main' or 'admin'
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({});
  const [storyboard, setStoryboard] = useState(null);
  const [selectedConceptId, setSelectedConceptId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // 로그인 상태 확인
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    setCurrentView('main');
    // 상태 초기화
    setStep(1);
    setFormData({});
    setStoryboard(null);
    setSelectedConceptId(null);
    setIsLoading(false);
  };

  const next = () => setStep(s=> Math.min(4,s+1));
  const prev = () => setStep(s=> Math.max(1,s-1));

  // 로그인하지 않은 경우 로그인 화면 표시
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // 관리자 패널 표시
  if (currentView === 'admin') {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* 상단 네비게이션 */}
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-8">
                <h1 className="text-xl font-bold text-gray-900">AI 광고 영상 제작 도구</h1>
                <div className="flex space-x-4">
                  <button
                    onClick={() => setCurrentView('main')}
                    className={`px-4 py-2 text-sm font-medium ${
                      currentView === 'main'
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    메인
                  </button>
                  {user.role === 'admin' && (
                    <button
                      onClick={() => setCurrentView('admin')}
                      className={`px-4 py-2 text-sm font-medium ${
                        currentView === 'admin'
                          ? 'text-blue-600 border-b-2 border-blue-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      관리자 화면
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">
                  {user.name} ({user.role === 'admin' ? '관리자' : '사용자'})
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </nav>

        <AdminPanel />
      </div>
    );
  }

  // 디버깅을 위한 상태 로깅
  console.log('App 상태:', {
    step,
    formDataKeys: Object.keys(formData),
    videoLength: formData.videoLength,
    hasStoryboard: !!storyboard,
    selectedConceptId,
    isLoading,
    storyboardStylesCount: storyboard?.styles?.length || 0
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 네비게이션 */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-gray-900">AI 광고 영상 제작 도구</h1>
              <div className="flex space-x-4">
                <button
                  onClick={() => setCurrentView('main')}
                  className={`px-4 py-2 text-sm font-medium ${
                    currentView === 'main'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  메인
                </button>
                {user.role === 'admin' && (
                  <button
                    onClick={() => setCurrentView('admin')}
                    className={`px-4 py-2 text-sm font-medium ${
                      currentView === 'admin'
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    관리자 화면
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {user.name} ({user.role === 'admin' ? '관리자' : '사용자'})
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6">
        {/* 진행 상태 표시 */}
        <div className="mb-6 flex items-center justify-center gap-4">
          <div className={`flex items-center ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}>1</div>
            <span className="ml-2 text-sm font-semibold">정보 입력</span>
          </div>
          
          <div className={`w-8 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
          
          <div className={`flex items-center ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}>2</div>
            <span className="ml-2 text-sm font-semibold">스토리보드</span>
          </div>
          
          <div className={`w-8 h-1 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
          
          <div className={`flex items-center ${step >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}>3</div>
            <span className="ml-2 text-sm font-semibold">영상 클립</span>
          </div>
          
          <div className={`w-8 h-1 ${step >= 4 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
          
          <div className={`flex items-center ${step >= 4 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step >= 4 ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}>4</div>
            <span className="ml-2 text-sm font-semibold">최종 완성</span>
          </div>
        </div>

        {/* 🔥 영상 길이 정보 표시 (디버깅용) */}
        {formData.videoLength && (
          <div className="mb-4 text-center">
            <div className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              선택된 영상 길이: <strong>{formData.videoLength}</strong>
            </div>
          </div>
        )}

        {/* 현재 단계별 컴포넌트 렌더링 */}
        {step === 1 && (
          <Step1
            formData={formData}
            setFormData={setFormData}
            user={user}  // user 정보 추가 전달
            onNext={() => {
              console.log('Step1 완료, formData:', formData);
              console.log('🔥 선택된 영상 길이:', formData.videoLength);
              next();
            }}
          />
        )}
        
        {step === 2 && (
          <Step2
            formData={formData}
            setFormData={setFormData}
            storyboard={storyboard}
            setStoryboard={setStoryboard}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onPrev={prev}
            onNext={() => {
              console.log('Step2 완료, storyboard styles:', storyboard?.styles?.length);
              console.log('🔥 전달된 영상 길이:', formData.videoLength);
              next();
            }}
          />
        )}
        
        {step === 3 && (
          <Step3
            storyboard={storyboard}
            selectedConceptId={selectedConceptId}
            setSelectedConceptId={setSelectedConceptId}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onPrev={prev}
            onNext={() => {
              if (!selectedConceptId) {
                alert('컨셉을 선택해주세요.');
                return;
              }
              console.log('Step3 완료, selectedConceptId:', selectedConceptId);
              console.log('🔥 전달될 영상 길이:', formData.videoLength);
              next();
            }}
          />
        )}
        
        {step === 4 && (
          <Step4
            storyboard={storyboard}
            selectedConceptId={selectedConceptId}
            formData={formData}
            onPrev={prev}
            onReset={() => {
              // 전체 초기화
              setStep(1);
              setFormData({});
              setStoryboard(null);
              setSelectedConceptId(null);
              setIsLoading(false);
              console.log('🔄 전체 초기화 완료');
            }}
          />
        )}
      </div>
      
      {/* 로딩 오버레이 */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">처리 중입니다...</p>
            {formData.videoLength && (
              <p className="text-xs text-gray-500 mt-2">
                영상 길이: {formData.videoLength}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

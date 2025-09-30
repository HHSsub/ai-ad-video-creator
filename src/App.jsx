import { useState, useEffect } from 'react';
import Login from './components/auth/Login';
import AdminPanel from './components/admin/AdminPanel';
import UserManagement from './components/admin/UserManagement';
import Step1 from './components/Step1';
import Step2 from './components/Step2';
import Step3 from './components/Step3';
import Step4 from './components/Step4';

function App() {
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('main');
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({});
  const [storyboard, setStoryboard] = useState(null);
  const [selectedConceptId, setSelectedConceptId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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
    setStep(1);
    setFormData({});
    setStoryboard(null);
    setSelectedConceptId(null);
    setIsLoading(false);
  };

  const next = () => setStep(s => Math.min(4, s + 1));
  const prev = () => setStep(s => Math.max(1, s - 1));

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (currentView === 'users') {
    return (
      <div className="min-h-screen bg-[#0A0A0B]">
        <nav className="bg-black/50 backdrop-blur-md border-b border-gray-800">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-8">
                <div className="flex items-center gap-2">
                  <img 
                    src="/upnexx_logo.png" 
                    alt="UPNEXX Logo" 
                    className="h-10 w-auto object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  <h1 className="text-xl font-bold text-white">AI Studio</h1>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => setCurrentView('main')}
                    className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                  >
                    메인
                  </button>
                  {user.role === 'admin' && (
                    <>
                      <button
                        onClick={() => setCurrentView('admin')}
                        className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                      >
                        프롬프트관리
                      </button>
                      <button
                        onClick={() => setCurrentView('users')}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600/20 border border-blue-500/50 rounded-lg"
                      >
                        사용자관리
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-400">
                  {user.name} ({user.role === 'admin' ? '관리자' : '사용자'})
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </nav>
        <UserManagement currentUser={user} />
      </div>
    );
  }

  if (currentView === 'admin') {
    return (
      <div className="min-h-screen bg-[#0A0A0B]">
        <nav className="bg-black/50 backdrop-blur-md border-b border-gray-800">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-8">
                <div className="flex items-center gap-2">
                  <img 
                    src="/upnexx_logo.png" 
                    alt="UPNEXX Logo" 
                    className="h-10 w-auto object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  <h1 className="text-xl font-bold text-white">AI Studio</h1>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => setCurrentView('main')}
                    className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                  >
                    메인
                  </button>
                  {user.role === 'admin' && (
                    <>
                      <button
                        onClick={() => setCurrentView('admin')}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600/20 border border-blue-500/50 rounded-lg"
                      >
                        프롬프트관리
                      </button>
                      <button
                        onClick={() => setCurrentView('users')}
                        className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                      >
                        사용자관리
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-400">
                  {user.name} ({user.role === 'admin' ? '관리자' : '사용자'})
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
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
    <div className="min-h-screen bg-[#0A0A0B]">
      <nav className="bg-black/50 backdrop-blur-md border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <img 
                  src="/upnexx_logo.png" 
                  alt="UPNEXX Logo" 
                  className="h-10 w-autp object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
                <span className="text-xl font-bold text-white">AI Studio</span>
              </div>
              
              <div className="hidden md:flex items-center gap-1">
                {[
                  { num: 1, title: '정보 입력', desc: 'Information' },
                  { num: 2, title: '스토리보드', desc: 'Storyboard' },
                  { num: 3, title: '영상 클립', desc: 'Video Clips' },
                  { num: 4, title: '최종 완성', desc: 'Final' }
                ].map((s, idx, arr) => (
                  <div key={s.num} className="flex items-center">
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
                      step === s.num 
                        ? 'bg-blue-600/20 border border-blue-500/50' 
                        : step > s.num 
                          ? 'text-gray-500' 
                          : 'text-gray-600'
                    }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        step === s.num 
                          ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white' 
                          : step > s.num 
                            ? 'bg-green-600/20 text-green-400 border border-green-600/50' 
                            : 'bg-gray-800 text-gray-500 border border-gray-700'
                      }`}>
                        {step > s.num ? '✓' : s.num}
                      </div>
                      <div className="hidden lg:block">
                        <div className={`text-xs font-medium ${
                          step === s.num ? 'text-white' : 'text-gray-400'
                        }`}>
                          {s.title}
                        </div>
                        <div className="text-[10px] text-gray-600">
                          {s.desc}
                        </div>
                      </div>
                    </div>
                    {idx < arr.length - 1 && (
                      <div className={`w-12 h-[1px] ${
                        step > s.num ? 'bg-blue-500' : 'bg-gray-800'
                      }`}></div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {user.role === 'admin' && (
                <>
                  <button
                    onClick={() => setCurrentView('admin')}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    프롬프트관리
                  </button>
                  <button
                    onClick={() => setCurrentView('users')}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    사용자관리
                  </button>
                </>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">
                  {user.name}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="h-1 bg-gray-900">
        <div 
          className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-500"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>

      <main className="relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-600/20 rounded-full blur-[120px]"></div>
          <div className="absolute top-1/2 -left-40 w-80 h-80 bg-purple-600/20 rounded-full blur-[120px]"></div>
        </div>

        <div className="relative max-w-7xl mx-auto py-8">
          {formData.videoLength && (
            <div className="mb-6 text-center">
              <div className="inline-block px-4 py-2 bg-blue-600/20 border border-blue-500/50 rounded-full">
                <span className="text-sm text-blue-400">
                  선택된 영상 길이: <strong className="text-white">{formData.videoLength}</strong>
                </span>
              </div>
            </div>
          )}

          {step === 1 && (
            <Step1
              formData={formData}
              setFormData={setFormData}
              user={user}
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
              user={user}
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
              user={user}
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
              user={user}
              onReset={() => {
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
      </main>

      <footer className="mt-auto border-t border-gray-800 bg-black/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              © 2025 AI Studio. Professional AI Video Generation Platform
            </div>
            <div className="flex items-center gap-6 text-xs text-gray-500">
              <span>Powered by nexxii</span>
              <span>•</span>
              <span>Version 2.0</span>
            </div>
          </div>
        </div>
      </footer>
      
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 text-center border border-gray-700">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-300">처리 중입니다...</p>
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

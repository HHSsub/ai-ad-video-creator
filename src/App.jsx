// src/App.jsx 전체 코드 (단 한 줄도 생략 없음)
import { useState, useEffect } from 'react';
import Login from './components/auth/Login';
import AdminPanel from './components/admin/AdminPanel';
import UserManagement from './components/admin/UserManagement';
import Step2 from './components/Step2';
import Step3 from './components/Step3';
import Step4 from './components/Step4';
import ProjectDashboard from './components/ProjectDashboard';
import ModeSelector from './components/ModeSelector';
import InviteMemberModal from './components/InviteMemberModal';
import Step1Manual from './components/Step1Manual';
import Step1Auto from './components/Step1Auto';
import Step5 from './components/Step5';

function App() {
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('projects');
  const [step, setStep] = useState(1);
  const [showInviteModal, setShowInviteModal] = useState(false); // 🔥 G: 멤버 초대 모달
  const [formData, setFormData] = useState({
    mode: 'auto',
    userdescription: '',
    videoLength: '',
    aspectRatioCode: '',
    videoPurpose: '',
    brandName: '',
    industryCategory: '',
    productServiceCategory: '',
    productServiceName: '',
    coreTarget: '',
    coreDifferentiation: '',
    videoRequirements: '',
    imageUpload: null
  });
  const [storyboard, setStoryboard] = useState(null);
  const [selectedConceptId, setSelectedConceptId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentProject, setCurrentProject] = useState(null);
  const [currentMode, setCurrentMode] = useState(null);
  const [userRole, setUserRole] = useState('owner');  // 사용자 역할 상태 추가(1122_1700)

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('user');
      }
    }

    // 새로고침 시 상태 복원
    const savedView = localStorage.getItem('currentView');
    const savedStep = localStorage.getItem('currentStep');
    const savedProject = localStorage.getItem('currentProject');
    const savedMode = localStorage.getItem('currentMode');
    const savedFormData = localStorage.getItem('formData');
    const savedStoryboard = localStorage.getItem('storyboard');
    const savedConceptId = localStorage.getItem('selectedConceptId');

    if (savedView && savedView !== 'projects') {
      setCurrentView(savedView);
    }
    if (savedStep) {
      setStep(parseInt(savedStep, 10));
    }
    if (savedProject) {
      try {
        setCurrentProject(JSON.parse(savedProject));
      } catch (e) {
        console.error('Failed to parse savedProject:', e);
      }
    }
    if (savedMode) {
      setCurrentMode(savedMode);
    }
    if (savedFormData) {
      try {
        setFormData(JSON.parse(savedFormData));
      } catch (e) {
        console.error('Failed to parse savedFormData:', e);
      }
    }
    if (savedStoryboard) {
      try {
        setStoryboard(JSON.parse(savedStoryboard));
      } catch (e) {
        console.error('Failed to parse savedStoryboard:', e);
      }
    }
    if (savedConceptId) {
      setSelectedConceptId(savedConceptId);
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    setCurrentView('projects');
    setStep(1);
  };

  // 상태 변경 시 localStorage에 저장
  useEffect(() => {
    localStorage.setItem('currentView', currentView);
    localStorage.setItem('currentStep', step.toString());
    if (currentProject) {
      localStorage.setItem('currentProject', JSON.stringify(currentProject));
    }
    if (currentMode) {
      localStorage.setItem('currentMode', currentMode);
    }
    localStorage.setItem('formData', JSON.stringify(formData));
    if (storyboard) {
      localStorage.setItem('storyboard', JSON.stringify(storyboard));
    }
    if (selectedConceptId) {
      localStorage.setItem('selectedConceptId', selectedConceptId);
    }
  }, [currentView, step, currentProject, currentMode, formData, storyboard, selectedConceptId]);

  // 브라우저 뒤로가기 버튼 처리
  useEffect(() => {
    const handleBackButton = (e) => {
      if (currentView === 'projects' || currentView === 'admin' || currentView === 'users') {
        return; // 메인 화면에서는 기본 동작 허용
      }

      e.preventDefault();

      // 현재 뷰에 따라 이전 단계로 이동
      if (currentView === 'step5') {
        setStep(4);
        setCurrentView('step4');
      } else if (currentView === 'step4') {
        setStep(3);
        setCurrentView('step3');
      } else if (currentView === 'step3') {
        setStep(2);
        setCurrentView('step2');
      } else if (currentView === 'step2') {
        if (storyboard?.imageSetMode || storyboard?.styles?.length > 0) {
          handleBackToProjects();
        } else {
          if (currentMode === 'auto') {
            setCurrentView('step1-auto');
          } else {
            setCurrentView('step1-manual');
          }
          setStep(1);
        }
      } else if (currentView === 'step1-auto' || currentView === 'step1-manual') {
        handleBackToModeSelect();
      } else if (currentView === 'mode-select') {
        handleBackToProjects();
      }

      // 히스토리에 다시 추가하여 뒤로가기 방지
      window.history.pushState(null, '', window.location.href);
    };

    // 초기 히스토리 상태 추가
    window.history.pushState(null, '', window.location.href);

    // popstate 이벤트 리스너 등록
    window.addEventListener('popstate', handleBackButton);

    return () => {
      window.removeEventListener('popstate', handleBackButton);
    };
  }, [currentView, step, storyboard, currentMode]);

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    // 상태 초기화
    localStorage.removeItem('currentView');
    localStorage.removeItem('currentStep');
    localStorage.removeItem('currentProject');
    localStorage.removeItem('currentMode');
    localStorage.removeItem('formData');
    localStorage.removeItem('storyboard');
    localStorage.removeItem('selectedConceptId');
    setCurrentView('projects');
    setStep(1);
    setFormData({
      mode: 'auto',
      userdescription: '',
      videoLength: '',
      aspectRatioCode: '',
      videoPurpose: '',
      brandName: '',
      industryCategory: '',
      productServiceCategory: '',
      productServiceName: '',
      coreTarget: '',
      coreDifferentiation: '',
      videoRequirements: '',
      imageUpload: null
    });
    setStoryboard(null);
    setSelectedConceptId(null);
    setIsLoading(false);
    setCurrentProject(null);
    setCurrentMode(null);
  };

  const next = () => setStep(s => Math.min(4, s + 1));
  const prev = () => setStep(s => Math.max(1, s - 1));

  const handleSelectProject = async (project) => {
    setCurrentProject(project);

    // 프로젝트 데이터 로드
    try {
      const response = await fetch(`/nexxii/api/projects/${project.id}`, {
        headers: {
          'x-username': user?.username || 'anonymous'
        }
      });

      if (response.ok) {
        const data = await response.json();

        // 🔥 v4.1 워크플로우: imageSetMode 확인
        if (data.project.storyboard && data.project.storyboard.styles) {
          console.log('[App] ✅ 기존 작업 발견');
          setStoryboard(data.project.storyboard);
          setFormData(data.project.formData || {});
          setCurrentMode(data.project.mode);

          // imageSetMode가 true면 이미지만 생성된 상태 → Step3으로
          if (data.project.storyboard.imageSetMode) {
            console.log('[App] 📸 이미지 세트 발견 - Step3으로 이동');
            setCurrentView('step3');
            setStep(3);
            return;
          }

          // finalVideos가 있으면 영상까지 완성된 상태 → Step4로
          if (data.project.storyboard.finalVideos && data.project.storyboard.finalVideos.length > 0) {
            console.log('[App] 🎬 완성된 영상 발견 - Step4로 이동');
            setCurrentView('step4');
            setStep(4);
            return;
          }

          // 기타 경우 (구버전 호환) → Step4로
          console.log('[App] 📋 스토리보드 발견 - Step4로 이동 (구버전 호환)');
          setCurrentView('step4');
          setStep(4);
          return;
        }
      }
    } catch (error) {
      console.error('[App] 프로젝트 로드 실패:', error);
    }

    // storyboard 없으면 모드 선택
    setCurrentMode(null);
    setFormData({
      mode: 'auto',
      userdescription: '',
      videoLength: '',
      aspectRatioCode: '',
      videoPurpose: '',
      brandName: '',
      industryCategory: '',
      productServiceCategory: '',
      productServiceName: '',
      coreTarget: '',
      coreDifferentiation: '',
      videoRequirements: '',
      imageUpload: null
    });
    setStoryboard(null);
    setSelectedConceptId(null);
    setCurrentView('mode-select');
  };

  const handleSelectMode = async (mode) => {
    setCurrentMode(mode);

    setFormData(prev => ({
      ...prev,
      mode: mode
    }));

    if (currentProject && currentProject.id) {
      try {
        const response = await fetch(`/nexxii/api/projects/${currentProject.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user.username || user.id
          },
          body: JSON.stringify({ mode })
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[App] ✅ 프로젝트 모드 저장 성공:', data.project);
          setCurrentProject(data.project);
        } else {
          console.error('[App] ❌ 프로젝트 모드 저장 실패:', response.status);
        }
      } catch (error) {
        console.error('[App] ❌ 프로젝트 모드 저장 오류:', error);
      }
    }

    setStep(1);

    if (mode === 'auto') {
      setCurrentView('step1-auto');
    } else if (mode === 'manual') {
      setCurrentView('step1-manual');
    }
  };

  const handleBackToProjects = () => {
    setCurrentProject(null);
    setCurrentMode(null);
    setFormData({
      mode: 'auto',
      userdescription: '',
      videoLength: '',
      aspectRatioCode: '',
      videoPurpose: '',
      brandName: '',
      industryCategory: '',
      productServiceCategory: '',
      productServiceName: '',
      coreTarget: '',
      coreDifferentiation: '',
      videoRequirements: '',
      imageUpload: null
    });
    setStoryboard(null);
    setSelectedConceptId(null);
    setCurrentView('projects');
  };

  const handleBackToModeSelect = () => {
    setCurrentMode(null);
    setFormData({
      mode: 'auto',
      userdescription: '',
      videoLength: '',
      aspectRatioCode: '',
      videoPurpose: '',
      brandName: '',
      industryCategory: '',
      productServiceCategory: '',
      productServiceName: '',
      coreTarget: '',
      coreDifferentiation: '',
      videoRequirements: '',
      imageUpload: null
    });
    setCurrentView('mode-select');
    setStep(1);
  };

  const saveProjectData = async (dataToSave) => {
    if (!currentProject?.id) return;
    try {
      console.log('[App] 💾 프로젝트 데이터 자동 저장 시도...', dataToSave);
      const response = await fetch(`/nexxii/api/projects/${currentProject.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          formData: dataToSave,
          updatedAt: new Date().toISOString()
        })
      });
      if (!response.ok) {
        console.error('[App] ❌ 프로젝트 데이터 저장 실패:', response.status);
      } else {
        console.log('[App] ✅ 프로젝트 데이터 자동 저장 완료');
      }
    } catch (e) {
      console.error('[App] ❌ 프로젝트 데이터 저장 오류:', e);
    }
  };

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
                <img
                  src="/nexxii/upnexx_logo.png"
                  alt="UPNEXX 로고"
                  style={{
                    height: "120px",
                    width: "auto",
                    background: "none",
                    display: "block"
                  }}
                />
                <div className="flex space-x-1">
                  <button
                    onClick={handleBackToProjects}
                    className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                  >
                    메인
                  </button>
                  {user.role === 'admin' && (
                    <button
                      onClick={() => setCurrentView('admin')}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600/20 border border-blue-500/50 rounded-lg"
                    >
                      관리자
                    </button>
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
                <img
                  src="/nexxii/upnexx_logo.png"
                  alt="UPNEXX 로고"
                  style={{
                    height: "120px",
                    width: "auto",
                    background: "none",
                    display: "block"
                  }}
                />
                <div className="flex space-x-1">
                  <button
                    onClick={handleBackToProjects}
                    className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                  >
                    메인
                  </button>
                  {user.role === 'admin' && (
                    <button
                      onClick={() => setCurrentView('admin')}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600/20 border border-blue-500/50 rounded-lg"
                    >
                      관리자
                    </button>
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
        <AdminPanel currentUser={user} />
      </div>
    );
  }

  console.log('App 상태:', {
    step,
    formDataKeys: Object.keys(formData),
    videoLength: formData.videoLength,
    mode: formData.mode,
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
              <img
                src="/nexxii/upnexx_logo.png"
                alt="UPNEXX 로고"
                style={{
                  height: "120px",
                  width: "auto",
                  background: "none",
                  display: "block"
                }}
              />
              <div className="hidden md:flex items-center gap-1">
                {[
                  { num: 1, title: '정보 입력', desc: 'Information' },
                  { num: 2, title: '스토리보드', desc: 'Storyboard' },
                  { num: 3, title: '영상 클립', desc: 'Video Clips' },
                  { num: 4, title: '최종 완성', desc: 'Final' }
                ].map((s, idx, arr) => (
                  <div key={s.num} className="flex items-center">
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${step === s.num
                      ? 'bg-blue-600/20 border border-blue-500/50'
                      : step > s.num
                        ? 'text-gray-500'
                        : 'text-gray-600'
                      }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === s.num
                        ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white'
                        : step > s.num
                          ? 'bg-green-600/20 text-green-400 border border-green-600/50'
                          : 'bg-gray-800 text-gray-500 border border-gray-700'
                        }`}>
                        {step > s.num ? '✓' : s.num}
                      </div>
                      <div className="hidden lg:block">
                        <div className={`text-xs font-medium ${step === s.num ? 'text-white' : 'text-gray-400'
                          }`}>
                          {s.title}
                        </div>
                        <div className="text-[10px] text-gray-600">
                          {s.desc}
                        </div>
                      </div>
                    </div>
                    {idx < arr.length - 1 && (
                      <div className={`w-12 h-[1px] ${step > s.num ? 'bg-blue-500' : 'bg-gray-800'
                        }`}></div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {user.role === 'admin' && (
                <button
                  onClick={() => setCurrentView('admin')}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  관리자
                </button>
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

          {currentView === 'projects' && (
            <ProjectDashboard
              user={user}
              onSelectProject={handleSelectProject}
            />
          )}

          {currentView === 'mode-select' && currentProject && (
            <ModeSelector
              project={currentProject}
              onSelectMode={handleSelectMode}
              onBack={handleBackToProjects}
              onInviteMember={() => setShowInviteModal(true)}
            />
          )}

          {currentView === 'step1-auto' && (
            <Step1Auto
              formData={formData}
              setFormData={setFormData}
              user={user}
              onPrev={handleBackToModeSelect}
              onNext={() => {
                console.log('Step1Auto 완료, formData:', formData);
                console.log('🔥 선택된 영상 길이:', formData.videoLength);
                saveProjectData(formData); // 🔥 자동 저장 추가
                setStep(2);
                setCurrentView('step2');
              }}
            />
          )}

          {currentView === 'step1-manual' && (
            <Step1Manual
              formData={formData}
              setFormData={setFormData}
              user={user}
              onPrev={handleBackToModeSelect}
              onNext={() => {
                console.log('Step1Manual 완료, formData:', formData);
                console.log('🔥 선택된 영상 길이:', formData.videoLength);
                console.log('🔥 사용자 설명:', formData.userdescription);
                saveProjectData(formData); // 🔥 자동 저장 추가
                setStep(2);
                setCurrentView('step2');
              }}
            />
          )}

          {currentView === 'step2' && (
            <Step2
              formData={formData}
              setFormData={setFormData}
              storyboard={storyboard}
              setStoryboard={setStoryboard}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
              user={user}
              currentProject={currentProject}  // 🔥 추가
              onPrev={() => {
                // 🔥 G-4: 스토리보드가 이미 있으면 프로젝트 목록으로
                if (storyboard?.imageSetMode || storyboard?.styles?.length > 0) {
                  console.log('[App] Step2 onPrev: 스토리보드 존재 → 프로젝트 목록으로');
                  handleBackToProjects();
                } else {
                  // 스토리보드 없으면 Step1으로
                  if (currentMode === 'auto') {
                    setCurrentView('step1-auto');
                  } else {
                    setCurrentView('step1-manual');
                  }
                  setStep(1);
                }
              }}
              onNext={() => {
                console.log('Step2 완료, storyboard styles:', storyboard?.styles?.length);
                console.log('🔥 전달된 영상 길이:', formData.videoLength);
                setStep(3);
                setCurrentView('step3');
              }}
            />
          )}

          {currentView === 'step3' && (
            <Step3
              storyboard={storyboard}
              selectedConceptId={selectedConceptId}
              setSelectedConceptId={setSelectedConceptId}
              onPrev={() => {
                setStep(2);
                setCurrentView('step2');
              }}
              onNext={() => {
                // Step4 (편집 화면)으로 이동
                console.log('Step3 → Step4 이동, selectedConceptId:', selectedConceptId);
                setStep(4);
                setCurrentView('step4');
              }}
              formData={formData}
              user={user}
              currentProject={currentProject}
            />
          )}

          {currentView === 'step4' && (
            <Step4
              storyboard={storyboard}
              selectedConceptId={selectedConceptId}
              formData={formData}
              onPrev={() => {
                setStep(3);
                setCurrentView('step3');
              }}
              onComplete={(updatedStoryboard) => {
                // 🔥 Step4 완료 → Step5 (BGM 적용)로 이동
                console.log('Step4 완료 → Step5 (BGM 적용)');
                if (updatedStoryboard) {
                  setStoryboard(updatedStoryboard);
                }
                setStep(5);
                setCurrentView('step5');
              }}
              user={user}
              currentProject={currentProject}
              userRole={userRole}
            />
          )}

          {currentView === 'step5' && (
            <Step5
              storyboard={storyboard}
              selectedConceptId={selectedConceptId}
              onPrev={() => {
                setStep(4);
                setCurrentView('step4');
              }}
              onComplete={() => {
                console.log('Step5 완료 → Step3 복귀');
                setStep(3);
                setCurrentView('step3');
              }}
              currentProject={currentProject}
            />
          )}
        </div>
      </main>

      <footer className="mt-auto border-t border-gray-800 bg-black/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              © 2025 UPNEXX. Professional AI Video Generation Platform
            </div>
            <div className="flex items-center gap-6 text-xs text-gray-500">
              <span>Powered by Nexxii</span>
              <span>•</span>
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

      {/* 🔥 G-2: 멤버 초대 모달 */}
      {currentProject && (
        <InviteMemberModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          projectId={currentProject.id}
          currentUser={user?.username || ''}
        />
      )}
    </div>
  );
}

export default App;

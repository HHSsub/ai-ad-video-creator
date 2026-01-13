import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './ProjectDashboard.css';
import { forceScrollTop } from '../forceScrollTop';
import InviteMemberModal from './InviteMemberModal';
import MemberListModal from './MemberListModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const ProjectDashboard = ({ user, onSelectProject }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // 프로젝트 이름 및 설명 변경 상태
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [editingProjectDesc, setEditingProjectDesc] = useState('');

  // 정렬 상태
  const [sortBy, setSortBy] = useState('date-desc'); // date-desc, date-asc, name-asc, name-desc
  const [viewMode, setViewMode] = useState('grid'); // grid, list

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState(null);

  useEffect(() => {
    forceScrollTop();
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [user]);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/projects`, {
        headers: {
          'x-username': user?.username || 'anonymous'
        }
      });

      if (!response.ok) {
        throw new Error(`프로젝트 목록 조회 실패: ${response.status}`);
      }

      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      console.error('프로젝트 목록 조회 에러:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      alert('프로젝트 이름을 입력하세요');
      return;
    }

    setCreating(true);

    try {
      const response = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          name: newProjectName.trim(),
          description: newProjectDesc.trim()
        })
      });

      if (!response.ok) {
        throw new Error(`프로젝트 생성 실패: ${response.status}`);
      }

      const data = await response.json();

      await fetchProjects();

      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectDesc('');

      onSelectProject(data.project);
    } catch (err) {
      console.error('프로젝트 생성 에러:', err);
      alert(`프로젝트 생성 실패: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  // 🔥 프로젝트 삭제
  const handleDeleteProject = async (projectId, projectName) => {
    if (!confirm(`"${projectName}" 프로젝트를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 프로젝트의 모든 데이터(이미지, 영상 포함)가 삭제됩니다.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'x-username': user?.username || 'anonymous'
        }
      });

      if (!response.ok) {
        throw new Error(`프로젝트 삭제 실패: ${response.status}`);
      }

      alert('프로젝트가 삭제되었습니다.');
      await fetchProjects();
    } catch (err) {
      console.error('프로젝트 삭제 에러:', err);
      alert(`프로젝트 삭제 실패: ${err.message}`);
    }
  };

  // 🔥 프로젝트 편집 시작
  const handleStartEdit = (project) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
    setEditingProjectDesc(project.description || '');
  };

  const handleCancelEdit = () => {
    setEditingProjectId(null);
    setEditingProjectName('');
    setEditingProjectDesc('');
  };

  const handleSaveEdit = async (projectId) => {
    if (!editingProjectName.trim()) {
      alert('프로젝트 이름을 입력하세요');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-username': user?.username || 'anonymous'
        },
        body: JSON.stringify({
          name: editingProjectName.trim(),
          description: editingProjectDesc.trim()
        })
      });

      if (!response.ok) {
        throw new Error(`프로젝트 수정 실패: ${response.status}`);
      }

      await fetchProjects();
      setEditingProjectId(null);
      setEditingProjectName('');
      setEditingProjectDesc('');
    } catch (err) {
      console.error('프로젝트 수정 에러:', err);
      alert(`프로젝트 수정 실패: ${err.message}`);
    }
  };

  // 🔥 G-2: 프로젝트 상태 계산
  const getProjectStatus = (project) => {
    if (!project.storyboard) {
      return { text: '시작 전', color: 'gray', step: null };
    }

    if (project.storyboard?.finalVideos && project.storyboard.finalVideos.length > 0) {
      return { text: '영상 완성', color: 'green', step: 4 };
    }

    if (project.storyboard?.imageSetMode) {
      return { text: '이미지 생성 완료', color: 'blue', step: 3 };
    }

    return { text: '진행 중', color: 'yellow', step: project.lastStep || 2 };
  };

  // 정렬된 프로젝트 목록
  const getSortedProjects = () => {
    const sorted = [...projects];

    switch (sortBy) {
      case 'date-desc':
        return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      case 'date-asc':
        return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      case 'name-asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      default:
        return sorted;
    }
  };

  if (loading) {
    return (
      <div className="project-dashboard">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>프로젝트 목록 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const sortedProjects = getSortedProjects();

  return (
    <div className="project-dashboard">
      <div className="dashboard-header">
        <div className="header-left">
          <h1>내 프로젝트</h1>
          <span className="project-count">{projects.length}개의 프로젝트</span>
        </div>
        <button
          className="btn-create-project"
          onClick={() => setShowCreateModal(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>새 프로젝트</span>
        </button>
      </div>

      {error && (
        <div className="error-message">
          <div className="error-content">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
          </div>
          <button onClick={fetchProjects}>다시 시도</button>
        </div>
      )}

      {/* 정렬 및 뷰 옵션 */}
      <div className="toolbar">
        <div className="sort-options">
          <button
            className={`sort-btn ${sortBy === 'date-desc' ? 'active' : ''}`}
            onClick={() => setSortBy('date-desc')}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19M12 19L5 12M12 19L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            최신순
          </button>
          <button
            className={`sort-btn ${sortBy === 'date-asc' ? 'active' : ''}`}
            onClick={() => setSortBy('date-asc')}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 19V5M12 5L5 12M12 5L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            오래된순
          </button>
          <button
            className={`sort-btn ${sortBy === 'name-asc' ? 'active' : ''}`}
            onClick={() => setSortBy('name-asc')}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 4H21M3 12H15M3 20H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            이름순
          </button>
        </div>

        <div className="view-toggle">
          <button
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="그리드 뷰"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" />
              <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" />
              <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" />
              <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="리스트 뷰"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 6H21M8 12H21M8 18H21M3 6H3.01M3 12H3.01M3 18H3.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className={`projects-container ${viewMode}`}>
        {sortedProjects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 2L7 6H3C1.89543 6 1 6.89543 1 8V19C1 20.1046 1.89543 21 3 21H21C22.1046 21 23 20.1046 23 19V8C23 6.89543 22.1046 6 21 6H17L15 2H9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <h3>프로젝트가 없습니다</h3>
            <p>새로운 프로젝트를 생성하여 시작하세요!</p>
            <button
              className="btn-create-empty"
              onClick={() => setShowCreateModal(true)}
            >
              첫 프로젝트 만들기
            </button>
          </div>
        ) : (
          sortedProjects.map(project => (
            <div
              key={project.id}
              className="project-card"
              onClick={() => onSelectProject(project)}
            >
              <div className="card-header">
                <div className="project-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3Z" stroke="currentColor" strokeWidth="2" />
                    <path d="M10 9L15 12L10 15V9Z" fill="currentColor" />
                  </svg>
                </div>
                <div
                  className="card-menu"
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', gap: '4px' }}
                >
                  {/* 이름 편집 버튼 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleStartEdit(project);
                    }}
                    title="이름 편집"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                      color: '#6b7280'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#3b82f620';
                      e.currentTarget.style.color = '#3b82f6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#6b7280';
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M18.5 2.5C18.8978 2.10217 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.10217 21.5 2.5C21.8978 2.89782 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.10217 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {/* 삭제 버튼 */}
                  <button
                    type="button"
                    className="btn-delete"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteProject(project.id, project.name);
                    }}
                    title="프로젝트 삭제"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                      color: '#6b7280'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#ef444420';
                      e.currentTarget.style.color = '#ef4444';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#6b7280';
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {/* 멤버 목록 버튼 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTargetProjectId(project.id);
                      setShowMemberModal(true);
                    }}
                    title="멤버 목록"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                      color: '#6b7280'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#10b98120';
                      e.currentTarget.style.color = '#10b981';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#6b7280';
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                  </button>

                  {/* 멤버 초대 버튼 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTargetProjectId(project.id);
                      setShowInviteModal(true);
                    }}
                    title="멤버 초대"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                      color: '#6b7280'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#8b5cf620';
                      e.currentTarget.style.color = '#8b5cf6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#6b7280';
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="8.5" cy="7" r="4"></circle>
                      <line x1="20" y1="8" x2="20" y2="14"></line>
                      <line x1="17" y1="11" x2="23" y2="11"></line>
                    </svg>
                  </button>
                </div>
              </div>

              {/* 프로젝트 이름 및 설명 (편집 모드) */}
              {editingProjectId === project.id ? (
                <div onClick={(e) => e.stopPropagation()} style={{ marginBottom: '12px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>프로젝트 이름</label>
                    <input
                      type="text"
                      value={editingProjectName}
                      onChange={(e) => setEditingProjectName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        fontSize: '16px',
                        fontWeight: '600',
                        border: '2px solid #3b82f6',
                        borderRadius: '6px',
                        backgroundColor: '#1f2937',
                        color: 'white',
                        outline: 'none'
                      }}
                      autoFocus
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(project.id);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>프로젝트 설명</label>
                    <textarea
                      value={editingProjectDesc}
                      onChange={(e) => setEditingProjectDesc(e.target.value)}
                      placeholder="프로젝트 설명을 입력하세요"
                      style={{
                        width: '100%',
                        padding: '8px',
                        fontSize: '14px',
                        border: '1px solid #4b5563',
                        borderRadius: '6px',
                        backgroundColor: '#1f2937',
                        color: 'white',
                        outline: 'none',
                        minHeight: '80px',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleSaveEdit(project.id)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      저장
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: '#4b5563',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <h3 className="project-name">{project.name}</h3>
              )}
              <p className="project-desc">
                {project.description || '설명이 없습니다'}
              </p>

              {/* 🔥 G-2: 진행 상황 배지 */}
              <div className="project-status" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '12px',
                marginBottom: '8px'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500',
                  backgroundColor: getProjectStatus(project).color === 'green' ? '#10b98120' :
                    getProjectStatus(project).color === 'blue' ? '#3b82f620' :
                      getProjectStatus(project).color === 'yellow' ? '#eab30820' :
                        '#6b728020',
                  color: getProjectStatus(project).color === 'green' ? '#10b981' :
                    getProjectStatus(project).color === 'blue' ? '#3b82f6' :
                      getProjectStatus(project).color === 'yellow' ? '#eab308' :
                        '#6b7280',
                  border: `1px solid ${getProjectStatus(project).color === 'green' ? '#10b98140' :
                    getProjectStatus(project).color === 'blue' ? '#3b82f640' :
                      getProjectStatus(project).color === 'yellow' ? '#eab30840' :
                        '#6b728040'}`
                }}>
                  {getProjectStatus(project).text}
                </span>
                {getProjectStatus(project).step && (
                  <span style={{
                    fontSize: '11px',
                    color: '#9ca3af'
                  }}>
                    Step {getProjectStatus(project).step}
                  </span>
                )}
              </div>

              <div className="project-meta">
                <div className="meta-item">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
                  </svg>
                  <span>{project.createdBy}</span>
                </div>
                <div className="meta-item">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                    <path d="M16 2V6M8 2V6M3 10H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span>{new Date(project.createdAt).toLocaleDateString('ko-KR')}</span>
                </div>
              </div>

              {/* 프로젝트 ID 표시 (모든 사용자) */}
              <div style={{
                marginTop: '8px',
                padding: '6px 10px',
                backgroundColor: '#374151',
                borderRadius: '4px',
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#9ca3af'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span>프로젝트 ID: {project.id}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(project.id);
                      alert('프로젝트 ID가 복사되었습니다!');
                    }}
                    title="ID 복사"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px',
                      color: '#9ca3af'
                    }}
                    onMouseEnter={(e) => e.target.style.color = 'white'}
                    onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
                  >
                    📋
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 프로젝트 생성 모달 */}
      {
        showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>새 프로젝트 만들기</h2>
                <button
                  className="btn-close"
                  onClick={() => setShowCreateModal(false)}
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="modal-body">
                <div className="form-group">
                  <label>프로젝트 이름 *</label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="예: 브랜드 캠페인 / 신규 런칭 광고"
                    maxLength={100}
                    autoFocus
                  />
                  <span className="char-count">{newProjectName.length}/100</span>
                </div>

                <div className="form-group">
                  <label>설명 (선택)</label>
                  <textarea
                    value={newProjectDesc}
                    onChange={(e) => setNewProjectDesc(e.target.value)}
                    placeholder="프로젝트에 대한 간단한 설명을 입력하세요"
                    rows={4}
                    maxLength={500}
                  />
                  <span className="char-count">{newProjectDesc.length}/500</span>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  className="btn-cancel"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                >
                  취소
                </button>
                <button
                  className="btn-confirm"
                  onClick={handleCreateProject}
                  disabled={creating || !newProjectName.trim()}
                >
                  {creating ? (
                    <>
                      <div className="btn-spinner"></div>
                      생성 중...
                    </>
                  ) : (
                    '생성하기'
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      }
      {/* 멤버 목록 모달 */}
      <MemberListModal
        isOpen={showMemberModal}
        onClose={() => setShowMemberModal(false)}
        projectId={targetProjectId}
        currentUser={user?.username || 'anonymous'}
        isAdmin={user?.username === 'admin'}
      />

      {/* 멤버 초대 모달 */}
      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        projectId={targetProjectId}
        currentUser={user?.username || 'anonymous'}
      />
    </div >
  );
};

ProjectDashboard.propTypes = {
  user: PropTypes.object.isRequired,
  onSelectProject: PropTypes.func.isRequired
};

export default ProjectDashboard;

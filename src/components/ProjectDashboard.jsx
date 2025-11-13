import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './ProjectDashboard.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const ProjectDashboard = ({ user, onSelectProject }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [creating, setCreating] = useState(false);

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
      
      // 목록 새로고침
      await fetchProjects();
      
      // 모달 닫기
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectDesc('');
      
      // 생성된 프로젝트로 바로 이동
      onSelectProject(data.project);
    } catch (err) {
      console.error('프로젝트 생성 에러:', err);
      alert(`프로젝트 생성 실패: ${err.message}`);
    } finally {
      setCreating(false);
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

  return (
    <div className="project-dashboard">
      <div className="dashboard-header">
        <h1>내 프로젝트</h1>
        <button 
          className="btn-create-project"
          onClick={() => setShowCreateModal(true)}
        >
          + 새 프로젝트
        </button>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
          <button onClick={fetchProjects}>다시 시도</button>
        </div>
      )}

      <div className="projects-grid">
        {projects.length === 0 ? (
          <div className="empty-state">
            <p>아직 프로젝트가 없습니다.</p>
            <p>새 프로젝트를 생성해보세요!</p>
          </div>
        ) : (
          projects.map(project => (
            <div 
              key={project.id} 
              className="project-card"
              onClick={() => onSelectProject(project)}
            >
              <h3>{project.name}</h3>
              <p className="project-desc">
                {project.description || '설명 없음'}
              </p>
              <div className="project-meta">
                <span>생성자: {project.createdBy}</span>
                <span>{new Date(project.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>새 프로젝트 만들기</h2>
            
            <div className="form-group">
              <label>프로젝트 이름 *</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="예: 2024 신제품 광고"
                maxLength={100}
              />
            </div>

            <div className="form-group">
              <label>설명 (선택)</label>
              <textarea
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                placeholder="프로젝트에 대한 간단한 설명"
                rows={4}
                maxLength={500}
              />
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
                {creating ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

ProjectDashboard.propTypes = {
  user: PropTypes.object.isRequired,
  onSelectProject: PropTypes.func.isRequired
};

export default ProjectDashboard;

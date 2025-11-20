import React from 'react';
import PropTypes from 'prop-types';
import './ModeSelector.css';

const ModeSelector = ({ project, onSelectMode }) => {
  return (
    <div className="mode-selector">
      <div className="mode-background">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
      </div>
      
      <div className="mode-content">
        <div className="mode-header">
          <h1 className="project-name">{project.name}</h1>
          <p className="project-desc">{project.description}</p>
        </div>

        <h2 className="mode-title">영상 제작 방식을 선택하세요</h2>

        <div className="mode-cards">
          <div 
            className="mode-card auto-mode"
            onClick={() => onSelectMode('auto')}
          >
            <div className="card-glow auto-glow"></div>
            <div className="mode-icon-wrapper">
              <svg className="mode-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="mode-name">Auto Mode</h3>
            <p className="mode-desc">
              옵션 선택만으로 자동 생성
            </p>
            <ul className="mode-features">
              <li><span className="check-icon">✓</span> 빠른 제작</li>
              <li><span className="check-icon">✓</span> 간편한 입력</li>
              <li><span className="check-icon">✓</span> AI 자동 최적화</li>
            </ul>
            <button className="btn-select">
              <span>선택하기</span>
              <svg className="arrow-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div 
            className="mode-card manual-mode"
            onClick={() => onSelectMode('manual')}
          >
            <div className="card-glow manual-glow"></div>
            <div className="mode-icon-wrapper">
              <svg className="mode-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.43741 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="mode-name">Manual Mode</h3>
            <p className="mode-desc">
              세밀한 커스터마이징
            </p>
            <ul className="mode-features">
              <li><span className="check-icon">✓</span> 상세한 제어</li>
              <li><span className="check-icon">✓</span> 자유로운 표현</li>
              <li><span className="check-icon">✓</span> 정밀한 결과물</li>
            </ul>
            <button className="btn-select">
              <span>선택하기</span>
              <svg className="arrow-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="mode-info">
          <div className="info-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 16V12M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <p><strong>Tip:</strong> 처음 사용하시거나 빠른 제작이 필요하다면 Auto Mode를 추천합니다.</p>
        </div>
      </div>
    </div>
  );
};

ModeSelector.propTypes = {
  project: PropTypes.object.isRequired,
  onSelectMode: PropTypes.func.isRequired
};

export default ModeSelector;

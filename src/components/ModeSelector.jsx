import React from 'react';
import PropTypes from 'prop-types';
import './ModeSelector.css';

const ModeSelector = ({ project, onSelectMode }) => {
  return (
    <div className="mode-selector">
      <div className="mode-header">
        <h1>{project.name}</h1>
        <p className="project-desc">{project.description}</p>
      </div>

      <h2 className="mode-title">영상 제작 방식을 선택하세요</h2>

      <div className="mode-cards">
        <div 
          className="mode-card auto-mode"
          onClick={() => onSelectMode('auto')}
        >
          <div className="mode-icon">🤖</div>
          <h3>Auto Mode</h3>
          <p className="mode-desc">
            옵션 선택만으로<br />
            자동 생성
          </p>
          <ul className="mode-features">
            <li>✓ 빠른 제작</li>
            <li>✓ 간편한 입력</li>
            <li>✓ AI 자동 최적화</li>
          </ul>
          <button className="btn-select">선택하기</button>
        </div>

        <div 
          className="mode-card manual-mode"
          onClick={() => onSelectMode('manual')}
        >
          <div className="mode-icon">✍️</div>
          <h3>Manual Mode</h3>
          <p className="mode-desc">
            세밀한<br />
            커스터마이징
          </p>
          <ul className="mode-features">
            <li>✓ 상세한 제어</li>
            <li>✓ 자유로운 표현</li>
            <li>✓ 정밀한 결과물</li>
          </ul>
          <button className="btn-select">선택하기</button>
        </div>
      </div>

      <div className="mode-info">
        <p>💡 <strong>Tip:</strong> 처음 사용하시거나 빠른 제작이 필요하다면 Auto Mode를 추천합니다.</p>
      </div>
    </div>
  );
};

ModeSelector.propTypes = {
  project: PropTypes.object.isRequired,
  onSelectMode: PropTypes.func.isRequired
};

export default ModeSelector;

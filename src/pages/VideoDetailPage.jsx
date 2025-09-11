import React from 'react';

// 필요 시 각 잡 상세 재생 페이지(라우팅 예시용)
export default function VideoDetailPage({ job }) {
  if (!job) return <div>존재하지 않는 작업입니다.</div>;
  return (
    <div style={{ padding: 16 }}>
      <h2>{job.style}</h2>
      {job.videoUrl ? <video src={job.videoUrl} controls width="100%" /> : <div>아직 렌더링 중...</div>}
      <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
        상태: {job.status} / 진행률: {job.progress}%
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { renderSlideshowMp4, mergeMp4Sequential, muxBgm } from '../lib/videoRender';
import BgmPickerModal from '../components/BgmPickerModal';

// 로컬 job 저장/조회 유틸
const JOBS_KEY = 'video_jobs_v1';
function loadJobs() {
  try { return JSON.parse(localStorage.getItem(JOBS_KEY) || '[]'); } catch { return []; }
}
function saveJobs(jobs) {
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
}

// BGM 프리셋(예시 URL 교체 가능)
const BGM_PRESETS = [
  { title: 'Energetic Pop', url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Scott_Holmes_Music/Corporate__Motivational_Music/Scott_Holmes_Music_-_04_-_Upbeat_Party.mp3' },
  { title: 'Ambient Chill', url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Komiku/CHILL/Komiku_-_07_-_Friends_Gathering.mp3' },
  { title: 'Cinematic', url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Komiku/The_Adventure_Begins/Komiku_-_07_-_Epic.mp3' }
];

export default function VideosPage({ storyboardResponse }) {
  const [jobs, setJobs] = useState(loadJobs());
  const [merging, setMerging] = useState(false);
  const [mergedUrl, setMergedUrl] = useState('');
  const [bgmOpen, setBgmOpen] = useState(false);

  // 영상 만들기 버튼에서 storyboardResponse를 넘겨 호출
  useEffect(() => {
    if (!storyboardResponse) return;
    const { storyboard } = storyboardResponse; // api/storyboard 응답의 storyboard(스타일 배열)
    // 스타일별 렌더 잡 생성
    const newJobs = storyboard.map((styleBlock) => ({
      id: `${Date.now()}-${styleBlock.style}`,
      style: styleBlock.style,
      status: 'pending',
      progress: 0,
      videoUrl: '',
      images: styleBlock.images // [{url, duration, sceneNumber}]
    }));
    const merged = [...jobs, ...newJobs];
    setJobs(merged);
    saveJobs(merged);

    // 백그라운드 렌더 트리거
    newJobs.forEach((job, idx) => renderJob(job));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyboardResponse]);

  async function renderJob(job) {
    try {
      updateJob(job.id, { status: 'running', progress: 5 });
      const blob = await renderSlideshowMp4(job.style, job.images);
      const url = URL.createObjectURL(blob);
      updateJob(job.id, { status: 'done', progress: 100, videoUrl: url });
    } catch (e) {
      console.error('renderJob error', e);
      updateJob(job.id, { status: 'error', progress: 100 });
    }
  }

  function updateJob(id, patch) {
    setJobs(prev => {
      const next = prev.map(j => j.id === id ? { ...j, ...patch } : j);
      saveJobs(next);
      return next;
    });
  }

  const doneJobs = useMemo(() => jobs.filter(j => j.status === 'done'), [jobs]);

  async function handleMerge() {
    setMerging(true);
    try {
      const blobs = [];
      for (const j of doneJobs) {
        const resp = await fetch(j.videoUrl);
        blobs.push(await resp.blob());
      }
      const merged = await mergeMp4Sequential(blobs);
      const mergedUrl = URL.createObjectURL(merged);
      setMergedUrl(mergedUrl);
      setBgmOpen(true); // 병합 완료 → BGM 선택 열기
    } catch (e) {
      console.error('merge failed', e);
      alert('영상 합치기에 실패했습니다.');
    } finally {
      setMerging(false);
    }
  }

  async function handlePickBgm(preset) {
    try {
      setBgmOpen(false);
      if (!mergedUrl) return;
      const mergedBlob = await (await fetch(mergedUrl)).blob();
      const out = await muxBgm(mergedBlob, preset.url, { volume: 0.6, loop: true });
      const outUrl = URL.createObjectURL(out);
      setMergedUrl(outUrl);
      alert('BGM 적용 완료');
    } catch (e) {
      console.error('BGM 적용 실패', e);
      alert('BGM 적용에 실패했습니다.');
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>생성된 영상</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {jobs.map(job => (
          <div key={job.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{job.style}</div>
            {job.videoUrl ? (
              <video src={job.videoUrl} controls width="100%" />
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>
                {job.status === 'running' ? '렌더링 중...' : job.status === 'error' ? '오류' : '대기 중'}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
              상태: {job.status} / 진행률: {job.progress}%
            </div>
            {/* 별도 상세 페이지로 이동하려면 라우팅 사용 */}
            {/* <Link to={`/videos/${job.id}`}>자세히 보기</Link> */}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <button onClick={handleMerge} disabled={merging || doneJobs.length === 0}>
          {merging ? '병합 중...' : `영상 합치기 (${doneJobs.length}개)`}
        </button>
      </div>

      {mergedUrl && (
        <div style={{ marginTop: 24 }}>
          <h3>병합 결과</h3>
          <video src={mergedUrl} controls width="100%" />
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setBgmOpen(true)}>BGM 선택/변경</button>
            <a href={mergedUrl} download="merged.mp4" style={{ marginLeft: 8 }}>다운로드</a>
          </div>
        </div>
      )}

      <BgmPickerModal
        open={bgmOpen}
        onClose={() => setBgmOpen(false)}
        onPick={handlePickBgm}
        presets={BGM_PRESETS}
      />
    </div>
  );
}

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

// api/ 아래 기존 Vercel 핸들러들을 그대로 가져옵니다.
import storyboard from '../api/storyboard.js';
import storyboardInit from '../api/storyboard-init.js';
import storyboardRenderImage from '../api/storyboard-render-image.js';
import freepikProxy from '../api/freepik-proxy.js';
import generateVideo from '../api/generate-video.js';
import compileVideos from '../api/compile-videos.js';
import applyBgm from '../api/apply-bgm.js';
import uploadFinalVideo from '../api/upload-final-video.js';
import videoStatus from '../api/video-status.js';
import loadBgmList from '../api/load-bgm-list.js';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS + JSON 파서
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(bodyParser.json({ limit: '5mb' }));

// 헬스체크
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

// 공통 바인더(Express req/res를 그대로 전달)
const bind = (path, handler, { methods = ['POST'], allowOptions = true } = {}) => {
  if (allowOptions) app.options(path, (req, res) => handler(req, res));
  methods.forEach((m) => {
    const method = m.toLowerCase();
    app[method](path, (req, res) => handler(req, res));
  });
};

// 스토리보드(기존 Step2.jsx는 /api/storyboard를 호출)
bind('/api/storyboard', storyboard, { methods: ['POST'] });

// 분할 플로우(이미 리포에 있는 파일들 연결)
bind('/api/storyboard-init', storyboardInit, { methods: ['POST'] });
bind('/api/storyboard-render-image', storyboardRenderImage, { methods: ['POST'] });

// Freepik 검색/프록시 계층
bind('/api/freepik-proxy', freepikProxy, { methods: ['GET'] });

// 비디오 생성/컴파일/BGM/업로드/상태
bind('/api/generate-video', generateVideo, { methods: ['POST'] });
bind('/api/compile-videos', compileVideos, { methods: ['POST'] });
bind('/api/apply-bgm', applyBgm, { methods: ['POST'] });
bind('/api/upload-final-video', uploadFinalVideo, { methods: ['POST'] });
bind('/api/video-status', videoStatus, { methods: ['GET'] });

// BGM 목록
bind('/api/load-bgm-list', loadBgmList, { methods: ['GET'] });

app.listen(PORT, () => {
  console.log(`API server running on http://0.0.0.0:${PORT}`);
});

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

// 기존 핸들러 가져와서 그대로 바인딩
import storyboardInit from '../api/storyboard-init.js';
import storyboardRenderImage from '../api/storyboard-render-image.js';
// 호환을 위해 기존 단일 엔드포인트도 유지하고 싶으면 주석 해제
// import storyboard from '../api/storyboard.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'] }));
app.use(bodyParser.json({ limit: '10mb' }));

// 헬스체크
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

// 공통 바인더
const bind = (path, handler, methods = ['POST']) => {
  app.options(path, (req, res) => handler(req, res));
  methods.forEach((m) => app[m.toLowerCase()](path, (req, res) => handler(req, res)));
};

bind('/api/storyboard-init', storyboardInit, ['POST']);
bind('/api/storyboard-render-image', storyboardRenderImage, ['POST']);
// bind('/api/storyboard', storyboard, ['POST']); // 필요시 유지

app.listen(PORT, () => {
  console.log(`API server running on http://0.0.0.0:${PORT}`);
});

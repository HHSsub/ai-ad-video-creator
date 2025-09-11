import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

import storyboardInit from '../api/storyboard-init.js';
import storyboardRenderImage from '../api/storyboard-render-image.js';
import generateVideo from '../api/generate-video.js';
import videoStatus from '../api/video-status.js';
// 필요시 다른 API도 차례로 바인딩

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'] }));
app.use(bodyParser.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

const bind = (path, handler, methods = ['POST']) => {
  app.options(path, (req, res) => handler(req, res));
  methods.forEach((m) => app[m.toLowerCase()](path, (req, res) => handler(req, res)));
};

bind('/api/storyboard-init', storyboardInit, ['POST']);
bind('/api/storyboard-render-image', storyboardRenderImage, ['POST']);
bind('/api/generate-video', generateVideo, ['POST']);
bind('/api/video-status', videoStatus, ['POST']);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on http://0.0.0.0:${PORT}`);
});

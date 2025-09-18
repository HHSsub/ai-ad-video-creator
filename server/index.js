import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

// API 핸들러 import
import storyboardInit from '../api/storyboard-init.js';
import storyboardRenderImage from '../api/storyboard-render-image.js';
import imageToVideo from '../api/image-to-video.js';
import generateVideo from '../api/generate-video.js';
import videoStatus from '../api/video-status.js';
import compileVideos from '../api/compile-videos.js';
import debug from '../api/debug.js';
// 추가: BGM 관련 API 핸들러 import
import applyBgm from '../api/apply-bgm.js';
import loadMoodList from '../api/load-mood-list.js';
import loadBgmList from '../api/load-bgm-list.js';
import bgmStream from '../api/bgm-stream.js';
import nanobanaCompose from '../api/nanobanana-compose.js'; // 🔥 NEW: Nano Banana 합성 API

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 설정 (모든 origin 허용)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-freepik-api-key']
}));

// Body parser 설정
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV
  });
});

// API 라우트 바인딩 헬퍼
const bindRoute = (path, handler, methods = ['POST']) => {
  app.options(path, (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', methods.join(', ') + ', OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-freepik-api-key');
    res.status(200).end();
  });

  methods.forEach((method) => {
    app[method.toLowerCase()](path, async (req, res) => {
      try {
        await handler(req, res);
      } catch (error) {
        console.error(`[${method} ${path}] 오류:`, error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    });
  });
};

// 모든 API 라우트 등록
bindRoute('/api/storyboard-init', storyboardInit, ['POST']);
bindRoute('/api/storyboard-render-image', storyboardRenderImage, ['POST']);
bindRoute('/api/image-to-video', imageToVideo, ['POST']);
bindRoute('/api/generate-video', generateVideo, ['POST']);
bindRoute('/api/video-status', videoStatus, ['POST']);
bindRoute('/api/compile-videos', compileVideos, ['POST']);
bindRoute('/api/debug', debug, ['GET']);
bindRoute('/api/apply-bgm', applyBgm, ['POST']);
bindRoute('/api/load-mood-list', loadMoodList, ['GET','POST']); // 🔥 BGM mood 드롭다운용
bindRoute('/api/load-bgm-list', loadBgmList, ['GET','POST']);   // 🔥 BGM 리스트
bindRoute('/api/bgm-stream', bgmStream, ['GET','POST']);        // 🔥 BGM 스트림
bindRoute('/api/nanobanana-compose', nanobanaCompose, ['POST']); // 🔥 NEW: Nano Banana 합성

// 정적 파일 서빙
app.use('/tmp', express.static('tmp', {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (path.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// 404 핸들러
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /health',
      'GET /api/debug',
      'POST /api/storyboard-init',
      'POST /api/storyboard-render-image',
      'POST /api/image-to-video',
      'POST /api/generate-video',
      'POST /api/video-status',
      'POST /api/compile-videos',
      'POST /api/apply-bgm',
      'POST /api/load-mood-list',
      'POST /api/load-bgm-list',
      'POST /api/bgm-stream',
      'POST /api/nanobanana-compose' // 🔥 NEW
    ]
  });
});

// 글로벌 에러 핸들러
app.use((error, req, res, next) => {
  console.error('[Global Error Handler]', error);
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 서버 시작 + EADDRINUSE 처리
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI 광고 영상 제작 API 서버 시작됨`);
  console.log(`📍 주소: http://0.0.0.0:${PORT}`);
  console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 API 키 상태:`);
  console.log(`   - Freepik: ${process.env.FREEPIK_API_KEY ? '✅' : '❌'}`);
  console.log(`   - Gemini: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
  console.log(`📋 사용 가능한 엔드포인트:`);
  console.log(`   - GET  /health`);
  console.log(`   - GET  /api/debug`);
  console.log(`   - POST /api/storyboard-init`);
  console.log(`   - POST /api/storyboard-render-image`);
  console.log(`   - POST /api/image-to-video`);
  console.log(`   - POST /api/generate-video`);
  console.log(`   - POST /api/video-status`);
  console.log(`   - POST /api/compile-videos`);
  console.log(`   - POST /api/apply-bgm`);
  console.log(`   - POST /api/load-mood-list`);
  console.log(`   - POST /api/load-bgm-list`);
  console.log(`   - POST /api/bgm-stream`);
  console.log(`   - POST /api/nanobanana-compose`); // 🔥 NEW
  console.log(`💡 디버깅: http://0.0.0.0:${PORT}/api/debug?test=true`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ 포트 ${PORT} 사용 중 (EADDRINUSE). 기존 프로세스 종료 필요.`);
    console.log('\n🛠 해결 방법 예시:');
    console.log(`  lsof -i :${PORT}`);
    console.log(`  sudo fuser -k ${PORT}/tcp`);
    console.log('  pkill -f server/index.js  (또는 pm2 사용 시 pm2 delete <id>)');
    console.log(`  다시 실행: PORT=${PORT} npm run start:api`);
    process.exit(1);
  } else {
    console.error('서버 리스닝 오류:', err);
    process.exit(1);
  }
});

// 종료 시그널
['SIGINT','SIGTERM'].forEach(sig=>{
  process.once(sig, ()=>{
    console.log(`[${sig}] 수신 → 서버 종료 중...`);
    server.close(()=>{
      console.log('✅ 서버 정상 종료');
      process.exit(0);
    });
    setTimeout(()=>process.exit(1),5000).unref();
  });
});

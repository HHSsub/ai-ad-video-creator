import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

// API 핸들러 import
import storyboardInit from '../api/storyboard-init.js';
import storyboardRenderImage from '../api/storyboard-render-image.js';
import imageToVideo from '../api/image-to-video.js'; // 🔥 추가
import generateVideo from '../api/generate-video.js';
import videoStatus from '../api/video-status.js';
import compileVideos from '../api/compile-videos.js';
import debug from '../api/debug.js';

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
  // OPTIONS 요청 처리
  app.options(path, (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', methods.join(', ') + ', OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-freepik-api-key');
    res.status(200).end();
  });
  
  // 각 메소드별 라우트 등록
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

// 🔥 모든 API 라우트 등록 (image-to-video 포함)
bindRoute('/api/storyboard-init', storyboardInit, ['POST']);
bindRoute('/api/storyboard-render-image', storyboardRenderImage, ['POST']);
bindRoute('/api/image-to-video', imageToVideo, ['POST']); // 🔥 누락된 엔드포인트 추가
bindRoute('/api/generate-video', generateVideo, ['POST']);
bindRoute('/api/video-status', videoStatus, ['POST']);
bindRoute('/api/compile-videos', compileVideos, ['POST']);
bindRoute('/api/debug', debug, ['GET']);

// 정적 파일 서빙 (임시 파일들용)
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
      'POST /api/compile-videos'
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

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
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
  console.log(`   - POST /api/image-to-video 🔥`); // 추가됨 표시
  console.log(`   - POST /api/generate-video`);
  console.log(`   - POST /api/video-status`);
  console.log(`   - POST /api/compile-videos`);
  console.log(`💡 디버깅: http://0.0.0.0:${PORT}/api/debug?test=true`);
});

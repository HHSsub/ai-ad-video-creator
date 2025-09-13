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

/* =================================================================================
   Z2M+ PORT HANDLING 개선
   - 기존 코드 유지 + EADDRINUSE 발생 시 친절한 안내 및 선택적 자동 포트 증가
   - AUTO_PORT_FALLBACK=1 환경변수 설정 시 사용 중이면 다음 포트(최대 20회) 탐색
   - 고정 포트 강제하려면 AUTO_PORT_FALLBACK 미설정 또는 0
================================================================================= */

const BASE_PORT = Number(process.env.PORT || 3000);
const AUTO_FALLBACK = String(process.env.AUTO_PORT_FALLBACK || '0') === '1';
const MAX_PORT_SHIFT = 20; // 3000~3020 까지 탐색

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

/* =========================
   Z2M+ 포트 리스너 래퍼
========================= */
function startServer(port, shift = 0) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 AI 광고 영상 제작 API 서버 시작됨`);
    console.log(`📍 주소: http://0.0.0.0:${port}`);
    if (shift > 0) {
      console.log(`⚠️  기본 포트 ${BASE_PORT} 사용 중이어서 +${shift} 포트로 자동 대체 (AUTO_PORT_FALLBACK=1)`);
    }
    console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 API 키 상태:`);
    console.log(`   - Freepik: ${process.env.FREEPIK_API_KEY ? '✅' : '❌'}`);
    console.log(`   - Gemini: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
    console.log(`📋 사용 가능한 엔드포인트:`);
    console.log(`   - GET  /health`);
    console.log(`   - GET  /api/debug`);
    console.log(`   - POST /api/storyboard-init`);
    console.log(`   - POST /api/storyboard-render-image`);
    console.log(`   - POST /api/image-to-video 🔥`);
    console.log(`   - POST /api/generate-video`);
    console.log(`   - POST /api/video-status`);
    console.log(`   - POST /api/compile-videos`);
    console.log(`💡 디버깅: http://0.0.0.0:${port}/api/debug?test=true`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ 포트 ${port} 이미 사용 중 (EADDRINUSE)`);
      if (AUTO_FALLBACK) {
        if (shift < MAX_PORT_SHIFT) {
          const nextPort = BASE_PORT + shift + 1;
            console.log(`🔄 AUTO_PORT_FALLBACK=1 → 포트 ${nextPort} 재시도`);
          setTimeout(() => startServer(nextPort, shift + 1), 500);
        } else {
          console.error(`🚫 자동 포트 탐색 한도 초과 (시도 ${MAX_PORT_SHIFT}회). 프로세스 종료.`);
          printManualKillHelp(port);
          process.exit(1);
        }
      } else {
        printManualKillHelp(port);
        process.exit(1);
      }
    } else {
      console.error('🔥 서버 리스닝 오류:', err);
      process.exit(1);
    }
  });

  // 종료 시그널 처리
  const graceful = (sig) => {
    console.log(`\n[${sig}] 종료 신호 수신 → 서버 종료 중...`);
    server.close(() => {
      console.log('✅ 서버 정상 종료');
      process.exit(0);
    });
    // 5초 내 종료 안되면 강제
    setTimeout(() => {
      console.warn('⏱ 강제 종료');
      process.exit(1);
    }, 5000).unref();
  };
  process.once('SIGINT', () => graceful('SIGINT'));
  process.once('SIGTERM', () => graceful('SIGTERM'));
}

function printManualKillHelp(port){
  console.log(`\n🛠 포트 점유 해결 방법 (Linux/EC2):`);
  console.log(`  lsof -i :${port}`);
  console.log(`  sudo fuser -k ${port}/tcp`);
  console.log(`  pkill -f server/index.js`);
  console.log(`  (pm2 사용 시) pm2 ls && pm2 delete <id>`);
  console.log(`  그런 후 다시: PORT=${port} npm run start:api`);
  console.log(`  또는 임시 다른 포트: PORT=${port+1} npm run start:api`);
}

startServer(BASE_PORT);

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';

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

// =============================================================================
// 🔥 인증 & 프롬프트 관련 API (기존 API들보다 먼저 배치!)
// =============================================================================

// 인증 관련 API
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    // 하드코딩된 사용자 계정
    const users = {
      admin: { password: 'Upnexx!!', role: 'admin', name: '관리자' },
      guest: { password: 'guest1234', role: 'user', name: '게스트' }
    };

    const user = users[username];

    if (user && user.password === password) {
      console.log(`✅ 로그인 성공: ${username} (${user.role})`);
      res.json({
        success: true,
        user: {
          username,
          role: user.role,
          name: user.name
        }
      });
    } else {
      console.log(`❌ 로그인 실패: ${username}`);
      res.status(401).json({
        success: false,
        message: '아이디 또는 비밀번호가 올바르지 않습니다.'
      });
    }
  } catch (error) {
    console.error('로그인 API 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 프롬프트 관련 API
app.get('/api/prompts/get', async (req, res) => {
  try {
    const publicPath = path.join(process.cwd(), 'public');
    
    const inputSecondPrompt = fs.readFileSync(
      path.join(publicPath, 'input_second_prompt.txt'), 
      'utf-8'
    );
    const finalPrompt = fs.readFileSync(
      path.join(publicPath, 'final_prompt.txt'), 
      'utf-8'
    );

    res.json({
      success: true,
      prompts: {
        input_second_prompt: inputSecondPrompt,
        final_prompt: finalPrompt
      }
    });
  } catch (error) {
    console.error('프롬프트 로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '프롬프트 파일을 읽는데 실패했습니다.',
      error: error.message
    });
  }
});

app.post('/api/prompts/update', async (req, res) => {
  try {
    const { filename, content } = req.body;
    
    if (!filename || content === undefined) {
      return res.status(400).json({
        success: false,
        message: '파일명과 내용이 필요합니다.'
      });
    }

    const publicPath = path.join(process.cwd(), 'public');
    const versionsPath = path.join(publicPath, 'versions');
    
    // versions 디렉토리가 없으면 생성
    if (!fs.existsSync(versionsPath)) {
      fs.mkdirSync(versionsPath, { recursive: true });
    }

    const targetFile = filename.endsWith('.txt') ? filename : `${filename}.txt`;
    const filePath = path.join(publicPath, targetFile);
    
    // 기존 파일이 있으면 버전으로 백업
    if (fs.existsSync(filePath)) {
      const existingContent = fs.readFileSync(filePath, 'utf-8');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const versionFileName = `${filename}_${timestamp}.txt`;
      const versionFilePath = path.join(versionsPath, versionFileName);
      
      // 버전 파일 저장
      fs.writeFileSync(versionFilePath, existingContent);
      
      // 버전 메타데이터 저장
      const metadataPath = path.join(versionsPath, 'versions.json');
      let versions = [];
      
      if (fs.existsSync(metadataPath)) {
        try {
          versions = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        } catch (e) {
          versions = [];
        }
      }
      
      versions.unshift({
        id: `${filename}_${timestamp}`,
        filename: targetFile,
        timestamp: new Date().toISOString(),
        preview: existingContent.substring(0, 200) + (existingContent.length > 200 ? '...' : ''),
        versionFile: versionFileName
      });
      
      // 최대 100개 버전만 유지
      versions = versions.slice(0, 100);
      fs.writeFileSync(metadataPath, JSON.stringify(versions, null, 2));
    }

    // 새 내용으로 파일 업데이트
    fs.writeFileSync(filePath, content, 'utf-8');

    console.log(`✅ 프롬프트 업데이트 완료: ${targetFile}`);
    res.json({
      success: true,
      message: '프롬프트가 성공적으로 업데이트되었습니다.'
    });

  } catch (error) {
    console.error('프롬프트 업데이트 오류:', error);
    res.status(500).json({
      success: false,
      message: '프롬프트 업데이트에 실패했습니다.',
      error: error.message
    });
  }
});

app.get('/api/prompts/versions', async (req, res) => {
  try {
    const versionsPath = path.join(process.cwd(), 'public', 'versions');
    const metadataPath = path.join(versionsPath, 'versions.json');
    
    let versions = [];
    
    if (fs.existsSync(metadataPath)) {
      try {
        versions = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      } catch (e) {
        versions = [];
      }
    }

    res.json({
      success: true,
      versions
    });

  } catch (error) {
    console.error('버전 로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '버전 목록을 가져오는데 실패했습니다.',
      error: error.message
    });
  }
});

app.post('/api/prompts/restore', async (req, res) => {
  try {
    const { versionId } = req.body;
    
    if (!versionId) {
      return res.status(400).json({
        success: false,
        message: '버전 ID가 필요합니다.'
      });
    }

    const publicPath = path.join(process.cwd(), 'public');
    const versionsPath = path.join(publicPath, 'versions');
    const metadataPath = path.join(versionsPath, 'versions.json');
    
    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({
        success: false,
        message: '버전 메타데이터를 찾을 수 없습니다.'
      });
    }

    const versions = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const version = versions.find(v => v.id === versionId);
    
    if (!version) {
      return res.status(404).json({
        success: false,
        message: '해당 버전을 찾을 수 없습니다.'
      });
    }

    const versionFilePath = path.join(versionsPath, version.versionFile);
    
    if (!fs.existsSync(versionFilePath)) {
      return res.status(404).json({
        success: false,
        message: '버전 파일을 찾을 수 없습니다.'
      });
    }

    // 현재 파일 백업 (위의 update API와 동일한 로직)
    const currentFilePath = path.join(publicPath, version.filename);
    if (fs.existsSync(currentFilePath)) {
      const currentContent = fs.readFileSync(currentFilePath, 'utf-8');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `${version.filename.replace('.txt', '')}_backup_${timestamp}.txt`;
      const backupFilePath = path.join(versionsPath, backupFileName);
      
      fs.writeFileSync(backupFilePath, currentContent);
      
      // 메타데이터에 백업 추가
      versions.unshift({
        id: `${version.filename.replace('.txt', '')}_backup_${timestamp}`,
        filename: version.filename,
        timestamp: new Date().toISOString(),
        preview: currentContent.substring(0, 200) + (currentContent.length > 200 ? '...' : ''),
        versionFile: backupFileName
      });
    }

    // 버전 파일 내용으로 현재 파일 복원
    const versionContent = fs.readFileSync(versionFilePath, 'utf-8');
    fs.writeFileSync(currentFilePath, versionContent, 'utf-8');
    
    // 업데이트된 메타데이터 저장
    const updatedVersions = versions.slice(0, 100); // 최대 100개 유지
    fs.writeFileSync(metadataPath, JSON.stringify(updatedVersions, null, 2));

    console.log(`✅ 프롬프트 복원 완료: ${version.filename}`);
    res.json({
      success: true,
      message: '성공적으로 복원되었습니다.'
    });

  } catch (error) {
    console.error('프롬프트 복원 오류:', error);
    res.status(500).json({
      success: false,
      message: '복원에 실패했습니다.',
      error: error.message
    });
  }
});

// =============================================================================
// API 라우트 바인딩 헬퍼 (기존 API들)
// =============================================================================
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
  console.log(`❌ 404 요청: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /health',
      'GET /api/debug',
      'POST /api/auth/login',
      'GET /api/prompts/get',
      'POST /api/prompts/update',
      'GET /api/prompts/versions',
      'POST /api/prompts/restore',
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
  console.log(`📋 새로운 인증 API:`);
  console.log(`   - POST /api/auth/login`);
  console.log(`   - GET  /api/prompts/get`);
  console.log(`   - POST /api/prompts/update`);
  console.log(`   - GET  /api/prompts/versions`);
  console.log(`   - POST /api/prompts/restore`);
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

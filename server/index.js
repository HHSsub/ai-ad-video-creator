import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';

// 🔥 현재 파일 경로 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 🔥 .env 파일 명시적 로드
import dotenv from 'dotenv';
const envPath = resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

console.log('🔑 환경변수 로드:', {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY?.substring(0, 15) + '...',
  FREEPIK_API_KEY: process.env.FREEPIK_API_KEY ? '✅' : '❌'
});

// API 모듈 import
import usersApi from '../api/users.js';
import storyboardInit from '../api/storyboard-init.js';
import storyboardRenderImage from '../api/storyboard-render-image.js';
import imageToVideo from '../api/image-to-video.js';
import generateVideo from '../api/generate-video.js';
import videoStatus from '../api/video-status.js';
import compileVideos from '../api/compile-videos.js';
import debug from '../api/debug.js';
import applyBgm from '../api/apply-bgm.js';
import loadMoodList from '../api/load-mood-list.js';
import loadBgmList from '../api/load-bgm-list.js';
import bgmStream from '../api/bgm-stream.js';
import nanobanaCompose from '../api/nanobanana-compose.js';
import adminConfig from '../api/admin-config.js';
import adminFieldConfig from '../api/admin-field-config.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 HTTP 서버와 WebSocket 서버 생성
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 🔥 연결된 모든 WebSocket 클라이언트 추적
const clients = new Set();

// 🔥 WebSocket 연결 처리
wss.on('connection', (ws, req) => {
  console.log('🔗 새 WebSocket 클라이언트 연결됨');
  clients.add(ws);
  
  // 클라이언트 메시지 처리
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 WebSocket 메시지 수신:', data.type);
      
      // Admin의 설정 변경 메시지인 경우 모든 클라이언트에 브로드캐스트
      if (data.type === 'ADMIN_CONFIG_UPDATE') {
        broadcastToAllClients({
          type: 'CONFIG_SYNC_UPDATE',
          config: data.config,
          adminSettings: data.adminSettings,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('❌ WebSocket 메시지 처리 오류:', error);
    }
  });
  
  // 연결 종료 처리
  ws.on('close', () => {
    console.log('📴 WebSocket 클라이언트 연결 종료');
    clients.delete(ws);
  });
  
  // 에러 처리
  ws.on('error', (error) => {
    console.error('❌ WebSocket 오류:', error);
    clients.delete(ws);
  });
});

// 🔥 모든 클라이언트에 메시지 브로드캐스트 함수
function broadcastToAllClients(message) {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  
  clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      try {
        client.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error('❌ 클라이언트 전송 오류:', error);
        clients.delete(client);
      }
    } else {
      clients.delete(client);
    }
  });
  
  console.log(`📡 설정 변경을 ${sentCount}개 클라이언트에 브로드캐스트`);
}

// 🔥 브로드캐스트 함수를 전역으로 내보내기
export { broadcastToAllClients };

// Express 미들웨어 설정
app.use((req, res, next) => {
  req.setTimeout(1800000);
  res.setTimeout(1800000);
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-freepik-api-key', 'x-username'],
  maxAge: 86400
}));

app.use(bodyParser.json({ 
  limit: '100mb',
  extended: true,
  parameterLimit: 50000
}));
app.use(bodyParser.urlencoded({ 
  extended: true, 
  limit: '100mb',
  parameterLimit: 50000
}));

// API 라우터 등록
app.use('/api/admin-config', adminConfig);
app.use('/api/users', usersApi);
app.use('/api/admin-field-config', adminFieldConfig);

// 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV,
    websocket: {
      connected: clients.size,
      status: 'active'
    },
    apiKeys: {
      gemini: !!process.env.GEMINI_API_KEY,
      freepik: !!process.env.FREEPIK_API_KEY
    }
  });
});

// 로그인 API
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    const USERS_FILE = path.join(process.cwd(), 'config', 'users.json');
    
    if (!fs.existsSync(USERS_FILE)) {
      console.error('[auth/login] config/users.json 파일이 없습니다.');
      return res.status(500).json({
        success: false,
        message: '서버 설정 오류입니다. 관리자에게 문의하세요.'
      });
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const user = users[username];

    if (user && user.password === password) {
      console.log(`✅ 로그인 성공: ${username} (${user.role})`);
      res.json({
        success: true,
        user: {
          username: user.id,
          role: user.role,
          name: user.name,
          usageLimit: user.usageLimit,
          usageCount: user.usageCount
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

// 프롬프트 관련 설정
const PROMPT_FILES = {
  step1_product: 'public/Prompt_step1_product.txt',
  step1_service: 'public/Prompt_step1_service.txt', 
  step2_product: 'public/Prompt_step2_product.txt',
  step2_service: 'public/Prompt_step2_service.txt'
};

// 프롬프트 조회 API
app.get('/api/prompts/get', async (req, res) => {
  try {
    const publicPath = path.join(process.cwd(), 'public');
    const prompts = {};

    for (const [key, relativePath] of Object.entries(PROMPT_FILES)) {
      try {
        const content = fs.readFileSync(path.join(publicPath, path.basename(relativePath)), 'utf-8');
        prompts[key] = content;
      } catch (error) {
        console.error(`프롬프트 파일 읽기 실패: ${key}`, error.message);
        prompts[key] = '';
      }
    }

    res.json({
      success: true,
      prompts
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

// 프롬프트 업데이트 API
app.post('/api/prompts/update', async (req, res) => {
  try {
    const { filename, content } = req.body;
    
    if (!filename || content === undefined) {
      return res.status(400).json({
        success: false,
        message: '파일명과 내용이 필요합니다.'
      });
    }

    if (!PROMPT_FILES[filename]) {
      return res.status(400).json({
        success: false,
        message: '유효하지 않은 프롬프트 파일명입니다.'
      });
    }

    const publicPath = path.join(process.cwd(), 'public');
    const versionsPath = path.join(publicPath, 'versions');
    
    if (!fs.existsSync(versionsPath)) {
      fs.mkdirSync(versionsPath, { recursive: true });
    }

    const actualFileName = path.basename(PROMPT_FILES[filename]);
    const filePath = path.join(publicPath, actualFileName);
    
    if (fs.existsSync(filePath)) {
      const existingContent = fs.readFileSync(filePath, 'utf-8');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(versionsPath, `${filename}_${timestamp}.txt`);
      fs.writeFileSync(backupPath, existingContent);
    }
    
    fs.writeFileSync(filePath, content);

    const metadataPath = path.join(versionsPath, 'versions.json');
    let versions = [];
    
    if (fs.existsSync(metadataPath)) {
      try {
        versions = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      } catch (e) {
        versions = [];
      }
    }

    const versionEntry = {
      id: `${filename}_${Date.now()}`,
      filename: actualFileName,
      promptKey: filename,
      timestamp: new Date().toISOString(),
      versionFile: `${filename}_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    };

    versions.unshift(versionEntry);
    
    const limitedVersions = versions.slice(0, 100);
    fs.writeFileSync(metadataPath, JSON.stringify(limitedVersions, null, 2));

    console.log(`✅ 프롬프트 업데이트 완료: ${filename}`);
    res.json({
      success: true,
      message: '프롬프트가 성공적으로 업데이트되었습니다.',
      filename
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

// 프롬프트 버전 조회 API
app.get('/api/prompts/versions', async (req, res) => {
  try {
    const publicPath = path.join(process.cwd(), 'public');
    const versionsPath = path.join(publicPath, 'versions');
    const metadataPath = path.join(versionsPath, 'versions.json');
    
    if (!fs.existsSync(metadataPath)) {
      return res.json({
        success: true,
        versions: []
      });
    }

    const versions = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    
    res.json({
      success: true,
      versions: versions.slice(0, 50)
    });

  } catch (error) {
    console.error('버전 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '버전 목록 조회에 실패했습니다.',
      error: error.message
    });
  }
});

// 프롬프트 복원 API
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

    const currentFilePath = path.join(publicPath, version.filename);
    if (fs.existsSync(currentFilePath)) {
      const currentContent = fs.readFileSync(currentFilePath, 'utf-8');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(versionsPath, `restore_backup_${timestamp}.txt`);
      fs.writeFileSync(backupPath, currentContent);
    }
    
    const versionContent = fs.readFileSync(versionFilePath, 'utf-8');
    fs.writeFileSync(currentFilePath, versionContent);

    console.log(`✅ 프롬프트 복원 완료: ${versionId}`);
    res.json({
      success: true,
      message: '프롬프트가 복원되었습니다.'
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

// Gemini 응답 저장 API
app.post('/api/prompts/save-response', async (req, res) => {
  try {
    const { promptKey, step, formData, response, timestamp } = req.body;
    
    if (!promptKey || !step || !response) {
      return res.status(400).json({
        success: false,
        message: '필수 데이터가 누락되었습니다.'
      });
    }

    const responsesPath = path.join(process.cwd(), 'public', 'gemini_responses');
    
    if (!fs.existsSync(responsesPath)) {
      fs.mkdirSync(responsesPath, { recursive: true });
    }

    const fileName = `${promptKey}_${step}_${timestamp || Date.now()}.json`;
    const filePath = path.join(responsesPath, fileName);
    
    const responseData = {
      promptKey,
      step,
      formData: formData || {},
      response,
      timestamp: timestamp || new Date().toISOString(),
      savedAt: new Date().toISOString()
    };

    fs.writeFileSync(filePath, JSON.stringify(responseData, null, 2), 'utf-8');

    console.log(`✅ Gemini 응답 저장 완료: ${fileName}`);
    res.json({
      success: true,
      message: 'Gemini 응답이 저장되었습니다.',
      fileName
    });

  } catch (error) {
    console.error('Gemini 응답 저장 오류:', error);
    res.status(500).json({
      success: false,
      message: 'Gemini 응답 저장에 실패했습니다.',
      error: error.message
    });
  }
});

// Gemini 응답 조회 API
app.get('/api/prompts/responses/:promptKey', async (req, res) => {
  try {
    const { promptKey } = req.params;
    const responsesPath = path.join(process.cwd(), 'public', 'gemini_responses');
    
    if (!fs.existsSync(responsesPath)) {
      return res.json({
        success: true,
        responses: []
      });
    }

    const files = fs.readdirSync(responsesPath)
      .filter(file => file.startsWith(`${promptKey}_`) && file.endsWith('.json'))
      .sort((a, b) => {
        const aTimestamp = a.split('_').pop().replace('.json', '');
        const bTimestamp = b.split('_').pop().replace('.json', '');
        return parseInt(bTimestamp) - parseInt(aTimestamp);
      });

    const responses = [];
    
    for (const file of files.slice(0, 20)) {
      try {
        const filePath = path.join(responsesPath, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        responses.push({
          fileName: file,
          ...content,
          preview: content.response ? content.response.substring(0, 300) + '...' : ''
        });
      } catch (error) {
        console.error(`파일 읽기 실패: ${file}`, error.message);
      }
    }

    res.json({
      success: true,
      responses
    });

  } catch (error) {
    console.error('Gemini 응답 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: 'Gemini 응답 조회에 실패했습니다.',
      error: error.message
    });
  }
});

// Gemini 응답 상세 조회 API
app.get('/api/prompts/response-detail/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    const responsesPath = path.join(process.cwd(), 'public', 'gemini_responses');
    const filePath = path.join(responsesPath, fileName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: '응답 파일을 찾을 수 없습니다.'
      });
    }

    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    res.json({
      success: true,
      data: content
    });

  } catch (error) {
    console.error('Gemini 응답 상세 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: 'Gemini 응답 상세 조회에 실패했습니다.',
      error: error.message
    });
  }
});

// 기타 API 라우터들
app.use('/api/storyboard-init', storyboardInit);
app.use('/api/storyboard-render-image', storyboardRenderImage);
app.use('/api/image-to-video', imageToVideo);
app.use('/api/generate-video', generateVideo);
app.use('/api/video-status', videoStatus);
app.use('/api/compile-videos', compileVideos);
app.use('/api/debug', debug);
app.use('/api/apply-bgm', applyBgm);
app.use('/api/load-mood-list', loadMoodList);
app.use('/api/load-bgm-list', loadBgmList);
app.use('/api/bgm-stream', bgmStream);
app.use('/api/nanobanana-compose', nanobanaCompose);

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
      'GET /api/load-mood-list',
      'GET /api/load-bgm-list',
      'GET /api/bgm-stream',
      'POST /api/nanobanana-compose'
    ]
  });
});

// 전역 에러 핸들러
app.use((error, req, res, next) => {
  console.error('[Global Error Handler]', error);
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage()
    });
  }
});

// 🔥 HTTP 서버 시작 (WebSocket 포함)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI 광고 영상 제작 API 서버 시작됨`);
  console.log(`📍 주소: http://0.0.0.0:${PORT}`);
  console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 WebSocket 서버: ws://0.0.0.0:${PORT}`);
  console.log(`🔑 API 키 상태:`);
  console.log(`   - Freepik: ${process.env.FREEPIK_API_KEY ? '✅' : '❌'}`);
  console.log(`   - Gemini: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
  console.log(`💡 디버깅: http://0.0.0.0:${PORT}/api/debug?test=true`);
  
  server.timeout = 300000;
  server.keepAliveTimeout = 300000;
  server.headersTimeout = 305000;
  
  console.log(`⏱️ 서버 타임아웃: ${server.timeout}ms`);
});

// 서버 에러 처리
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ 포트 ${PORT} 사용 중 (EADDRINUSE). 기존 프로세스 종료 필요.`);
    console.log('\n🛠 해결 방법 예시:');
    console.log(`  lsof -i :${PORT}`);
    console.log(`  sudo fuser -k ${PORT}/tcp`);
    console.log('  pkill -f server/index.js');
    console.log(`  다시 실행: PORT=${PORT} npm run start:api`);
    process.exit(1);
  } else {
    console.error('서버 리스닝 오류:', err);
    process.exit(1);
  }
});

// 연결 타임아웃 설정
server.on('connection', (socket) => {
  socket.setTimeout(300000);
  socket.setKeepAlive(true, 1000);
});

// 우아한 종료 처리
['SIGINT','SIGTERM'].forEach(sig=>{
  process.once(sig, ()=>{
    console.log(`[${sig}] 수신 → 서버 종료 중...`);
    
    // WebSocket 클라이언트들에게 종료 알림
    broadcastToAllClients({
      type: 'SERVER_SHUTDOWN',
      message: '서버가 종료됩니다.',
      timestamp: Date.now()
    });
    
    // WebSocket 서버 종료
    wss.close(() => {
      console.log('📡 WebSocket 서버 종료 완료');
    });
    
    server.close(()=>{
      console.log('✅ 서버 정상 종료');
      process.exit(0);
    });
    setTimeout(()=>process.exit(1),5000).unref();
  });
});

// 메모리 모니터링
setInterval(() => {
  const memory = process.memoryUsage();
  const mbUsed = Math.round(memory.heapUsed / 1024 / 1024);
  if (mbUsed > 500) {
    console.warn(`⚠️ 메모리 사용량 높음: ${mbUsed}MB`);
  }
}, 60000);

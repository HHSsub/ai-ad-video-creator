import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import usersApi from '../api/users.js'; // 🔥 이 한 줄만 추가

// API 핸들러 import
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

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 서버 타임아웃 설정 강화
app.use((req, res, next) => {
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
});

// CORS 설정
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-freepik-api-key', 'x-username'], // 🔥 x-username 추가
  maxAge: 86400
}));

app.use('/api/admin-config', adminConfig);
app.use('/api/users', usersApi); // 🔥 이 한 줄만 추가

// Body parser 설정 강화
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

// 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV,
    apiKeys: {
      gemini: !!process.env.GEMINI_API_KEY,
      freepik: !!process.env.FREEPIK_API_KEY
    }
  });
});

// 인증 관련 API
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    const USERS_FILE = path.join(process.cwd(), 'config', 'users.json');
    
    if (!fs.existsSync(USERS_FILE)) {
      console.error('[auth/login] ❌ config/users.json 파일이 없습니다.');
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

// 4개 프롬프트 파일 경로 정의
const PROMPT_FILES = {
  step1_product: 'public/Prompt_step1_product.txt',
  step1_service: 'public/Prompt_step1_service.txt', 
  step2_product: 'public/Prompt_step2_product.txt',
  step2_service: 'public/Prompt_step2_service.txt'
};

// 프롬프트 로드 API - 4개 프롬프트 지원
app.get('/api/prompts/get', async (req, res) => {
  try {
    const publicPath = path.join(process.cwd(), 'public');
    const prompts = {};

    // 4개 프롬프트 파일 모두 읽기
    for (const [key, relativePath] of Object.entries(PROMPT_FILES)) {
      try {
        const content = fs.readFileSync(path.join(publicPath, path.basename(relativePath)), 'utf-8');
        prompts[key] = content;
      } catch (error) {
        console.error(`프롬프트 파일 읽기 실패: ${key}`, error.message);
        prompts[key] = ''; // 파일이 없으면 빈 문자열로 초기화
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

// 프롬프트 업데이트 API - 4개 프롬프트 지원
app.post('/api/prompts/update', async (req, res) => {
  try {
    const { filename, content } = req.body;
    
    if (!filename || content === undefined) {
      return res.status(400).json({
        success: false,
        message: '파일명과 내용이 필요합니다.'
      });
    }

    // 유효한 프롬프트 키인지 확인
    if (!PROMPT_FILES[filename]) {
      return res.status(400).json({
        success: false,
        message: '유효하지 않은 프롬프트 파일명입니다.'
      });
    }

    const publicPath = path.join(process.cwd(), 'public');
    const versionsPath = path.join(publicPath, 'versions');
    
    // 버전 디렉토리 생성
    if (!fs.existsSync(versionsPath)) {
      fs.mkdirSync(versionsPath, { recursive: true });
    }

    // 실제 파일명 (경로에서 파일명만 추출)
    const actualFileName = path.basename(PROMPT_FILES[filename]);
    const filePath = path.join(publicPath, actualFileName);
    
    // 기존 파일이 있으면 백업
    if (fs.existsSync(filePath)) {
      const existingContent = fs.readFileSync(filePath, 'utf-8');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `${filename}_backup_${timestamp}.txt`;
      const backupFilePath = path.join(versionsPath, backupFileName);
      
      fs.writeFileSync(backupFilePath, existingContent);
      console.log(`기존 프롬프트 백업: ${backupFileName}`);
    }

    // 새 프롬프트 저장
    fs.writeFileSync(filePath, content, 'utf-8');

    // 버전 메타데이터 업데이트
    const metadataPath = path.join(versionsPath, 'versions.json');
    let versions = [];
    
    if (fs.existsSync(metadataPath)) {
      try {
        versions = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      } catch (error) {
        console.error('기존 버전 메타데이터 파싱 실패:', error);
      }
    }

    const versionEntry = {
      id: `${filename}_${Date.now()}`,
      filename: actualFileName,
      promptKey: filename,
      timestamp: new Date().toISOString(),
      preview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
      versionFile: `${filename}_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    };

    versions.unshift(versionEntry);
    
    // 최대 100개 버전만 유지
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

// 프롬프트 버전 목록 조회 API
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
      versions: versions.slice(0, 50) // 최근 50개만 반환
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

    // 현재 파일을 백업하고 복원
    const currentFilePath = path.join(publicPath, version.filename);
    if (fs.existsSync(currentFilePath)) {
      const currentContent = fs.readFileSync(currentFilePath, 'utf-8');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `${version.promptKey || 'unknown'}_backup_${timestamp}.txt`;
      const backupFilePath = path.join(versionsPath, backupFileName);
      
      fs.writeFileSync(backupFilePath, currentContent);
      
      // 백업 정보를 버전 히스토리에 추가
      versions.unshift({
        id: `${version.promptKey || 'unknown'}_backup_${timestamp}`,
        filename: version.filename,
        promptKey: version.promptKey,
        timestamp: new Date().toISOString(),
        preview: currentContent.substring(0, 200) + (currentContent.length > 200 ? '...' : ''),
        versionFile: backupFileName,
        isBackup: true
      });
    }

    // 선택한 버전으로 복원
    const versionContent = fs.readFileSync(versionFilePath, 'utf-8');
    fs.writeFileSync(currentFilePath, versionContent, 'utf-8');
    
    // 업데이트된 버전 히스토리 저장
    const updatedVersions = versions.slice(0, 100);
    fs.writeFileSync(metadataPath, JSON.stringify(updatedVersions, null, 2));

    console.log(`✅ 프롬프트 복원 완료: ${version.filename} (${version.promptKey})`);
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
    
    // 디렉토리 생성
    if (!fs.existsSync(responsesPath)) {
      fs.mkdirSync(responsesPath, { recursive: true });
    }

    // 파일명: promptKey_step_timestamp.json
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

// 프롬프트별 Gemini 응답 조회 API
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

    // 해당 프롬프트 키로 시작하는 파일들 찾기
    const files = fs.readdirSync(responsesPath)
      .filter(file => file.startsWith(`${promptKey}_`) && file.endsWith('.json'))
      .sort((a, b) => {
        // 파일명에서 타임스탬프 추출하여 최신 순으로 정렬
        const aTimestamp = a.split('_').pop().replace('.json', '');
        const bTimestamp = b.split('_').pop().replace('.json', '');
        return parseInt(bTimestamp) - parseInt(aTimestamp);
      });

    const responses = [];
    
    for (const file of files.slice(0, 20)) { // 최대 20개만
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

// 특정 Gemini 응답 상세 조회 API
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

// ===============================================
// 🔥 API 라우트들 - 중복 제거 및 단순화
// ===============================================

// 정적 API 라우트들
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

// 글로벌 에러 핸들러
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

// 서버 시작
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI 광고 영상 제작 API 서버 시작됨`);
  console.log(`📍 주소: http://0.0.0.0:${PORT}`);
  console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 API 키 상태:`);
  console.log(`   - Freepik: ${process.env.FREEPIK_API_KEY ? '✅' : '❌'}`);
  console.log(`   - Gemini: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
  console.log(`💡 디버깅: http://0.0.0.0:${PORT}/api/debug?test=true`);
  
  server.timeout = 300000;
  server.keepAliveTimeout = 300000;
  server.headersTimeout = 305000;
  
  console.log(`⏱️ 서버 타임아웃: ${server.timeout}ms`);
});

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

server.on('connection', (socket) => {
  socket.setTimeout(300000);
  socket.setKeepAlive(true, 1000);
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

// 메모리 사용량 모니터링
setInterval(() => {
  const memory = process.memoryUsage();
  const mbUsed = Math.round(memory.heapUsed / 1024 / 1024);
  if (mbUsed > 500) {
    console.warn(`⚠️ 메모리 사용량 높음: ${mbUsed}MB`);
  }
}, 60000);

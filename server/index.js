import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import dotenv from 'dotenv';
const envPath = resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

console.log('🔑 환경변수 로드:', {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY?.substring(0, 15) + '...',
  FREEPIK_API_KEY: process.env.FREEPIK_API_KEY ? '✅' : '❌'
});

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
// 🔥 세션 저장소 (메모리)
const activeSessions = new Map();

// 세션 시작
app.post('/api/session/start', (req, res) => {
  try {
    const { sessionId, formData, timestamp } = req.body;
    const username = req.headers['x-username'] || 'anonymous';
    
    activeSessions.set(username, {
      sessionId,
      formData,
      timestamp,
      progress: 0,
      completed: false,
      storyboard: null
    });
    
    console.log(`[session] 세션 시작: ${username} (${sessionId})`);
    
    res.json({
      success: true,
      sessionId
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 세션 확인
app.get('/api/session/check', (req, res) => {
  try {
    const username = req.headers['x-username'] || 'anonymous';
    const session = activeSessions.get(username);
    
    if (session && !session.completed) {
      res.json({
        hasOngoingSession: true,
        session
      });
    } else {
      res.json({
        hasOngoingSession: false
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 세션 상태 조회
app.get('/api/session/status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const username = req.headers['x-username'] || 'anonymous';
    const session = activeSessions.get(username);
    
    if (session && session.sessionId === sessionId) {
      res.json({
        success: true,
        ...session
      });
    } else {
      res.json({
        success: false,
        message: '세션을 찾을 수 없습니다.'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 세션 업데이트 (storyboard-init에서 호출)
app.post('/api/session/update', (req, res) => {
  try {
    const { sessionId, progress, message, storyboard, completed } = req.body;
    const username = req.headers['x-username'] || 'anonymous';
    const session = activeSessions.get(username);
    
    if (session && session.sessionId === sessionId) {
      session.progress = progress || session.progress;
      session.message = message;
      session.completed = completed || false;
      
      if (storyboard) {
        session.storyboard = storyboard;
      }
      
      activeSessions.set(username, session);
      
      res.json({ success: true });
    } else {
      res.json({ success: false, message: '세션을 찾을 수 없습니다.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 세션 클리어
app.post('/api/session/clear', (req, res) => {
  try {
    const username = req.headers['x-username'] || 'anonymous';
    activeSessions.delete(username);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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

app.use('/api/admin-config', adminConfig);
app.use('/api/users', usersApi);
app.use('/api/admin-field-config', adminFieldConfig);

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

const PROMPT_FILES = {
  step1_product: 'public/Prompt_step1_product.txt',
  step1_service: 'public/Prompt_step1_service.txt', 
  step2_product: 'public/Prompt_step2_product.txt',
  step2_service: 'public/Prompt_step2_service.txt'
};

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

// 🔥 프롬프트 테스트 API
app.post('/api/prompts/test', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { promptKey, step, formData, promptContent } = req.body;
    
    console.log('[prompts/test] 테스트 요청:', { promptKey, step });
    
    if (!promptKey || !step || !promptContent || !formData) {
      return res.status(400).json({
        success: false,
        message: '필수 데이터가 누락되었습니다.',
        error: 'promptKey, step, formData, promptContent가 필요합니다.'
      });
    }

    // safeCallGemini import
    const { safeCallGemini } = await import('../src/utils/apiHelpers.js');
    
    // Step1 프롬프트 변수 치환
    let step1PromptTemplate = promptContent;
    
    const step1Variables = {
      brandName: formData.brandName || '',
      industryCategory: formData.industryCategory || '',
      productServiceCategory: formData.productServiceCategory || '',
      productServiceName: formData.productServiceName || '',
      videoPurpose: formData.videoPurpose || 'product',
      videoLength: formData.videoLength || '10초',
      coreTarget: formData.coreTarget || '',
      coreDifferentiation: formData.coreDifferentiation || '',
      videoRequirements: '없음',
      brandLogo: '없음',
      productImage: '없음',
      aspectRatioCode: formData.aspectRatioCode || 'widescreen_16_9'
    };

    for (const [key, value] of Object.entries(step1Variables)) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      step1PromptTemplate = step1PromptTemplate.replace(placeholder, value);
    }

    console.log('[prompts/test] Step1 Gemini 호출 시작...');
    
    let step1Response;
    try {
      const step1Result = await safeCallGemini(step1PromptTemplate, {
        label: 'PROMPT-TEST-STEP1',
        maxRetries: 2,
        isImageComposition: false
      });
      step1Response = step1Result.text;
      console.log('[prompts/test] ✅ Step1 완료:', step1Response.length, 'chars');
    } catch (step1Error) {
      console.error('[prompts/test] ❌ Step1 실패:', step1Error);
      
      // 사용자 친화적 에러 메시지
      let friendlyError = 'Step1 프롬프트 테스트 중 오류가 발생했습니다.';
      if (step1Error.message.includes('quota') || step1Error.message.includes('rate limit')) {
        friendlyError = '🚫 API 한도 초과: Gemini API 사용량이 초과되었습니다. 잠시 후 다시 시도해주세요.';
      } else if (step1Error.message.includes('timeout')) {
        friendlyError = '⏰ 타임아웃: 응답 시간이 너무 오래 걸렸습니다. 프롬프트 길이를 줄이거나 다시 시도해주세요.';
      } else if (step1Error.message.includes('API key')) {
        friendlyError = '🔑 API 키 오류: Gemini API 키가 올바르지 않거나 설정되지 않았습니다.';
      }
      
      return res.status(500).json({
        success: false,
        step: 'step1',
        error: friendlyError,
        technicalError: step1Error.message,
        processingTime: Date.now() - startTime
      });
    }

    // Step2가 필요한 경우
    let step2Response = null;
    if (step === 'step2' || promptKey.includes('step2')) {
      console.log('[prompts/test] Step2 프롬프트 로드 시작...');
      
      // Step2 프롬프트 파일 로드
      const step2PromptKey = promptKey.includes('product') ? 'step2_product' : 'step2_service';
      const step2FileName = PROMPT_FILES[step2PromptKey];
      
      if (!step2FileName) {
        return res.status(400).json({
          success: false,
          message: 'Step2 프롬프트 파일을 찾을 수 없습니다.',
          error: `Invalid promptKey: ${step2PromptKey}`
        });
      }
      
      const publicPath = path.join(process.cwd(), 'public');
      const step2FilePath = path.join(publicPath, path.basename(step2FileName));
      
      if (!fs.existsSync(step2FilePath)) {
        return res.status(404).json({
          success: false,
          message: 'Step2 프롬프트 파일이 존재하지 않습니다.',
          error: `File not found: ${step2FilePath}`
        });
      }
      
      let step2PromptTemplate = fs.readFileSync(step2FilePath, 'utf-8');
      
      // Step2 변수 치환
      const step2Variables = {
        phase1_output: step1Response,
        sceneCount: 5,
        brandName: formData.brandName || '',
        videoPurpose: formData.videoPurpose || '',
        videoLength: formData.videoLength || '10'
      };
      
      for (const [key, value] of Object.entries(step2Variables)) {
        const placeholder = new RegExp(`\\{${key}\\}`, 'g');
        step2PromptTemplate = step2PromptTemplate.replace(placeholder, String(value));
      }
      
      console.log('[prompts/test] Step2 Gemini 호출 시작...');
      
      try {
        const step2Result = await safeCallGemini(step2PromptTemplate, {
          label: 'PROMPT-TEST-STEP2',
          maxRetries: 2,
          isImageComposition: false
        });
        step2Response = step2Result.text;
        console.log('[prompts/test] ✅ Step2 완료:', step2Response.length, 'chars');
        
        // JSON 파싱 테스트
        try {
          const conceptPattern = /###\s*(\d+)\.\s*컨셉:\s*(.+)/g;
          const conceptMatches = [...step2Response.matchAll(conceptPattern)];
          
          if (conceptMatches.length === 0) {
            console.warn('[prompts/test] ⚠️ 컨셉 헤더를 찾을 수 없음 - JSON 파싱 실패 가능성');
          } else {
            console.log('[prompts/test] ✅ JSON 파싱 가능:', conceptMatches.length, '개 컨셉 발견');
          }
        } catch (parseError) {
          console.warn('[prompts/test] ⚠️ JSON 파싱 경고:', parseError.message);
        }
        
      } catch (step2Error) {
        console.error('[prompts/test] ❌ Step2 실패:', step2Error);
        
        let friendlyError = 'Step2 프롬프트 테스트 중 오류가 발생했습니다.';
        if (step2Error.message.includes('quota') || step2Error.message.includes('rate limit')) {
          friendlyError = '🚫 API 한도 초과: Gemini API 사용량이 초과되었습니다. 잠시 후 다시 시도해주세요.';
        } else if (step2Error.message.includes('timeout')) {
          friendlyError = '⏰ 타임아웃: 응답 시간이 너무 오래 걸렸습니다. 프롬프트 길이를 줄이거나 다시 시도해주세요.';
        } else if (step2Error.message.includes('API key')) {
          friendlyError = '🔑 API 키 오류: Gemini API 키가 올바르지 않거나 설정되지 않았습니다.';
        }
        
        return res.status(500).json({
          success: false,
          step: 'step2',
          step1Response: step1Response,
          error: friendlyError,
          technicalError: step2Error.message,
          processingTime: Date.now() - startTime
        });
      }
    }

    // 응답 저장
    const responsesPath = path.join(process.cwd(), 'public', 'gemini_responses');
    if (!fs.existsSync(responsesPath)) {
      fs.mkdirSync(responsesPath, { recursive: true });
    }

    const timestamp = Date.now();
    const fileName = `${promptKey}_test_${timestamp}.json`;
    const filePath = path.join(responsesPath, fileName);
    
    const responseData = {
      promptKey,
      step: 'test',
      formData: formData,
      response: step2Response || step1Response,
      rawStep1Response: step1Response,
      rawStep2Response: step2Response,
      timestamp: new Date().toISOString(),
      savedAt: new Date().toISOString(),
      isTest: true
    };

    fs.writeFileSync(filePath, JSON.stringify(responseData, null, 2), 'utf-8');

    console.log('[prompts/test] ✅ 테스트 완료 및 저장:', fileName);

    res.json({
      success: true,
      message: '프롬프트 테스트가 완료되었습니다.',
      step1Response: step1Response ? {
        length: step1Response.length,
        preview: step1Response.substring(0, 500) + '...',
        success: true
      } : null,
      step2Response: step2Response ? {
        length: step2Response.length,
        preview: step2Response.substring(0, 500) + '...',
        success: true,
        jsonParseStatus: step2Response.includes('###') ? '✅ 컨셉 헤더 발견 - 파싱 가능' : '⚠️ 컨셉 헤더 없음 - 파싱 실패 가능성'
      } : null,
      fileName: fileName,
      processingTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('[prompts/test] ❌ 전체 오류:', error);
    res.status(500).json({
      success: false,
      message: '프롬프트 테스트 중 오류가 발생했습니다.',
      error: error.message,
      processingTime: Date.now() - startTime
    });
  }
});

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

app.use('*', (req, res) => {
  console.log(`❌ 404 요청: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

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
    console.error(`❌ 포트 ${PORT} 사용 중`);
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

setInterval(() => {
  const memory = process.memoryUsage();
  const mbUsed = Math.round(memory.heapUsed / 1024 / 1024);
  if (mbUsed > 500) {
    console.warn(`⚠️ 메모리 사용량 높음: ${mbUsed}MB`);
  }
}, 60000);

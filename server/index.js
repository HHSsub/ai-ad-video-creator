import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import sessionStore from '../src/utils/sessionStore.js';

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
import convertSingleScene from '../api/convert-single-scene.js'; // 싱글 씨인 변환
import debug from '../api/debug.js';
import applyBgm from '../api/apply-bgm.js';
import loadMoodList from '../api/load-mood-list.js';
import loadBgmList from '../api/load-bgm-list.js';
import bgmStream from '../api/bgm-stream.js';
import nanobanaCompose from '../api/nanobanana-compose.js';
import adminConfig from '../api/admin-config.js';
import adminFieldConfig from '../api/admin-field-config.js';

// 🔥 추가된 단 1줄 — 절대 수정 없음
import projectsRouter from './routes/projects.js';
import authRouter from './routes/auth.js';
import personsRouter from '../api/persons.js';

// ✅ 엔진 관리 API 추가 (Express Router 버전)
import enginesGet from '../api/engines-get.js';
import enginesUpdate from '../api/engines-update.js';

// 🔥 프롬프트 조회 API - 엔진 기반 구조로 변경
import promptsGetHandler from '../api/prompts-get.js';
import promptsUpdateHandler from '../api/prompts-update.js';

// 🔥 수동 프롬프트 입력 API
import generatePrompt from '../api/generate-prompt.js';
import storyboardManualInject from '../api/storyboard-manual-inject.js';

// 🔥 저장소 관리 API
import storageInfoHandler from '../api/storage-info.js';
import storageBrowseHandler from '../api/storage-browse.js';

// 🔥 모든 엔진 프롬프트 조회 API
import promptsAllHandler from '../api/prompts-all.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 🔥 세션 API - sessionStore 싱글톤 사용 (통합)
// ============================================================

// 세션 시작
app.post('/api/session/start', (req, res) => {
  try {
    // 🔥 body가 없으면 에러
    if (!req.body) {
      return res.status(400).json({ success: false, error: 'Request body is required' });
    }

    const { sessionId, formData, timestamp } = req.body;
    const username = req.headers['x-username'] || 'anonymous';

    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }

    // sessionStore 싱글톤 사용
    sessionStore.createSession(sessionId, {
      username: username,
      formData: formData,
      startedAt: timestamp || new Date().toISOString()
    });

    sessionStore.updateProgress(sessionId, {
      phase: 'INIT',
      percentage: 0,
      currentStep: '광고 영상 생성 준비 중...'
    });

    console.log(`[session/start] ✅ 세션 생성: ${sessionId} (${username})`);

    res.json({
      success: true,
      sessionId: sessionId
    });
  } catch (error) {
    console.error('[session/start] ❌ 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 세션 확인
app.get('/api/session/check', (req, res) => {
  try {
    const username = req.headers['x-username'] || 'anonymous';

    const allSessions = sessionStore.getAllSessions();
    const userSessions = allSessions.filter(
      s => s.username === username && s.status !== 'completed' && s.status !== 'error'
    );

    if (userSessions.length > 0) {
      res.json({
        hasOngoingSession: true,
        session: userSessions[0]
      });
    } else {
      res.json({
        hasOngoingSession: false
      });
    }
  } catch (error) {
    console.error('[session/check] ❌ 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 세션 상태 조회 🔥 핵심 수정
app.get('/api/session/status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    // sessionStore에서 직접 조회
    const session = sessionStore.getSession(sessionId);

    if (session) {
      res.json({
        success: true,
        session: {
          id: session.id,
          sessionId: session.id,
          progress: session.progress,
          status: session.status,
          error: session.error,
          result: session.result,
          createdAt: session.createdAt,
          lastUpdated: session.lastUpdated
        }
      });
    } else {
      res.json({
        success: false,
        message: '세션을 찾을 수 없습니다.'
      });
    }
  } catch (error) {
    console.error('[session/status] ❌ 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 세션 업데이트
app.post('/api/session/update', (req, res) => {
  try {
    const { sessionId, progress, status, result, error } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }

    let session = sessionStore.getSession(sessionId);
    if (!session) {
      session = sessionStore.createSession(sessionId);
    }

    if (progress) {
      sessionStore.updateProgress(sessionId, progress);
    }

    if (status) {
      sessionStore.updateStatus(sessionId, status, result, error);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[session/update] ❌ 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 세션 클리어
app.post('/api/session/clear', (req, res) => {
  try {
    const username = req.headers['x-username'] || 'anonymous';

    const allSessions = sessionStore.getAllSessions();
    const userSessions = allSessions.filter(s => s.username === username);

    let deletedCount = 0;
    userSessions.forEach(session => {
      sessionStore.deleteSession(session.id);
      deletedCount++;
    });

    console.log(`[session/clear] 사용자 세션 삭제: ${username} (${deletedCount}개)`);

    res.json({ success: true, deletedCount: deletedCount });
  } catch (error) {
    console.error('[session/clear] ❌ 오류:', error);
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
app.use('/api/users', usersApi); // 수정됨: /api/ 추가
app.use('/api/admin-field-config', adminFieldConfig); // 수정됨: /api/ 추가
app.use('/api/auth', authRouter);
app.use('/api/persons', personsRouter);

// ✅ 엔진 관리 API 라우팅 추가 - 🔥 수정: /get, /update 제거
app.use('/api/engines', enginesGet);
app.use('/api/engines', enginesUpdate);

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

/*
[이 위치에 있던 하드코딩된 app.post('/api/auth/login', ...) 로직이 삭제되었습니다.]
*/

app.get('/api/prompts/get', promptsGetHandler);
app.post('/api/prompts/update', promptsUpdateHandler);

app.get('/api/prompts/versions', async (req, res) => { // 수정됨: /api/ 추가
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
    // 🔥 formData가 실제로 어떤 키를 갖고 오는지 확인
    console.log('[save-response] formData keys:', formData ? Object.keys(formData) : null);

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

app.get('/api/prompts/responses/:engineId/:promptType', async (req, res) => {
  try {
    const { engineId, promptType } = req.params;
    const promptKey = `${engineId}_${promptType}`;

    // 🔥 엔진 기반 경로로 변경
    const { getGeminiResponsesDir } = await import('../src/utils/enginePromptHelper.js');

    const mode = promptType.includes('manual') ? 'manual' : 'auto';
    const responsesPath = getGeminiResponsesDir(mode);

    if (!fs.existsSync(responsesPath)) {
      return res.json({
        success: true,
        responses: []
      });
    }

    // 파일명 형식: {promptKey}_storyboard_{step}_{timestamp}.json 또는 {promptKey}_test_{timestamp}.json
    // promptKey에 이미 engineId가 포함되어 있으므로 이를 접두사로 사용
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
      } catch (err) {
        console.error('[prompts/responses] 파일 읽기 오류:', file, err);
      }
    }

    res.json({
      success: true,
      responses,
      responsesPath
    });

  } catch (error) {
    console.error('[prompts/responses] 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


app.get('/api/prompts/response-detail/:fileName', async (req, res) => { // 수정됨: /api/ 추가
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
    const { promptKey, formData, promptContent, engineId, promptType } = req.body;

    const effectivePromptKey = promptKey || (engineId && promptType ? `${engineId}_${promptType}` : null);

    console.log('[prompts/test] 테스트 요청:', { promptKey: effectivePromptKey });

    if (!effectivePromptKey || !promptContent || !formData) {
      return res.status(400).json({
        success: false,
        message: '필수 데이터가 누락되었습니다.',
        error: 'promptKey(또는 engineId+promptType), formData, promptContent가 필요합니다.'
      });
    }

    const { safeCallGemini } = await import('../src/utils/apiHelpers.js');

    // 프롬프트 변수 치환
    let promptTemplate = promptContent;

    const variables = {
      brandName: formData.brandName || '',
      industryCategory: formData.industryCategory || '',
      productServiceCategory: formData.productServiceCategory || '',
      productServiceName: formData.productServiceName || '',
      videoPurpose: formData.videoPurpose || 'product',
      videoLength: formData.videoLength || '10초',
      coreTarget: formData.coreTarget || '',
      coreDifferentiation: formData.coreDifferentiation || '',
      videoRequirements: formData.videoRequirements || '없음',
      brandLogo: '없음',
      productImage: '없음',
      aspectRatioCode: formData.aspectRatioCode || 'widescreen_16_9',
      userdescription: formData.userdescription || ''
    };

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      promptTemplate = promptTemplate.replace(placeholder, value);
    }

    console.log('[prompts/test] Gemini 호출 시작...');

    let geminiResponse;
    try {
      const result = await safeCallGemini(promptTemplate, {
        label: 'PROMPT-TEST',
        maxRetries: 2,
        isImageComposition: false
      });
      geminiResponse = result.text;
      console.log('[prompts/test] ✅ 완료:', geminiResponse.length, 'chars');
    } catch (geminiError) {
      console.error('[prompts/test] ❌ 실패:', geminiError);

      let friendlyError = '프롬프트 테스트 중 오류가 발생했습니다.';
      if (geminiError.message.includes('quota') || geminiError.message.includes('rate limit')) {
        friendlyError = '🚫 API 한도 초과: Gemini API 사용량이 초과되었습니다. 잠시 후 다시 시도해주세요.';
      } else if (geminiError.message.includes('timeout')) {
        friendlyError = '⏰ 타임아웃: 응답 시간이 너무 오래 걸렸습니다. 프롬프트 길이를 줄이거나 다시 시도해주세요.';
      } else if (geminiError.message.includes('API key')) {
        friendlyError = '🔑 API 키 오류: Gemini API 키가 올바르지 않거나 설정되지 않았습니다.';
      }

      return res.status(500).json({
        success: false,
        error: friendlyError,
        technicalError: geminiError.message,
        processingTime: Date.now() - startTime
      });
    }

    // 응답 저장
    const { getGeminiResponsesDir } = await import('../src/utils/enginePromptHelper.js');

    const mode = effectivePromptKey.includes('manual') ? 'manual' : 'auto';
    const responsesPath = getGeminiResponsesDir(mode);

    if (!fs.existsSync(responsesPath)) {
      fs.mkdirSync(responsesPath, { recursive: true });
    }

    const timestamp = Date.now();
    const fileName = `${promptKey}_test_${timestamp}.json`;
    const filePath = path.join(responsesPath, fileName);

    const responseData = {
      promptKey: effectivePromptKey,
      formData: formData,
      response: geminiResponse,
      timestamp: new Date().toISOString(),
      savedAt: new Date().toISOString(),
      isTest: true
    };

    fs.writeFileSync(filePath, JSON.stringify(responseData, null, 2), 'utf-8');

    console.log('[prompts/test] ✅ 테스트 완료 및 저장:', fileName);

    res.json({
      success: true,
      message: '프롬프트 테스트가 완료되었습니다.',
      response: {
        length: geminiResponse.length,
        preview: geminiResponse.substring(0, 500) + '...',
        success: true
      },
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

// 🔥 프로젝트 및 인증 라우터 (최우선 등록)
app.use('/api/projects', projectsRouter);
app.use('/api/auth', authRouter);

// 나머지 API 라우트
app.use('/api/storyboard-init', storyboardInit); // 수정됨: /api/ 추가
app.use('/api/generate-prompt', generatePrompt); // 🔥 수동 프롬프트 생성
app.use('/api/storyboard-manual-inject', storyboardManualInject); // 🔥 수동 프롬프트 처리
app.use('/api/storyboard-render-image', storyboardRenderImage); // 수정됨: /api/ 추가
app.use('/api/image-to-video', imageToVideo); // 수정됨: /api/ 추가
app.use('/api/convert-single-scene', convertSingleScene); // 🔥 싱글 씬 변환
app.use('/api/generate-video', generateVideo); // 수정됨: /api/ 추가
app.use('/api/video-status', videoStatus);
app.use('/api/compile-videos', compileVideos); // 수정됨: /api/ 추가
app.use('/api/debug', debug); // 수정됨: /api/ 추가
app.use('/api/apply-bgm', applyBgm); // 수정됨: /api/ 추가
app.use('/api/load-mood-list', loadMoodList); // 수정됨: /api/ 추가
app.use('/api/load-bgm-list', loadBgmList); // 수정됨: /api/ 추가
app.use('/api/bgm-stream', bgmStream); // 수정됨: /api/ 추가
app.use('/api/nanobanana-compose', nanobanaCompose); // 수정됨: /api/ 추가

// 🔥 저장소 관리 API
app.use('/api/storage/info', storageInfoHandler);
app.use('/api/storage/browse', storageBrowseHandler);

// 🔥 모든 엔진 프롬프트 조회 API
app.use('/api/prompts/all', promptsAllHandler);

// 🔥 엔진 관리 API
app.get('/api/engines', (req, res) => {
  try {
    const enginesPath = path.join(process.cwd(), 'config', 'engines.json');

    if (!fs.existsSync(enginesPath)) {
      return res.status(404).json({
        success: false,
        error: '엔진 설정 파일을 찾을 수 없습니다.'
      });
    }

    const enginesData = JSON.parse(fs.readFileSync(enginesPath, 'utf-8'));

    res.json({
      success: true,
      currentEngine: enginesData.currentEngine,
      availableEngines: enginesData.availableEngines,
      engineHistory: enginesData.engineHistory || []
    });
  } catch (error) {
    console.error('[GET /api/engines] 오류:', error);
    res.status(500).json({
      success: false,
      error: '엔진 정보를 불러오는데 실패했습니다.'
    });
  }
});

app.post('/api/engines', (req, res) => {
  try {
    const { engineType, newEngineId, autoRestart } = req.body;
    const username = req.headers['x-username'] || 'anonymous';

    console.log(`[POST /api/engines] 엔진 변경 요청:`, { engineType, newEngineId, username });

    if (!engineType || !newEngineId) {
      return res.status(400).json({
        success: false,
        error: 'engineType과 newEngineId가 필요합니다.'
      });
    }

    if (!['textToImage', 'imageToVideo'].includes(engineType)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 engineType입니다.'
      });
    }

    const enginesPath = path.join(process.cwd(), 'config', 'engines.json');

    if (!fs.existsSync(enginesPath)) {
      return res.status(404).json({
        success: false,
        error: '엔진 설정 파일을 찾을 수 없습니다.'
      });
    }

    const enginesData = JSON.parse(fs.readFileSync(enginesPath, 'utf-8'));

    // 새 엔진 정보 찾기
    const newEngine = enginesData.availableEngines[engineType].find(
      e => e.id === newEngineId
    );

    if (!newEngine) {
      return res.status(404).json({
        success: false,
        error: '요청한 엔진을 찾을 수 없습니다.'
      });
    }

    // 이전 엔진 정보 저장
    const previousEngine = enginesData.currentEngine[engineType];
    const previousEngineId = previousEngine.model;

    // 엔진 변경
    enginesData.currentEngine[engineType] = {
      provider: newEngine.provider,
      model: newEngine.model,
      endpoint: newEngine.endpoint,
      statusEndpoint: newEngine.statusEndpoint,
      displayName: newEngine.displayName,
      description: newEngine.description,
      parameters: newEngine.parameters,
      updatedAt: new Date().toISOString(),
      updatedBy: username
    };

    // 히스토리 추가
    if (!enginesData.engineHistory) {
      enginesData.engineHistory = [];
    }

    enginesData.engineHistory.unshift({
      timestamp: new Date().toISOString(),
      changeType: 'update',
      engineType: engineType,
      previousEngine: previousEngineId,
      newEngine: newEngineId,
      updatedBy: username
    });

    // 히스토리 최대 100개 유지
    if (enginesData.engineHistory.length > 100) {
      enginesData.engineHistory = enginesData.engineHistory.slice(0, 100);
    }

    // 파일 저장
    fs.writeFileSync(enginesPath, JSON.stringify(enginesData, null, 2), 'utf-8');

    console.log(`[POST /api/engines] ✅ 엔진 변경 완료: ${previousEngineId} → ${newEngineId}`);

    // PM2 재시작 (옵션)
    let restartResult = { success: false, message: '수동으로 재시작하세요.' };

    if (autoRestart) {
      try {
        const { exec } = require('child_process');
        exec('pm2 restart all', (error, stdout, stderr) => {
          if (error) {
            console.error('[PM2 재시작 오류]:', error);
          } else {
            console.log('[PM2 재시작 성공]:', stdout);
          }
        });
        restartResult = { success: true, message: 'PM2 재시작 명령을 실행했습니다.' };
      } catch (error) {
        console.error('[PM2 재시작 실패]:', error);
      }
    }

    res.json({
      success: true,
      message: '엔진이 성공적으로 변경되었습니다.',
      previousEngine: previousEngineId,
      newEngine: newEngineId,
      engineType: engineType,
      restartResult: restartResult
    });

  } catch (error) {
    console.error('[POST /api/engines] 오류:', error);
    res.status(500).json({
      success: false,
      error: '엔진 변경 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});


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

  server.timeout = 1200000; // 2시간
  server.keepAliveTimeout = 1200000;
  server.headersTimeout = 1205000;

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

['SIGINT', 'SIGTERM'].forEach(sig => {
  process.once(sig, () => {
    console.log(`[${sig}] 수신 → 서버 종료 중...`);
    server.close(() => {
      console.log('✅ 서버 정상 종료');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  });
});

setInterval(() => {
  const memory = process.memoryUsage();
  const mbUsed = Math.round(memory.heapUsed / 1024 / 1024);
  if (mbUsed > 500) {
    console.warn(`⚠️ 메모리 사용량 높음: ${mbUsed}MB`);
  }
}, 60000);

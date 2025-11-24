// api/engines-update.js - 엔진 설정 업데이트 + 자동 재시작 API

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ENGINES_FILE = path.join(process.cwd(), 'config', 'engines.json');

/**
 * 엔진 설정 파일 로드
 */
function loadEngines() {
  try {
    if (!fs.existsSync(ENGINES_FILE)) {
      console.error('[engines-update] engines.json 파일이 없습니다.');
      return null;
    }
    const data = fs.readFileSync(ENGINES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[engines-update] 엔진 설정 로드 오류:', error);
    return null;
  }
}

/**
 * 엔진 설정 파일 저장
 */
function saveEngines(engines) {
  try {
    const data = JSON.stringify(engines, null, 2);
    fs.writeFileSync(ENGINES_FILE, data, 'utf8');
    return true;
  } catch (error) {
    console.error('[engines-update] 엔진 설정 저장 오류:', error);
    return false;
  }
}

/**
 * 히스토리 추가
 */
function addEngineHistory(engines, changeType, engineType, newEngine, username) {
  if (!engines.engineHistory) {
    engines.engineHistory = [];
  }

  const historyEntry = {
    timestamp: new Date().toISOString(),
    changeType,
    engineType,
    previousEngine: engines.currentEngine[engineType]?.model || 'unknown',
    newEngine: newEngine.model,
    updatedBy: username
  };

  engines.engineHistory.unshift(historyEntry);

  // 최대 100개까지만 유지
  if (engines.engineHistory.length > 100) {
    engines.engineHistory = engines.engineHistory.slice(0, 100);
  }
}

/**
 * PM2로 앱 재시작
 */
async function restartApplication() {
  try {
    console.log('[engines-update] 🔄 PM2로 애플리케이션 재시작 시도...');
    
    // PM2가 설치되어 있는지 확인
    try {
      await execAsync('which pm2');
    } catch (error) {
      console.warn('[engines-update] ⚠️ PM2가 설치되어 있지 않습니다. 재시작 건너뜀.');
      return { success: false, message: 'PM2가 설치되어 있지 않습니다.' };
    }

    // PM2 프로세스 목록 확인
    const { stdout: listOutput } = await execAsync('pm2 list');
    console.log('[engines-update] PM2 프로세스 목록:\n', listOutput);

    // 'upnexx' 또는 'all'로 재시작 시도
    const appName = process.env.PM2_APP_NAME || 'upnexx';
    
    try {
      const { stdout: restartOutput } = await execAsync(`pm2 restart ${appName}`);
      console.log('[engines-update] ✅ PM2 재시작 성공:', restartOutput);
      return { success: true, message: 'PM2 재시작 성공' };
    } catch (restartError) {
      console.error('[engines-update] ❌ PM2 재시작 실패:', restartError.message);
      
      // 폴백: pm2 reload 시도
      try {
        const { stdout: reloadOutput } = await execAsync(`pm2 reload ${appName}`);
        console.log('[engines-update] ✅ PM2 reload 성공:', reloadOutput);
        return { success: true, message: 'PM2 reload 성공' };
      } catch (reloadError) {
        console.error('[engines-update] ❌ PM2 reload도 실패:', reloadError.message);
        return { success: false, message: 'PM2 재시작 실패' };
      }
    }

  } catch (error) {
    console.error('[engines-update] ❌ 재시작 프로세스 오류:', error);
    return { success: false, message: error.message };
  }
}

/**
 * POST /nexxii/api/engines/update - 엔진 설정 업데이트
 * 
 * Body:
 * {
 *   "engineType": "textToImage" | "imageToVideo",
 *   "newEngineId": "seedream-v4" | "kling-v2-1-pro" | ...,
 *   "autoRestart": true | false (기본값: true)
 * }
 */
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const username = req.headers['x-username'] || 'anonymous';

  try {
    const { engineType, newEngineId, autoRestart = true } = req.body;

    // 입력 검증
    if (!engineType || !newEngineId) {
      return res.status(400).json({
        success: false,
        error: 'engineType과 newEngineId는 필수입니다.'
      });
    }

    if (!['textToImage', 'imageToVideo'].includes(engineType)) {
      return res.status(400).json({
        success: false,
        error: 'engineType은 textToImage 또는 imageToVideo여야 합니다.'
      });
    }

    // 엔진 설정 로드
    const engines = loadEngines();
    if (!engines) {
      return res.status(500).json({
        success: false,
        error: '엔진 설정 파일을 불러올 수 없습니다.'
      });
    }

    // 사용 가능한 엔진 목록에서 새 엔진 찾기
    const availableEngines = engines.availableEngines[engineType];
    const newEngine = availableEngines.find(e => e.id === newEngineId);

    if (!newEngine) {
      return res.status(404).json({
        success: false,
        error: `엔진 ID '${newEngineId}'를 찾을 수 없습니다.`
      });
    }

    console.log(`[engines-update] 🔧 엔진 변경: ${engineType} → ${newEngineId}`);

    // 현재 엔진 업데이트
    const previousEngine = engines.currentEngine[engineType];
    engines.currentEngine[engineType] = {
      provider: newEngine.provider,
      model: newEngine.model,
      endpoint: newEngine.endpoint,
      statusEndpoint: newEngine.statusEndpoint,
      displayName: newEngine.displayName,
      description: newEngine.description,
      parameters: { ...newEngine.parameters },
      updatedAt: new Date().toISOString(),
      updatedBy: username
    };

    // 히스토리 추가
    addEngineHistory(engines, 'update', engineType, newEngine, username);

    // 파일 저장
    const saved = saveEngines(engines);
    if (!saved) {
      return res.status(500).json({
        success: false,
        error: '엔진 설정 저장에 실패했습니다.'
      });
    }

    console.log('[engines-update] ✅ 엔진 설정 저장 완료');

    // 자동 재시작
    let restartResult = { success: false, message: '재시작 건너뜀' };
    if (autoRestart) {
      restartResult = await restartApplication();
    }

    return res.status(200).json({
      success: true,
      message: '엔진 설정이 성공적으로 업데이트되었습니다.',
      previousEngine: previousEngine?.model || 'unknown',
      newEngine: newEngine.model,
      engineType,
      autoRestart,
      restartResult
    });

  } catch (error) {
    console.error('[engines-update] ❌ 오류 발생:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '서버 오류가 발생했습니다.'
    });
  }
}

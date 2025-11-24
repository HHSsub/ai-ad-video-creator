// api/engines-get.js - 현재 엔진 설정 조회 API (Express Router 버전)

import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const ENGINES_FILE = path.join(process.cwd(), 'config', 'engines.json');

/**
 * 엔진 설정 파일 로드
 */
function loadEngines() {
  try {
    if (!fs.existsSync(ENGINES_FILE)) {
      console.error('[engines-get] engines.json 파일이 없습니다.');
      return null;
    }
    const data = fs.readFileSync(ENGINES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[engines-get] 엔진 설정 로드 오류:', error);
    return null;
  }
}

/**
 * GET /api/engines/get - 현재 엔진 설정 조회
 */
router.get('/', (req, res) => {
  try {
    const engines = loadEngines();

    if (!engines) {
      return res.status(500).json({
        success: false,
        error: '엔진 설정 파일을 불러올 수 없습니다.'
      });
    }

    console.log('[engines-get] ✅ 엔진 설정 조회 성공');

    return res.status(200).json({
      success: true,
      currentEngine: engines.currentEngine,
      availableEngines: engines.availableEngines,
      engineHistory: engines.engineHistory || []
    });

  } catch (error) {
    console.error('[engines-get] ❌ 오류 발생:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '서버 오류가 발생했습니다.'
    });
  }
});

export default router;

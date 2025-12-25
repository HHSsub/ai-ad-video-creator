// api/prompts-update.js - 엔진별 프롬프트 업데이트 API

import fs from 'fs';
import path from 'path';

const PROMPTS_DIR = path.join(process.cwd(), 'public', 'prompts');

/**
 * 프롬프트 파일 백업
 */
function backupPrompt(promptPath, engineId, promptType) {
  try {
    if (!fs.existsSync(promptPath)) {
      return null;
    }

    const content = fs.readFileSync(promptPath, 'utf8');

    // 버전 디렉토리
    const engineDir = path.join(PROMPTS_DIR, engineId);
    let versionsDir;

    if (promptType === 'manual') {
      versionsDir = path.join(engineDir, 'manual', 'versions');
    } else {
      versionsDir = path.join(engineDir, 'auto', 'versions');
    }

    fs.mkdirSync(versionsDir, { recursive: true });

    // 백업 파일명
    const timestamp = Date.now();
    const backupFileName = `${promptType}_${timestamp}.txt`;
    const backupPath = path.join(versionsDir, backupFileName);

    fs.writeFileSync(backupPath, content, 'utf8');

    console.log('[prompts-update] ✅ 백업 완료:', backupFileName);
    return backupFileName;

  } catch (error) {
    console.error('[prompts-update] 백업 실패:', error);
    return null;
  }
}

/**
 * POST /nexxii/api/prompts/update - 프롬프트 업데이트
 */
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { engineId, promptType, content } = req.body;

    if (!engineId || !promptType || content === undefined) {
      return res.status(400).json({
        success: false,
        error: 'engineId, promptType, content가 필요합니다.'
      });
    }

    // 프롬프트 파일 경로
    const engineDir = path.join(PROMPTS_DIR, engineId);
    let promptPath;

    if (promptType === 'manual') {
      promptPath = path.join(engineDir, 'manual', 'manual_prompt.txt');
    } else if (promptType === 'auto_product') {
      promptPath = path.join(engineDir, 'auto', 'product_prompt.txt');
    } else if (promptType === 'auto_service') {
      promptPath = path.join(engineDir, 'auto', 'service_prompt.txt');
    } else {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 promptType입니다.'
      });
    }

    // 디렉토리 생성
    fs.mkdirSync(path.dirname(promptPath), { recursive: true });

    // 백업
    if (fs.existsSync(promptPath)) {
      backupPrompt(promptPath, engineId, promptType);
    }

    // 저장
    fs.writeFileSync(promptPath, content, 'utf8');

    console.log(`[prompts-update] ✅ 프롬프트 업데이트 완료: ${engineId}/${promptType}`);

    return res.status(200).json({
      success: true,
      message: '프롬프트가 성공적으로 업데이트되었습니다.',
      engineId,
      promptType
    });

  } catch (error) {
    console.error('[prompts-update] ❌ 오류:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '서버 오류가 발생했습니다.'
    });
  }
}

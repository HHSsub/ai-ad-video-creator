// api/prompts-update.js - 엔진 기반 프롬프트 업데이트 API (수정됨)

import fs from 'fs';
import path from 'path';
import { getPromptFilePath, getPromptVersionsDir, generateEngineId } from '../src/utils/enginePromptHelper.js';

/**
 * 프롬프트 파일 백업 (버전 저장)
 */
function backupPrompt(promptPath, promptKey) {
  try {
    if (!fs.existsSync(promptPath)) {
      console.warn('[prompts-update] 백업할 파일이 없습니다:', promptPath);
      return null;
    }

    const content = fs.readFileSync(promptPath, 'utf8');
    
    // 버전 디렉토리 생성
    const mode = promptKey.includes('manual') ? 'manual' : 'auto';
    const videoPurpose = promptKey.includes('product') ? 'product' : 
                         promptKey.includes('service') ? 'service' : null;
    
    const versionsDir = getPromptVersionsDir(mode, videoPurpose);
    
    // 타임스탬프 기반 백업 파일명
    const timestamp = Date.now();
    const backupFileName = `${promptKey}_${timestamp}.txt`;
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
 * 
 * Body:
 * {
 *   "filename": "{engineId}_auto_product" | "{engineId}_auto_service" | "{engineId}_manual",
 *   "content": "프롬프트 내용..."
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
    const { filename, content } = req.body;

    if (!filename || content === undefined) {
      return res.status(400).json({
        success: false,
        error: 'filename과 content는 필수입니다.'
      });
    }

    const engineId = generateEngineId();

    // filename에서 mode와 videoPurpose 추출
    let mode, videoPurpose;
    
    if (filename.includes('_manual')) {
      mode = 'manual';
      videoPurpose = null;
    } else if (filename.includes('_auto_product')) {
      mode = 'auto';
      videoPurpose = 'product';
    } else if (filename.includes('_auto_service')) {
      mode = 'auto';
      videoPurpose = 'service';
    } else {
      return res.status(400).json({
        success: false,
        error: 'filename 형식이 올바르지 않습니다. (예: {engineId}_auto_product)'
      });
    }

    // 프롬프트 파일 경로
    const promptPath = getPromptFilePath(mode, videoPurpose);
    
    console.log('[prompts-update] 프롬프트 업데이트:', {
      filename,
      mode,
      videoPurpose,
      promptPath,
      contentLength: content.length
    });

    // 기존 프롬프트 백업
    const backupFileName = backupPrompt(promptPath, filename);

    // 디렉토리 생성 (없으면)
    const promptDir = path.dirname(promptPath);
    if (!fs.existsSync(promptDir)) {
      fs.mkdirSync(promptDir, { recursive: true });
    }

    // 새 프롬프트 저장
    fs.writeFileSync(promptPath, content, 'utf8');

    console.log('[prompts-update] ✅ 프롬프트 저장 완료:', promptPath);

    return res.status(200).json({
      success: true,
      message: '프롬프트가 성공적으로 업데이트되었습니다.',
      filename,
      promptPath,
      backupFileName,
      updatedBy: username,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[prompts-update] ❌ 오류 발생:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '서버 오류가 발생했습니다.'
    });
  }
}

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { authenticateToken, requireAdmin } from './auth.js';

const router = express.Router();

// 프롬프트 파일 경로
const PROMPT_FILES = {
  input_second: 'public/input_second_prompt.txt',
  final: 'public/final_prompt.txt'
};

// 버전 저장 디렉토리
const VERSIONS_DIR = 'public/prompt_versions';

// 버전 디렉토리 초기화
const initVersionsDir = async () => {
  try {
    await fs.access(VERSIONS_DIR);
  } catch {
    await fs.mkdir(VERSIONS_DIR, { recursive: true });
    console.log(`[ADMIN] 버전 디렉토리 생성: ${VERSIONS_DIR}`);
  }
};

// 프롬프트 파일 읽기
router.get('/prompts/:type', authenticateToken, requireAdmin, async (req, res) => {
  const { type } = req.params;
  
  if (!PROMPT_FILES[type]) {
    return res.status(400).json({ 
      success: false, 
      message: '올바르지 않은 프롬프트 타입입니다.' 
    });
  }

  try {
    const content = await fs.readFile(PROMPT_FILES[type], 'utf-8');
    res.json({
      success: true,
      type,
      content,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[ADMIN] 프롬프트 읽기 실패 (${type}):`, error);
    res.status(500).json({ 
      success: false, 
      message: '프롬프트 파일을 읽을 수 없습니다.' 
    });
  }
});

// 프롬프트 파일 업데이트
router.put('/prompts/:type', authenticateToken, requireAdmin, async (req, res) => {
  const { type } = req.params;
  const { content } = req.body;
  
  if (!PROMPT_FILES[type]) {
    return res.status(400).json({ 
      success: false, 
      message: '올바르지 않은 프롬프트 타입입니다.' 
    });
  }

  if (!content) {
    return res.status(400).json({ 
      success: false, 
      message: '프롬프트 내용이 필요합니다.' 
    });
  }

  try {
    await initVersionsDir();
    
    // 기존 내용을 버전으로 백업
    const currentContent = await fs.readFile(PROMPT_FILES[type], 'utf-8').catch(() => '');
    if (currentContent) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const versionFile = path.join(VERSIONS_DIR, `${type}_${timestamp}.txt`);
      await fs.writeFile(versionFile, currentContent);
    }
    
    // 새 내용 저장
    await fs.writeFile(PROMPT_FILES[type], content);
    
    console.log(`[ADMIN] 프롬프트 업데이트 (${type}): ${req.user.name}`);
    
    res.json({
      success: true,
      message: '프롬프트가 성공적으로 업데이트되었습니다.',
      type,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[ADMIN] 프롬프트 업데이트 실패 (${type}):`, error);
    res.status(500).json({ 
      success: false, 
      message: '프롬프트 업데이트에 실패했습니다.' 
    });
  }
});

export default router;

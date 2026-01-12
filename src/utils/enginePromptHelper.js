// src/utils/enginePromptHelper.js - 엔진 기반 프롬프트 관리 유틸리티

import fs from 'fs';
import path from 'path';

const ENGINES_FILE = path.join(process.cwd(), 'config', 'engines.json');
const PROMPTS_DIR = path.join(process.cwd(), 'public');

/**
 * 현재 엔진 설정 로드
 */
export function loadCurrentEngines() {
  try {
    if (!fs.existsSync(ENGINES_FILE)) {
      console.error('[enginePromptHelper] engines.json 파일이 없습니다.');
      return null;
    }
    const data = fs.readFileSync(ENGINES_FILE, 'utf8');
    const engines = JSON.parse(data);
    return engines.currentEngine;
  } catch (error) {
    console.error('[enginePromptHelper] 엔진 설정 로드 오류:', error);
    return null;
  }
}

/**
 * 엔진 ID 생성 (파일명/폴더명용)
 * 예: "seedream-v4_kling-v2-1-pro"
 */
export function generateEngineId() {
  const engines = loadCurrentEngines();
  if (!engines) return 'default';

  const textToImageModel = engines.textToImage?.model || 'unknown';
  const imageToVideoModel = engines.imageToVideo?.model || 'unknown';

  return `${textToImageModel}_${imageToVideoModel}`;
}

/**
 * 엔진별 프롬프트 파일 경로 생성
 * 
 * 계층 구조:
 * /public/prompts/
 *   └── {engineId}/           (예: seedream-v4_kling-v2-1-pro/)
 *       ├── auto/
 *       │   ├── product_prompt.txt
 *       │   └── service_prompt.txt
 *       └── manual/
 *           └── manual_prompt.txt
 */
export function getPromptFilePath(mode, videoPurpose = null, providedEngineId = null) {
  const engineId = providedEngineId || generateEngineId();
  const baseDir = path.join(PROMPTS_DIR, 'prompts', engineId);

  // 디렉토리 생성 (없으면)
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  if (mode === 'manual') {
    const manualDir = path.join(baseDir, 'manual');
    if (!fs.existsSync(manualDir)) {
      fs.mkdirSync(manualDir, { recursive: true });
    }
    return path.join(manualDir, 'manual_prompt.txt');
  }

  // auto 모드
  const autoDir = path.join(baseDir, 'auto');
  if (!fs.existsSync(autoDir)) {
    fs.mkdirSync(autoDir, { recursive: true });
  }

  if (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education') {
    return path.join(autoDir, 'product_prompt.txt');
  } else if (videoPurpose === 'service' || videoPurpose === 'brand') {
    return path.join(autoDir, 'service_prompt.txt');
  }

  // 기본값
  return path.join(autoDir, 'product_prompt.txt');
}

/**
 * 프롬프트 버전 파일 경로
 * /public/prompts/{engineId}/{mode}/versions/
 */
export function getPromptVersionsDir(mode, videoPurpose = null, providedEngineId = null) {
  const engineId = providedEngineId || generateEngineId();
  const baseDir = path.join(PROMPTS_DIR, 'prompts', engineId);

  if (mode === 'manual') {
    const versionsDir = path.join(baseDir, 'manual', 'versions');
    if (!fs.existsSync(versionsDir)) {
      fs.mkdirSync(versionsDir, { recursive: true });
    }
    return versionsDir;
  }

  // auto 모드
  const autoDir = path.join(baseDir, 'auto', 'versions');
  if (!fs.existsSync(autoDir)) {
    fs.mkdirSync(autoDir, { recursive: true });
  }

  return autoDir;
}

/**
 * Gemini 응답 저장 경로
 * /public/prompts/{engineId}/{mode}/responses/
 */
export function getGeminiResponsesDir(mode, videoPurpose = null, providedEngineId = null) {
  const engineId = providedEngineId || generateEngineId();
  const baseDir = path.join(PROMPTS_DIR, 'prompts', engineId);

  if (mode === 'manual') {
    const responsesDir = path.join(baseDir, 'manual', 'responses');
    if (!fs.existsSync(responsesDir)) {
      fs.mkdirSync(responsesDir, { recursive: true });
    }
    return responsesDir;
  }

  // auto 모드
  const responsesDirAuto = path.join(baseDir, 'auto', 'responses');
  if (!fs.existsSync(responsesDirAuto)) {
    fs.mkdirSync(responsesDirAuto, { recursive: true });
  }

  return responsesDirAuto;
}

/**
 * 프롬프트 키 생성 (관리자 패널용)
 * 예: "seedream-v4_kling-v2-1-pro_auto_product"
 */
export function generatePromptKey(mode, videoPurpose) {
  const engineId = generateEngineId();

  if (mode === 'manual') {
    return `${engineId}_manual`;
  }

  const purposeKey = (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education')
    ? 'product'
    : 'service';

  return `${engineId}_auto_${purposeKey}`;
}

/**
 * 레거시 프롬프트 파일에서 새 구조로 마이그레이션
 */
let migrationCompleted = false; // 🔥 마이그레이션 플래그

export function migrateFromLegacy() {
  // 🔥 이미 마이그레이션 완료되었으면 스킵
  if (migrationCompleted) {
    return;
  }
  const legacyFiles = [
    'new_product_prompt_1120.txt',
    'new_service_prompt_1120.txt',
    'new_manual_prompt_1120.txt'
  ];

  const engineId = generateEngineId();
  const baseDir = path.join(PROMPTS_DIR, 'prompts', engineId);

  // 🔥 이미 폴더가 존재하고 파일이 있으면 마이그레이션 불필요
  const autoProductPath = path.join(baseDir, 'auto', 'product_prompt.txt');
  if (fs.existsSync(autoProductPath)) {
    console.log('[enginePromptHelper] ✅ 이미 마이그레이션 완료됨 (스킵)');
    migrationCompleted = true;
    return;
  }

  console.log('[enginePromptHelper] 📦 레거시 프롬프트 마이그레이션 시작...');

  for (const legacyFile of legacyFiles) {
    const legacyPath = path.join(PROMPTS_DIR, legacyFile);

    if (!fs.existsSync(legacyPath)) {
      console.log(`[enginePromptHelper] ⚠️ ${legacyFile} 파일이 없습니다. 건너뜀.`);
      continue;
    }

    const content = fs.readFileSync(legacyPath, 'utf8');

    let newPath;
    if (legacyFile.includes('product')) {
      newPath = path.join(baseDir, 'auto', 'product_prompt.txt');
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
    } else if (legacyFile.includes('service')) {
      newPath = path.join(baseDir, 'auto', 'service_prompt.txt');
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
    } else if (legacyFile.includes('manual')) {
      newPath = path.join(baseDir, 'manual', 'manual_prompt.txt');
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
    }

    if (newPath && !fs.existsSync(newPath)) {
      fs.writeFileSync(newPath, content, 'utf8');
      console.log(`[enginePromptHelper] ✅ ${legacyFile} → ${newPath} 마이그레이션 완료`);
    }
  }

  migrationCompleted = true; // 🔥 마이그레이션 완료 플래그 설정
  console.log('[enginePromptHelper] 📦 마이그레이션 완료');
}

/**
 * 엔진 정보 출력
 */
export function logCurrentEngineInfo() {
  const engines = loadCurrentEngines();
  if (!engines) {
    console.log('[enginePromptHelper] ❌ 엔진 정보 없음');
    return;
  }

  console.log('=== 🎨 현재 엔진 설정 ===');
  console.log(`Text-to-Image: ${engines.textToImage?.displayName || 'unknown'} (${engines.textToImage?.model})`);
  console.log(`Image-to-Video: ${engines.imageToVideo?.displayName || 'unknown'} (${engines.imageToVideo?.model})`);
  console.log(`엔진 ID: ${generateEngineId()}`);
  console.log('==========================');
}

export default {
  loadCurrentEngines,
  generateEngineId,
  getPromptFilePath,
  getPromptVersionsDir,
  getGeminiResponsesDir,
  generatePromptKey,
  migrateFromLegacy,
  logCurrentEngineInfo
};

// src/utils/engineConfigLoader.js - 엔진 설정 로더

import fs from 'fs';
import path from 'path';

const ENGINES_FILE = path.join(process.cwd(), 'config', 'engines.json');

/**
 * 현재 엔진 설정 로드
 */
export function loadCurrentEngines() {
  try {
    if (!fs.existsSync(ENGINES_FILE)) {
      console.error('[engineConfigLoader] engines.json 파일이 없습니다. 기본 설정 사용.');
      return getDefaultEngines();
    }
    const data = fs.readFileSync(ENGINES_FILE, 'utf8');
    const engines = JSON.parse(data);
    return engines.currentEngine;
  } catch (error) {
    console.error('[engineConfigLoader] 엔진 설정 로드 오류:', error);
    return getDefaultEngines();
  }
}

/**
 * 기본 엔진 설정 (폴백)
 */
function getDefaultEngines() {
  return {
    textToImage: {
      provider: 'freepik',
      model: 'seedream-v4',
      endpoint: '/ai/text-to-image/seedream-v4',
      statusEndpoint: '/ai/text-to-image/seedream-v4/{task-id}',
      displayName: 'Seedream v4',
      parameters: {
        aspect_ratio: 'widescreen_16_9',
        guidance_scale: 2.5,
        seed: null,
        num_images: 1,
        safe_mode: true
      }
    },
    imageToVideo: {
      provider: 'freepik',
      model: 'kling-v2-1-pro',
      endpoint: '/ai/image-to-video/kling-v2-1-pro',
      statusEndpoint: '/ai/image-to-video/kling-v2-1/{task-id}',
      displayName: 'Kling v2.1 Pro',
      parameters: {
        duration: '5',
        cfg_scale: 0.5,
        negative_prompt: 'blurry, distorted, low quality'
      }
    }
  };
}

/**
 * Text-to-Image 엔진 설정 가져오기
 */
export function getTextToImageEngine() {
  const engines = loadCurrentEngines();
  return engines.textToImage;
}

/**
 * Image-to-Video 엔진 설정 가져오기
 */
export function getImageToVideoEngine() {
  const engines = loadCurrentEngines();
  return engines.imageToVideo;
}

/**
 * Freepik API 기본 URL
 */
export function getFreepikApiBase() {
  return 'https://api.freepik.com/v1';
}

/**
 * Text-to-Image 요청 URL 생성
 */
export function getTextToImageUrl() {
  const engine = getTextToImageEngine();
  const baseUrl = getFreepikApiBase();
  return `${baseUrl}${engine.endpoint}`;
}

/**
 * Text-to-Image 상태 조회 URL 생성
 */
export function getTextToImageStatusUrl(taskId) {
  const engine = getTextToImageEngine();
  const baseUrl = getFreepikApiBase();
  const endpoint = engine.statusEndpoint.replace('{task-id}', taskId);
  return `${baseUrl}${endpoint}`;
}

/**
 * Image-to-Video 요청 URL 생성
 */
export function getImageToVideoUrl() {
  const engine = getImageToVideoEngine();
  const baseUrl = getFreepikApiBase();
  return `${baseUrl}${engine.endpoint}`;
}

/**
 * Image-to-Video 상태 조회 URL 생성
 */
export function getImageToVideoStatusUrl(taskId) {
  const engine = getImageToVideoEngine();
  const baseUrl = getFreepikApiBase();
  const endpoint = engine.statusEndpoint.replace('{task-id}', taskId);
  return `${baseUrl}${endpoint}`;
}

/**
 * 엔진 정보 로깅
 */
export function logEngineInfo() {
  const engines = loadCurrentEngines();
  console.log('=== 🎨 현재 엔진 설정 ===');
  console.log(`Text-to-Image: ${engines.textToImage.displayName} (${engines.textToImage.model})`);
  console.log(`  → 엔드포인트: ${engines.textToImage.endpoint}`);
  console.log(`Image-to-Video: ${engines.imageToVideo.displayName} (${engines.imageToVideo.model})`);
  console.log(`  → 엔드포인트: ${engines.imageToVideo.endpoint}`);
  console.log('==========================');
}

export default {
  loadCurrentEngines,
  getTextToImageEngine,
  getImageToVideoEngine,
  getFreepikApiBase,
  getTextToImageUrl,
  getTextToImageStatusUrl,
  getImageToVideoUrl,
  getImageToVideoStatusUrl,
  logEngineInfo
};

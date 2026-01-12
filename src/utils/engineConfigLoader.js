// src/utils/engineConfigLoader.js - 엔진 설정 로더 (v2.5 Pro 기본값 및 필수 URL 함수 복구)

import fs from 'fs';
import path from 'path';

const ENGINES_FILE = path.join(process.cwd(), 'config', 'engines.json');
const FREEPIK_API_BASE = 'https://api.freepik.com/v1';

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
 * 기본 엔진 설정 (폴백) - 사용자의 요청에 따라 Kling v2.5 Pro를 기본값으로 설정
 */
function getDefaultEngines() {
  return {
    textToImage: {
      id: 'seedream-v4',
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
      id: 'kling-v2-5-pro',
      provider: 'freepik',
      model: 'kling-v2-5-pro',
      endpoint: '/ai/image-to-video/kling-v2-5-pro',
      statusEndpoint: '/ai/image-to-video/kling-v2-5-pro/{task-id}',
      displayName: 'Kling v2.5 Pro',
      parameters: {
        duration: "5",
        cfg_scale: 0.5,
        prompt: "",
        negative_prompt: "blurry, distorted, low quality"
      },
      supportedDurations: ["5", "10"]
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
  try {
    if (!fs.existsSync(ENGINES_FILE)) {
      return getDefaultEngines().imageToVideo;
    }

    const data = fs.readFileSync(ENGINES_FILE, 'utf8');
    const enginesData = JSON.parse(data);
    const current = enginesData.currentEngine?.imageToVideo;

    if (!current) {
      return getDefaultEngines().imageToVideo;
    }

    // availableEngines에서 상세 메타데이터(supportedDurations 등) 병합
    const availableList = enginesData.availableEngines?.imageToVideo || [];
    const fullJson = availableList.find(e => e.id === current.id || (e.model === current.model && e.provider === current.provider));

    if (fullJson) {
      return {
        ...fullJson,
        ...current,
        parameters: {
          ...fullJson.parameters,
          ...current.parameters
        },
        supportedDurations: fullJson.supportedDurations || current.supportedDurations || ["5", "10"]
      };
    }

    return current;
  } catch (error) {
    console.error('[getImageToVideoEngine] Error:', error);
    return getDefaultEngines().imageToVideo;
  }
}

/**
 * 필수 URL 로더 함수 복구 (API에서 사용됨)
 */
export function getTextToImageUrl() {
  const engine = getTextToImageEngine();
  return `${FREEPIK_API_BASE}${engine.endpoint || '/ai/text-to-image/seedream-v4'}`;
}

export function getImageToVideoUrl() {
  const engine = getImageToVideoEngine();
  return `${FREEPIK_API_BASE}${engine.endpoint || '/ai/image-to-video/kling-v2-5-pro'}`;
}

export function getTextToImageStatusUrl(taskId) {
  return `${FREEPIK_API_BASE}/ai/text-to-image/${taskId}`;
}

export function getImageToVideoStatusUrl(taskId) {
  const engine = getImageToVideoEngine();
  // statusEndpoint가 있으면 사용, 없으면 기본값
  if (engine.statusEndpoint) {
    return `${FREEPIK_API_BASE}${engine.statusEndpoint.replace('{task-id}', taskId)}`;
  }
  return `${FREEPIK_API_BASE}/ai/image-to-video/${taskId}`;
}

export function getFreepikApiBase() {
  return FREEPIK_API_BASE;
}

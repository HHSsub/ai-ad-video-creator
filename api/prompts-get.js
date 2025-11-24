// api/prompts-get.js - 엔진 기반 프롬프트 조회 API (수정됨)

import fs from 'fs';
import path from 'path';
import { generateEngineId, getPromptFilePath, migrateFromLegacy } from '../src/utils/enginePromptHelper.js';

/**
 * GET /nexxii/api/prompts/get - 현재 엔진의 모든 프롬프트 조회
 * 
 * 응답:
 * {
 *   success: true,
 *   prompts: {
 *     "{engineId}_auto_product": "...",
 *     "{engineId}_auto_service": "...",
 *     "{engineId}_manual": "..."
 *   },
 *   engineId: "seedream-v4_kling-v2-1-pro"
 * }
 */
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // 레거시 프롬프트 마이그레이션 (처음 한 번만 실행됨)
    migrateFromLegacy();

    const engineId = generateEngineId();
    const prompts = {};

    // Auto 모드 - Product 프롬프트
    const productPromptPath = getPromptFilePath('auto', 'product');
    if (fs.existsSync(productPromptPath)) {
      prompts[`${engineId}_auto_product`] = fs.readFileSync(productPromptPath, 'utf8');
    } else {
      console.warn('[prompts-get] Product 프롬프트 파일이 없습니다:', productPromptPath);
      prompts[`${engineId}_auto_product`] = ''; // 빈 프롬프트 반환
    }

    // Auto 모드 - Service 프롬프트
    const servicePromptPath = getPromptFilePath('auto', 'service');
    if (fs.existsSync(servicePromptPath)) {
      prompts[`${engineId}_auto_service`] = fs.readFileSync(servicePromptPath, 'utf8');
    } else {
      console.warn('[prompts-get] Service 프롬프트 파일이 없습니다:', servicePromptPath);
      prompts[`${engineId}_auto_service`] = '';
    }

    // Manual 모드 프롬프트
    const manualPromptPath = getPromptFilePath('manual');
    if (fs.existsSync(manualPromptPath)) {
      prompts[`${engineId}_manual`] = fs.readFileSync(manualPromptPath, 'utf8');
    } else {
      console.warn('[prompts-get] Manual 프롬프트 파일이 없습니다:', manualPromptPath);
      prompts[`${engineId}_manual`] = '';
    }

    console.log('[prompts-get] ✅ 프롬프트 조회 성공:', Object.keys(prompts));

    return res.status(200).json({
      success: true,
      prompts,
      engineId,
      structure: {
        auto: {
          product: `${engineId}_auto_product`,
          service: `${engineId}_auto_service`
        },
        manual: `${engineId}_manual`
      }
    });

  } catch (error) {
    console.error('[prompts-get] ❌ 오류 발생:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '서버 오류가 발생했습니다.'
    });
  }
}

// api/prompts-all.js - 모든 엔진 조합의 프롬프트 조회 API

import fs from 'fs';
import path from 'path';

const PROMPTS_DIR = path.join(process.cwd(), 'public', 'prompts');

/**
 * 모든 엔진 조합 폴더 스캔
 */
function getAllEngineCombinations() {
    if (!fs.existsSync(PROMPTS_DIR)) {
        return [];
    }

    const folders = fs.readdirSync(PROMPTS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(name => name.includes('_')); // 엔진 조합 형식 필터링

    return folders;
}

/**
 * 특정 엔진 조합의 프롬프트 로드
 */
function loadEnginePrompts(engineId) {
    const engineDir = path.join(PROMPTS_DIR, engineId);
    const prompts = {};

    // Auto - Product
    const productPath = path.join(engineDir, 'auto', 'product_prompt.txt');
    if (fs.existsSync(productPath)) {
        prompts.auto_product = fs.readFileSync(productPath, 'utf8');
    }

    // Auto - Service
    const servicePath = path.join(engineDir, 'auto', 'service_prompt.txt');
    if (fs.existsSync(servicePath)) {
        prompts.auto_service = fs.readFileSync(servicePath, 'utf8');
    }

    // Manual
    const manualPath = path.join(engineDir, 'manual', 'manual_prompt.txt');
    if (fs.existsSync(manualPath)) {
        prompts.manual = fs.readFileSync(manualPath, 'utf8');
    }

    return prompts;
}

/**
 * GET /nexxii/api/prompts/all - 모든 엔진 조합의 프롬프트 조회
 */
export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

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
        const engineCombinations = getAllEngineCombinations();
        const allPrompts = {};

        for (const engineId of engineCombinations) {
            allPrompts[engineId] = loadEnginePrompts(engineId);
        }

        console.log(`[prompts-all] ✅ ${engineCombinations.length}개 엔진 조합 프롬프트 조회 완료`);

        return res.status(200).json({
            success: true,
            engines: engineCombinations,
            prompts: allPrompts
        });

    } catch (error) {
        console.error('[prompts-all] ❌ 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message || '프롬프트 조회 실패'
        });
    }
}

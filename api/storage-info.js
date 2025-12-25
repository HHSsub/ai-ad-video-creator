// api/storage-info.js - EC2 저장소 정보 조회 API

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * 디렉토리 크기 계산 (재귀)
 */
async function getDirectorySize(dirPath) {
    try {
        const { stdout } = await execAsync(`du -sb "${dirPath}" 2>/dev/null || echo "0"`);
        const sizeBytes = parseInt(stdout.split('\t')[0]) || 0;
        return sizeBytes;
    } catch (error) {
        console.error(`[storage-info] 디렉토리 크기 계산 오류 (${dirPath}):`, error.message);
        return 0;
    }
}

/**
 * 바이트를 읽기 쉬운 형식으로 변환
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * GET /nexxii/api/storage/info - 저장소 정보 조회
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
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        console.log('[storage-info] 저장소 정보 조회 시작...');

        // 1. 전체 디스크 정보
        const { stdout: dfOutput } = await execAsync('df -h /home 2>/dev/null || df -h /');
        const dfLines = dfOutput.trim().split('\n');
        const dfData = dfLines[1].split(/\s+/);

        const diskInfo = {
            total: dfData[1] || 'N/A',
            used: dfData[2] || 'N/A',
            available: dfData[3] || 'N/A',
            usePercent: dfData[4] || 'N/A'
        };

        // 2. 프로젝트 디렉토리 크기
        const projectPath = process.cwd();
        const projectSize = await getDirectorySize(projectPath);

        // 3. 주요 폴더 크기
        const directories = [
            { name: 'public', path: path.join(projectPath, 'public') },
            { name: 'config', path: path.join(projectPath, 'config') },
            { name: 'tmp', path: path.join(projectPath, 'tmp') },
            { name: 'dist', path: path.join(projectPath, 'dist') },
            { name: 'node_modules', path: path.join(projectPath, 'node_modules') }
        ];

        const directorySizes = await Promise.all(
            directories.map(async (dir) => {
                if (!fs.existsSync(dir.path)) {
                    return { ...dir, size: 0, sizeFormatted: '0 B', exists: false };
                }
                const size = await getDirectorySize(dir.path);
                return {
                    ...dir,
                    size,
                    sizeFormatted: formatBytes(size),
                    exists: true
                };
            })
        );

        console.log('[storage-info] ✅ 저장소 정보 조회 완료');

        return res.status(200).json({
            success: true,
            disk: diskInfo,
            project: {
                path: projectPath,
                size: projectSize,
                sizeFormatted: formatBytes(projectSize)
            },
            directories: directorySizes.filter(d => d.exists)
        });

    } catch (error) {
        console.error('[storage-info] ❌ 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message || '저장소 정보 조회 실패'
        });
    }
}

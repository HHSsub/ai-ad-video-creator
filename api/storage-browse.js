// api/storage-browse.js - EC2 디렉토리 탐색 API

import fs from 'fs';
import path from 'path';

/**
 * 안전한 경로인지 확인 (프로젝트 루트 내부만 허용)
 */
function isSafePath(requestedPath) {
    const projectRoot = process.cwd();
    const resolvedPath = path.resolve(projectRoot, requestedPath);
    return resolvedPath.startsWith(projectRoot);
}

/**
 * 파일/폴더 삭제 가능 여부 확인
 */
function isDeletable(filePath) {
    const projectRoot = process.cwd();
    const relativePath = path.relative(projectRoot, filePath);

    // public, config, tmp 폴더 내부만 삭제 가능
    const deletablePrefixes = ['public/', 'config/', 'tmp/'];
    return deletablePrefixes.some(prefix => relativePath.startsWith(prefix));
}

/**
 * GET /nexxii/api/storage/browse?path=... - 디렉토리 탐색
 */
export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const projectRoot = process.cwd();

    // GET: 디렉토리 내용 조회
    if (req.method === 'GET') {
        try {
            const requestedPath = req.query.path || '.';
            const fullPath = path.resolve(projectRoot, requestedPath);

            if (!isSafePath(requestedPath)) {
                return res.status(403).json({
                    success: false,
                    error: '접근 권한이 없습니다.'
                });
            }

            if (!fs.existsSync(fullPath)) {
                return res.status(404).json({
                    success: false,
                    error: '경로를 찾을 수 없습니다.'
                });
            }

            const stats = fs.statSync(fullPath);

            if (!stats.isDirectory()) {
                return res.status(400).json({
                    success: false,
                    error: '디렉토리가 아닙니다.'
                });
            }

            const items = fs.readdirSync(fullPath);
            const contents = items.map(item => {
                const itemPath = path.join(fullPath, item);
                const itemStats = fs.statSync(itemPath);
                const relativePath = path.relative(projectRoot, itemPath);

                return {
                    name: item,
                    path: relativePath,
                    isDirectory: itemStats.isDirectory(),
                    size: itemStats.size,
                    modified: itemStats.mtime,
                    deletable: isDeletable(itemPath)
                };
            });

            // 폴더 먼저, 파일 나중에 정렬
            contents.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });

            return res.status(200).json({
                success: true,
                currentPath: path.relative(projectRoot, fullPath),
                contents
            });

        } catch (error) {
            console.error('[storage-browse] GET 오류:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // DELETE: 파일/폴더 삭제
    if (req.method === 'DELETE') {
        try {
            const { path: targetPath } = req.body;

            if (!targetPath) {
                return res.status(400).json({
                    success: false,
                    error: '삭제할 경로를 지정해주세요.'
                });
            }

            const fullPath = path.resolve(projectRoot, targetPath);

            if (!isSafePath(targetPath)) {
                return res.status(403).json({
                    success: false,
                    error: '접근 권한이 없습니다.'
                });
            }

            if (!isDeletable(fullPath)) {
                return res.status(403).json({
                    success: false,
                    error: '이 경로는 삭제할 수 없습니다. (public, config, tmp 폴더만 삭제 가능)'
                });
            }

            if (!fs.existsSync(fullPath)) {
                return res.status(404).json({
                    success: false,
                    error: '파일/폴더를 찾을 수 없습니다.'
                });
            }

            // 삭제 실행
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(fullPath);
            }

            console.log(`[storage-browse] ✅ 삭제 완료: ${targetPath}`);

            return res.status(200).json({
                success: true,
                message: '삭제되었습니다.'
            });

        } catch (error) {
            console.error('[storage-browse] DELETE 오류:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    return res.status(405).json({
        success: false,
        error: 'Method not allowed'
    });
}

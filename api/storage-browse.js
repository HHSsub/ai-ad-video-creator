// api/storage-browse.js - AWS S3 Browser API
import { s3Client, BUCKET_NAME } from '../src/utils/awsConfig.js';
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { runInProjectQueue } from '../server/utils/project-lock.js';
import fs from 'fs';
import path from 'path';

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET: List S3 Objects (Simulate Directory Structure)
    if (req.method === 'GET') {
        try {
            // Path param uses forward slashes. Root is empty string or undefined.
            let prefix = req.query.path || '';

            // Normalize prefix: Must end with '/' if it's not empty, to treat as folder
            if (prefix && !prefix.endsWith('/')) {
                prefix += '/';
            }
            if (prefix === './' || prefix === '.') {
                prefix = '';
            }

            console.log(`[storage-browse] Browsing S3: bucket=${BUCKET_NAME}, prefix='${prefix}'`);

            const command = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: prefix,
                Delimiter: '/' // Important to group by folders
            });

            const response = await s3Client.send(command);
            const contents = [];

            // 1. Process "Folders" (CommonPrefixes)
            if (response.CommonPrefixes) {
                response.CommonPrefixes.forEach(p => {
                    const fullPath = p.Prefix;
                    // Get only the folder name (remove parent path)
                    const name = fullPath.replace(prefix, '').replace('/', '');

                    contents.push({
                        name: name,
                        path: fullPath, // Keep trailing slash for folders
                        isDirectory: true,
                        size: 0,
                        modified: null,
                        deletable: false // S3 "folders" don't really exist to delete directly unless empty
                    });
                });
            }

            // 2. Process "Files" (Contents)
            if (response.Contents) {
                response.Contents.forEach(item => {
                    // Skip the folder placeholder itself (if created)
                    if (item.Key === prefix) return;

                    const name = item.Key.replace(prefix, '');

                    contents.push({
                        name: name,
                        path: item.Key,
                        isDirectory: false,
                        size: item.Size,
                        modified: item.LastModified,
                        deletable: true
                    });
                });
            }

            // Sort: Folders first, then Files
            contents.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });

            return res.status(200).json({
                success: true,
                currentPath: prefix,
                contents
            });

        } catch (error) {
            console.error('[storage-browse] GET 오류:', error);

            let errorMessage = error.message;
            if (error.name === 'CredentialsProviderError' || error.message.includes('authen')) {
                errorMessage = 'AWS 자격 증명을 찾을 수 없습니다. (EC2 IAM Role 확인 필요)';
            }

            return res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // DELETE: Delete S3 Object (Single File)
    if (req.method === 'DELETE') {
        try {
            const { path: targetKey } = req.body;

            if (!targetKey) {
                return res.status(400).json({ success: false, error: '삭제할 파일 키가 필요합니다.' });
            }

            if (targetKey.endsWith('/')) {
                return res.status(400).json({ success: false, error: '폴더는 직접 삭제할 수 없습니다. 내부 파일을 먼저 삭제해주세요.' });
            }

            console.log(`[storage-browse] Deleting S3 Object: ${targetKey}`);

            const command = new DeleteObjectCommand({
                Bucket: BUCKET_NAME,
                Key: targetKey
            });

            await s3Client.send(command);

            console.log(`[storage-browse] ✅ 삭제 완료: ${targetKey}`);

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

    // POST: Delete Folder (All Objects with Prefix)
    if (req.method === 'POST') {
        try {
            const { folderPath } = req.body;

            if (!folderPath) {
                return res.status(400).json({ success: false, error: '삭제할 폴더 경로가 필요합니다.' });
            }

            // Normalize folder path
            let prefix = folderPath;
            if (!prefix.endsWith('/')) {
                prefix += '/';
            }

            console.log(`[storage-browse] Deleting folder: ${prefix}`);

            // 🔥 프로젝트 ID 추출 (예: nexxii-storage/projects/project_1766739481756/ -> project_1766739481756)
            const projectIdMatch = prefix.match(/projects\/(project_\d+)\//);
            const projectId = projectIdMatch ? projectIdMatch[1] : null;

            if (projectId) {
                console.log(`[storage-browse] 🔍 프로젝트 ID 감지: ${projectId}`);
            }

            // List all objects with this prefix
            const listCommand = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: prefix
            });

            const listResponse = await s3Client.send(listCommand);

            if (!listResponse.Contents || listResponse.Contents.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: '폴더가 비어있거나 존재하지 않습니다.'
                });
            }

            // Delete all objects
            let deletedCount = 0;
            for (const item of listResponse.Contents) {
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: item.Key
                });
                await s3Client.send(deleteCommand);
                deletedCount++;
                console.log(`[storage-browse] ✅ 삭제: ${item.Key}`);
            }

            console.log(`[storage-browse] ✅ 폴더 삭제 완료: ${prefix} (${deletedCount}개 파일)`);

            // 🔥 프로젝트 DB 레코드(개별 JSON) 및 멤버십 삭제
            if (projectId) {
                try {
                    const projectsDir = path.join(process.cwd(), 'config', 'projects');
                    const projectFile = path.join(projectsDir, `${projectId}.json`);
                    const membersFile = path.join(process.cwd(), 'config', 'project-members.json');

                    // 1. 개별 프로젝트 파일 삭제
                    if (fs.existsSync(projectFile)) {
                        fs.unlinkSync(projectFile);
                        console.log(`[storage-browse] 🗑️ 개별 프로젝트 JSON 삭제 완료: ${projectId}`);
                    }

                    // 2. 멤버십 삭제
                    if (fs.existsSync(membersFile)) {
                        await runInProjectQueue(projectId, async () => {
                            const membersData = JSON.parse(fs.readFileSync(membersFile, 'utf8'));
                            const initialCount = membersData.members.length;
                            membersData.members = membersData.members.filter(m => m.projectId !== projectId);

                            if (initialCount !== membersData.members.length) {
                                fs.writeFileSync(membersFile, JSON.stringify(membersData, null, 2), 'utf8');
                                console.log(`[storage-browse] 🗑️ 프로젝트 멤버 삭제 완료`);
                            }
                        });
                    }
                } catch (dbError) {
                    console.error(`[storage-browse] ❌ 프로젝트 DB 삭제 실패:`, dbError);
                }
            }

            return res.status(200).json({
                success: true,
                message: `폴더가 삭제되었습니다. (${deletedCount}개 파일)${projectId ? ' + DB 레코드' : ''}`,
                deletedCount,
                projectDeleted: !!projectId
            });

        } catch (error) {
            console.error('[storage-browse] POST (폴더 삭제) 오류:', error);
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


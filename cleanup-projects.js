// S3에서 projects.json에 없는 고아 프로젝트 파일들을 모두 삭제하는 정리 스크립트
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectsFile = path.join(__dirname, 'config', 'projects.json');

// S3 클라이언트 설정
const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'upnexx-storage';
const S3_PREFIX = 'nexxii-storage/projects/';

console.log('🧹 S3 프로젝트 파일 정리 시작...\n');

// 1. projects.json 읽기
let projectsData;
try {
    const data = fs.readFileSync(projectsFile, 'utf8');
    projectsData = JSON.parse(data);
    console.log(`✅ projects.json 로드: ${projectsData.projects.length}개 프로젝트`);
} catch (error) {
    console.error('❌ projects.json 읽기 실패:', error.message);
    process.exit(1);
}

const validProjectIds = new Set(projectsData.projects.map(p => p.id));
console.log(`📋 유효한 프로젝트 ID: ${Array.from(validProjectIds).slice(0, 3).join(', ')}... (총 ${validProjectIds.size}개)\n`);

async function cleanupS3() {
    try {
        // 2. S3에서 projects/ 아래의 모든 객체 목록 가져오기
        console.log(`📂 S3 버킷 스캔: s3://${BUCKET_NAME}/${S3_PREFIX}\n`);

        const listCommand = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: S3_PREFIX
        });

        const response = await s3Client.send(listCommand);

        if (!response.Contents || response.Contents.length === 0) {
            console.log('⚠️ S3에 프로젝트 파일이 없습니다. 정리 완료.');
            return;
        }

        console.log(`� 발견된 S3 객체: ${response.Contents.length}개\n`);

        // 3. 각 객체의 프로젝트 ID 확인
        let deletedCount = 0;
        let skippedCount = 0;
        const orphanFiles = [];

        for (const obj of response.Contents) {
            const key = obj.Key;

            // 프로젝트 ID 추출 (예: nexxii-storage/projects/project_123456/...)
            const match = key.match(/projects\/(project_\d+)\//);

            if (!match) {
                console.log(`⚠️ 스킵 (프로젝트 ID 추출 실패): ${key}`);
                skippedCount++;
                continue;
            }

            const projectId = match[1];

            if (validProjectIds.has(projectId)) {
                // 활성 프로젝트의 파일
                skippedCount++;
            } else {
                // 고아 파일
                orphanFiles.push({ key, projectId });
            }
        }

        console.log(`\n🔍 스캔 완료:`);
        console.log(`  - 활성 프로젝트 파일: ${skippedCount}개`);
        console.log(`  - 고아 파일: ${orphanFiles.length}개\n`);

        if (orphanFiles.length === 0) {
            console.log('✅ 삭제할 고아 파일이 없습니다.');
            return;
        }

        // 4. 고아 파일 삭제
        console.log(`🗑️ ${orphanFiles.length}개 파일 삭제 시작...\n`);

        for (const file of orphanFiles) {
            try {
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: file.key
                }));
                console.log(`✅ 삭제: ${file.key}`);
                deletedCount++;
            } catch (error) {
                console.error(`❌ 삭제 실패: ${file.key} - ${error.message}`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`🎉 S3 정리 완료!`);
        console.log(`  - 삭제된 파일: ${deletedCount}개`);
        console.log(`  - 유지된 파일: ${skippedCount}개`);
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ S3 정리 실패:', error.message);
        process.exit(1);
    }
}

cleanupS3();

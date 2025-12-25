import fs from 'fs';
import path from 'path';
import { uploadVideoToS3 } from '../server/utils/s3-uploader.js';

const PROJECTS_FILE = path.join(process.cwd(), 'config', 'projects.json');
const COMPILED_DIR = path.join(process.cwd(), 'public', 'videos', 'compiled');

async function migrateMedia() {
    console.log('[Migrate] 🚀 미디어 마이그레이션 시작');
    console.log('[Migrate] Projects 파일:', PROJECTS_FILE);
    console.log('[Migrate] Compiled 디렉토리:', COMPILED_DIR);

    // 1. 기존 영상 파일 목록
    if (!fs.existsSync(COMPILED_DIR)) {
        console.log('[Migrate] ⚠️ compiled 디렉토리가 없습니다.');
        return;
    }

    const files = fs.readdirSync(COMPILED_DIR).filter(f => f.endsWith('.mp4'));
    console.log(`[Migrate] 발견된 영상: ${files.length}개`);

    if (files.length === 0) {
        console.log('[Migrate] ✅ 마이그레이션할 파일이 없습니다.');
        return;
    }

    // 2. 각 파일 S3 업로드
    const uploadedUrls = {};
    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
        const localPath = path.join(COMPILED_DIR, file);

        // 파일명에서 projectId 추출 시도 (compiled_timestamp_hash.mp4)
        const projectId = 'legacy'; // 기존 파일은 legacy 폴더로
        const conceptId = 'unknown';
        const filename = file.replace('.mp4', '');

        try {
            console.log(`[Migrate] 업로드 중: ${file}...`);
            const s3Url = await uploadVideoToS3(localPath, projectId, conceptId, filename);
            uploadedUrls[`/videos/compiled/${file}`] = s3Url;
            successCount++;
            console.log(`[Migrate] ✅ ${file} → ${s3Url}`);
        } catch (error) {
            failCount++;
            console.error(`[Migrate] ❌ ${file} 실패:`, error.message);
        }
    }

    console.log(`[Migrate] 업로드 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

    // 3. projects.json 업데이트
    if (!fs.existsSync(PROJECTS_FILE)) {
        console.log('[Migrate] ⚠️ projects.json 파일이 없습니다.');
        return;
    }

    const projectsData = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    let updatedCount = 0;

    for (const project of projectsData.projects) {
        if (project.storyboard?.finalVideos) {
            for (const video of project.storyboard.finalVideos) {
                if (video.videoUrl && uploadedUrls[video.videoUrl]) {
                    const oldUrl = video.videoUrl;
                    video.videoUrl = uploadedUrls[video.videoUrl];
                    updatedCount++;
                    console.log(`[Migrate] 프로젝트 ${project.id} URL 업데이트: ${oldUrl} → ${video.videoUrl}`);
                }
            }
        }
    }

    if (updatedCount > 0) {
        // 백업 생성
        const backupFile = PROJECTS_FILE + '.backup.' + Date.now();
        fs.copyFileSync(PROJECTS_FILE, backupFile);
        console.log(`[Migrate] 백업 생성: ${backupFile}`);

        // 업데이트된 내용 저장
        fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projectsData, null, 2));
        console.log(`[Migrate] ✅ projects.json 업데이트 완료 (${updatedCount}개 URL 변경)`);
    } else {
        console.log('[Migrate] ℹ️ 업데이트할 URL이 없습니다.');
    }

    console.log('[Migrate] 🎉 마이그레이션 완료!');
    console.log('[Migrate] 요약:');
    console.log(`  - 업로드 성공: ${successCount}개`);
    console.log(`  - 업로드 실패: ${failCount}개`);
    console.log(`  - URL 업데이트: ${updatedCount}개`);
}

// 실행
migrateMedia().catch(error => {
    console.error('[Migrate] ❌ 마이그레이션 실패:', error);
    process.exit(1);
});

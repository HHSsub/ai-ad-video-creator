// projects/ 폴더에서 projects.json에 없는 프로젝트 폴더들을 모두 삭제하는 정리 스크립트
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectsFile = path.join(__dirname, 'config', 'projects.json');
const projectsDir = path.join(__dirname, 'projects');

console.log('🧹 프로젝트 폴더 정리 시작...\n');

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
console.log(`📋 유효한 프로젝트 ID: ${Array.from(validProjectIds).join(', ')}\n`);

// 2. projects/ 폴더의 모든 하위 폴더 확인
if (!fs.existsSync(projectsDir)) {
    console.log('⚠️ projects/ 폴더가 없습니다. 정리 완료.');
    process.exit(0);
}

const folders = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

console.log(`📂 projects/ 폴더에서 발견된 폴더: ${folders.length}개\n`);

let deletedCount = 0;
let skippedCount = 0;

folders.forEach(folderId => {
    if (validProjectIds.has(folderId)) {
        console.log(`✔️ 유지: ${folderId} (활성 프로젝트)`);
        skippedCount++;
    } else {
        const folderPath = path.join(projectsDir, folderId);
        try {
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`🗑️ 삭제: ${folderId} (고아 폴더)`);
            deletedCount++;
        } catch (error) {
            console.error(`❌ 삭제 실패: ${folderId} - ${error.message}`);
        }
    }
});

console.log('\n' + '='.repeat(50));
console.log(`🎉 정리 완료!`);
console.log(`  - 삭제된 폴더: ${deletedCount}개`);
console.log(`  - 유지된 폴더: ${skippedCount}개`);
console.log('='.repeat(50));

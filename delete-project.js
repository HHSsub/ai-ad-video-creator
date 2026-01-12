// 특정 프로젝트를 projects.json과 project-members.json에서 삭제하는 스크립트
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 삭제할 프로젝트 ID
const PROJECT_ID_TO_DELETE = 'project_1766647607444';

const projectsFile = path.join(__dirname, 'config', 'projects.json');
const membersFile = path.join(__dirname, 'config', 'project-members.json');

console.log(`🗑️ 프로젝트 삭제 시작: ${PROJECT_ID_TO_DELETE}\n`);

try {
    // 1. projects.json 읽기
    const projectsData = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
    const initialCount = projectsData.projects.length;

    // 2. 해당 프로젝트 찾기
    const projectIndex = projectsData.projects.findIndex(p => p.id === PROJECT_ID_TO_DELETE);

    if (projectIndex === -1) {
        console.log('❌ 프로젝트를 찾을 수 없습니다.');
        process.exit(1);
    }

    const project = projectsData.projects[projectIndex];
    console.log(`✅ 프로젝트 발견:`);
    console.log(`  - 이름: ${project.name}`);
    console.log(`  - 생성자: ${project.createdBy}`);
    console.log(`  - 생성일: ${project.createdAt}\n`);

    // 3. projects.json에서 삭제
    projectsData.projects.splice(projectIndex, 1);
    fs.writeFileSync(projectsFile, JSON.stringify(projectsData, null, 2), 'utf8');
    console.log(`✅ projects.json 업데이트 완료 (${initialCount}개 → ${projectsData.projects.length}개)\n`);

    // 4. project-members.json에서 관련 멤버 삭제
    const membersData = JSON.parse(fs.readFileSync(membersFile, 'utf8'));
    const initialMemberCount = membersData.members.length;
    membersData.members = membersData.members.filter(m => m.projectId !== PROJECT_ID_TO_DELETE);
    fs.writeFileSync(membersFile, JSON.stringify(membersData, null, 2), 'utf8');
    console.log(`✅ project-members.json 업데이트 완료 (${initialMemberCount}개 → ${membersData.members.length}개)\n`);

    console.log('🎉 프로젝트 삭제 완료!');
    console.log('\n⚠️ 참고: S3 파일과 로컬 폴더는 수동으로 삭제해야 합니다.');
    console.log(`   - S3: nexxii-storage/projects/${PROJECT_ID_TO_DELETE}/`);
    console.log(`   - 로컬: projects/${PROJECT_ID_TO_DELETE}/`);

} catch (error) {
    console.error('❌ 오류 발생:', error.message);
    process.exit(1);
}

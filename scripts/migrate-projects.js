import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECTS_JSON = path.resolve(__dirname, '../config/projects.json');
const PROJECTS_DIR = path.resolve(__dirname, '../config/projects');
const MEMBERS_JSON = path.resolve(__dirname, '../config/project-members.json');

async function migrate() {
    console.log('🚀 마이그레이션 시작...');

    // 1. 디렉토리 생성
    if (!fs.existsSync(PROJECTS_DIR)) {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
        console.log(`📁 디렉토리 생성됨: ${PROJECTS_DIR}`);
    }

    // 2. projects.json 읽기
    if (!fs.existsSync(PROJECTS_JSON)) {
        console.error('❌ projects.json 파일이 없습니다.');
        return;
    }

    let projectsData;
    try {
        const raw = fs.readFileSync(PROJECTS_JSON, 'utf8');
        projectsData = JSON.parse(raw);
    } catch (e) {
        console.error('❌ projects.json 파싱 실패:', e.message);
        return;
    }

    if (!projectsData.projects || !Array.isArray(projectsData.projects)) {
        console.error('❌ 유효하지 않은 projects.json 형식입니다.');
        return;
    }

    console.log(`📊 총 ${projectsData.projects.length}개의 프로젝트 발견.`);

    // 3. 개별 파일로 분리
    let successCount = 0;
    projectsData.projects.forEach(project => {
        if (!project.id) {
            console.warn('⚠️ ID가 없는 프로젝트 스킵됨:', project.name);
            return;
        }

        const projectPath = path.join(PROJECTS_DIR, `${project.id}.json`);

        // 기존 파일이 있으면 덮어쓰기 (최신 projects.json 기준)
        try {
            fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), 'utf8');
            successCount++;
        } catch (e) {
            console.error(`❌ 파일 저장 실패 (${project.id}):`, e.message);
        }
    });

    console.log(`✅ ${successCount}개의 프로젝트 파일 생성 완료.`);

    // 4. 백업 생성
    const backupPath = `${PROJECTS_JSON}.backup_${Date.now()}`;
    fs.renameSync(PROJECTS_JSON, backupPath);
    console.log(`📦 원본 파일 백업됨: ${backupPath}`);

    console.log('\n✨ 마이그레이션 완료!');
    console.log('이제 서버 코드를 업데이트하여 개별 파일을 사용하도록 설정하십시오.');
}

migrate().catch(console.error);

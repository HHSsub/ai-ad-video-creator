import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configDir = path.join(__dirname, '../config');
const projectsFile = path.join(configDir, 'projects.json');
const membersFile = path.join(configDir, 'project-members.json');

// config 디렉토리 생성
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
  console.log('✅ /config 디렉토리 생성 완료');
}

// projects.json 초기화
if (!fs.existsSync(projectsFile)) {
  fs.writeFileSync(projectsFile, JSON.stringify({ projects: [] }, null, 2));
  console.log('✅ /config/projects.json 초기화 완료');
}

// project-members.json 초기화
if (!fs.existsSync(membersFile)) {
  fs.writeFileSync(membersFile, JSON.stringify({ members: [] }, null, 2));
  console.log('✅ /config/project-members.json 초기화 완료');
}

console.log('========================================');
console.log('🎉 Config 초기화 완료!');
console.log('========================================');

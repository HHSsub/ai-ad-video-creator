import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const projectsFile = path.join(__dirname, '../../config/projects.json');
const membersFile = path.join(__dirname, '../../config/project-members.json');

// JSON 파일 읽기 헬퍼
function readJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ JSON 읽기 실패: ${filePath}`, error);
    return null;
  }
}

// JSON 파일 쓰기 헬퍼
function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`❌ JSON 쓰기 실패: ${filePath}`, error);
    return false;
  }
}

// 1. 프로젝트 목록 조회 (GET /api/projects)
router.get('/', (req, res) => {
  const username = req.headers['x-username'];

  if (!username) {
    return res.status(401).json({ error: '인증 필요' });
  }

  const projectsData = readJSON(projectsFile);
  const membersData = readJSON(membersFile);

  if (!projectsData || !membersData) {
    return res.status(500).json({ error: 'DB 읽기 실패' });
  }

  // 사용자가 소속된 프로젝트 필터링
  const userProjects = projectsData.projects.filter(project => {
    const membership = membersData.members.find(
      m => m.projectId === project.id && m.username === username
    );
    return membership !== undefined;
  });

  res.json({ projects: userProjects });
});

// 2. 프로젝트 생성 (POST /api/projects)
router.post('/', (req, res) => {
  const username = req.headers['x-username'];
  const { name, description } = req.body;

  if (!username) {
    return res.status(401).json({ error: '인증 필요' });
  }

  if (!name) {
    return res.status(400).json({ error: '프로젝트 이름 필수' });
  }

  const projectsData = readJSON(projectsFile);
  const membersData = readJSON(membersFile);

  if (!projectsData || !membersData) {
    return res.status(500).json({ error: 'DB 읽기 실패' });
  }

  // 새 프로젝트 생성
  const newProject = {
    id: `project_${Date.now()}`,
    name,
    description: description || '',
    createdBy: username,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  projectsData.projects.push(newProject);

  // 생성자를 owner로 추가
  membersData.members.push({
    id: `member_${Date.now()}`,
    projectId: newProject.id,
    username,
    role: 'owner',
    addedAt: new Date().toISOString()
  });

  if (!writeJSON(projectsFile, projectsData) || !writeJSON(membersFile, membersData)) {
    return res.status(500).json({ error: 'DB 저장 실패' });
  }

  res.json({ project: newProject });
});

// 🔥 프로젝트 업데이트 (모드 저장)
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { mode, status, name, description } = req.body;
    const username = req.headers['x-user-id'] || req.headers['x-username'];

    console.log(`[projects PATCH] 요청: ${id}, mode: ${mode}, user: ${username}`);

    const projectsData = readJSON(projectsFile);
    const membersData = readJSON(membersFile);

    if (!projectsData || !membersData) {
      return res.status(500).json({ success: false, error: 'DB 읽기 실패' });
    }

    const projectIndex = projectsData.projects.findIndex(p => p.id === id);

    if (projectIndex === -1) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const project = projectsData.projects[projectIndex];

    // 권한 확인 (owner 또는 editor)
    const membership = membersData.members.find(
      m => m.projectId === id && m.username === username
    );

    if (!membership || (membership.role !== 'owner' && membership.role !== 'editor')) {
      return res.status(403).json({ success: false, error: 'Permission denied' });
    }

    // 업데이트
    if (mode !== undefined) project.mode = mode;
    if (status !== undefined) project.status = status;
    if (name !== undefined) project.name = name;
    if (description !== undefined) project.description = description;
    project.updatedAt = new Date().toISOString();

    projectsData.projects[projectIndex] = project;

    if (!writeJSON(projectsFile, projectsData)) {
      return res.status(500).json({ success: false, error: 'DB 저장 실패' });
    }

    console.log(`[projects PATCH] ✅ 프로젝트 업데이트 완료: ${id}, mode: ${mode}`);

    res.json({ success: true, project: project });
  } catch (error) {
    console.error('[projects PATCH] ❌ 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. 프로젝트 상세 조회 (GET /api/projects/:id)
router.get('/:id', (req, res) => {
  const username = req.headers['x-username'];
  const { id } = req.params;

  if (!username) {
    return res.status(401).json({ error: '인증 필요' });
  }

  const projectsData = readJSON(projectsFile);
  const membersData = readJSON(membersFile);

  if (!projectsData || !membersData) {
    return res.status(500).json({ error: 'DB 읽기 실패' });
  }

  const project = projectsData.projects.find(p => p.id === id);

  if (!project) {
    return res.status(404).json({ error: '프로젝트 없음' });
  }

  // 권한 확인
  const membership = membersData.members.find(
    m => m.projectId === id && m.username === username
  );

  if (!membership) {
    return res.status(403).json({ error: '접근 권한 없음' });
  }

  res.json({ project });
});

// 4. 프로젝트 수정 (PUT /api/projects/:id)
router.put('/:id', (req, res) => {
  const username = req.headers['x-username'];
  const { id } = req.params;
  const { name, description } = req.body;

  if (!username) {
    return res.status(401).json({ error: '인증 필요' });
  }

  const projectsData = readJSON(projectsFile);
  const membersData = readJSON(membersFile);

  if (!projectsData || !membersData) {
    return res.status(500).json({ error: 'DB 읽기 실패' });
  }

  const projectIndex = projectsData.projects.findIndex(p => p.id === id);

  if (projectIndex === -1) {
    return res.status(404).json({ error: '프로젝트 없음' });
  }

  // owner 권한 확인
  const membership = membersData.members.find(
    m => m.projectId === id && m.username === username && m.role === 'owner'
  );

  if (!membership) {
    return res.status(403).json({ error: 'owner 권한 필요' });
  }

  // 프로젝트 수정
  if (name) projectsData.projects[projectIndex].name = name;
  if (description !== undefined) projectsData.projects[projectIndex].description = description;
  projectsData.projects[projectIndex].updatedAt = new Date().toISOString();

  if (!writeJSON(projectsFile, projectsData)) {
    return res.status(500).json({ error: 'DB 저장 실패' });
  }

  res.json({ project: projectsData.projects[projectIndex] });
});

export default router;

// ============================================================
// 파일: server/routes/projects.js
// 수정 내용:
// 1. 개별 프로젝트 JSON 파일 사용 (config/projects/*.json)
// 2. Race Condition 방지를 위한 프로젝트별 쓰기 락(Queue) 구현
// 3. x-username 헤더 기반 프로젝트 필터링 및 권한 관리
// ============================================================

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createS3FolderPlaceholder } from '../utils/s3-uploader.js';
import { runInProjectQueue } from '../utils/project-lock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const PROJECTS_DIR = path.join(process.cwd(), 'config', 'projects');
const membersFile = path.join(process.cwd(), 'config', 'project-members.json');

// 프로젝트 디렉토리 보장
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// 🔥 Race Condition 방지는 전역 유틸리티(runInProjectQueue)로 이관됨

// JSON 파일 읽기 헬퍼
function readProjectFile(projectId) {
  const filePath = path.join(PROJECTS_DIR, `${projectId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ 프로젝트 파일 읽기 실패: ${projectId}`, error.message);
    return null;
  }
}

// JSON 파일 쓰기 헬퍼
function writeProjectFile(projectId, data) {
  const filePath = path.join(PROJECTS_DIR, `${projectId}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`❌ 프로젝트 파일 쓰기 실패: ${projectId}`, error.message);
    return false;
  }
}

// 멤버 파일 읽기 헬퍼
function readMembers() {
  try {
    if (!fs.existsSync(membersFile)) return { members: [] };
    return JSON.parse(fs.readFileSync(membersFile, 'utf8'));
  } catch (error) {
    console.error(`❌ 멤버 파일 읽기 실패`, error.message);
    return { members: [] };
  }
}

// 1. 프로젝트 목록 조회 (GET /api/projects)
router.get('/', (req, res) => {
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';
  console.log(`[projects GET /] 사용자: ${username}`);

  try {
    const membersData = readMembers();
    const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));

    const userProjects = [];

    for (const file of files) {
      const projectId = file.replace('.json', '');
      const projectData = readProjectFile(projectId);
      if (!projectData) continue;

      const isCreator = String(projectData.createdBy) === String(username);
      const membership = membersData.members.find(
        m => String(m.projectId) === String(projectId) && String(m.username) === String(username)
      );
      const isSystemAdmin = String(username) === 'admin';

      if (isSystemAdmin || isCreator || membership) {
        userProjects.push({
          id: projectData.id || projectId,
          name: projectData.name || 'Untitled Project',
          description: projectData.description || '',
          createdBy: projectData.createdBy,
          createdAt: projectData.createdAt,
          updatedAt: projectData.updatedAt,
          status: projectData.status,
          mode: projectData.mode || 'manual',
          lastStep: projectData.lastStep,
          storyboard: projectData.storyboard
        });
      }
    }

    // 최신순 정렬
    userProjects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ projects: userProjects });
  } catch (error) {
    console.error('[projects GET /] 오류:', error);
    res.status(500).json({ error: '목록 조회 실패' });
  }
});

// 2. 프로젝트 생성 (POST /api/projects)
router.post('/', async (req, res) => {
  const { name, description } = req.body;
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';
  const projectId = `project_${Date.now()}`;

  if (!name) return res.status(400).json({ error: '프로젝트 이름 필수' });

  const newProject = {
    id: projectId,
    name,
    description: description || '',
    createdBy: username,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mode: 'manual',
    formData: {},
    storyboard: { styles: [] }
  };

  if (writeProjectFile(projectId, newProject)) {
    // 멤버십 추가
    const membersData = readMembers();
    membersData.members.push({
      id: `member_${Date.now()}`,
      projectId: projectId,
      username,
      role: 'owner',
      addedAt: new Date().toISOString()
    });
    fs.writeFileSync(membersFile, JSON.stringify(membersData, null, 2));

    // S3 가상 폴더 생성 (비동기)
    createS3FolderPlaceholder(projectId).catch(err => {
      console.error(`[projects POST] S3 폴더 생성 실패 (무시):`, err.message);
    });

    res.json({ project: newProject });
  } else {
    res.status(500).json({ error: '저장 실패' });
  }
});

// 3. 프로젝트 업데이트 (PATCH /api/projects/:id)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';

  await runInProjectQueue(id, async () => {
    try {
      const project = readProjectFile(id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      // 권한 체크
      const membersData = readMembers();
      const isCreator = project.createdBy === username;
      const membership = membersData.members.find(m => m.projectId === id && m.username === username);
      const isOwnerOrEditor = membership && ['owner', 'editor'].includes(membership.role);
      const isAdmin = username === 'admin';

      if (!isAdmin && !isCreator && !isOwnerOrEditor) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      const { mode, status, name, description, formData, storyboard, storyboardUpdate } = req.body;

      if (mode !== undefined) project.mode = mode;
      if (status !== undefined) project.status = status;
      if (name !== undefined) project.name = name;
      if (description !== undefined) project.description = description;
      if (formData !== undefined) project.formData = formData;

      // 🔥 Full Storyboard Update (Legacy/Bulk)
      if (storyboard !== undefined) {
        project.storyboard = storyboard;
        console.log(`[projects PATCH] ✅ 전체 storyboard 저장 (ID: ${id})`);
      }

      // 🔥 Granular Storyboard Update (Partial - Race Condition 방지)
      if (storyboardUpdate) {
        const { conceptId, sceneNumber, updates } = storyboardUpdate;
        const styleIndex = project.storyboard.styles.findIndex(s => String(s.conceptId) === String(conceptId));
        if (styleIndex !== -1) {
          const images = project.storyboard.styles[styleIndex].images;
          const imgIndex = images.findIndex(img => String(img.sceneNumber) === String(sceneNumber));
          if (imgIndex !== -1) {
            // 필드별 병합 업데이트
            Object.assign(images[imgIndex], updates);
            console.log(`[projects PATCH] ✅ 씬 부분 업데이트 완료: Project ${id}, Concept ${conceptId}, Scene ${sceneNumber}`);
          }
        }
      }

      project.updatedAt = new Date().toISOString();

      if (writeProjectFile(id, project)) {
        res.json({ success: true, project });
      } else {
        res.status(500).json({ error: '저장 실패' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

// 4. 프로젝트 상세 조회 (GET /api/projects/:id)
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';

  const project = readProjectFile(id);
  if (!project) return res.status(404).json({ error: '프로젝트 없음' });

  // 간단 권한 체크
  const membersData = readMembers();
  const isCreator = project.createdBy === username;
  const membership = membersData.members.find(m => m.projectId === id && m.username === username);
  const isAdmin = username === 'admin';

  if (!isAdmin && !isCreator && !membership) {
    return res.status(403).json({ error: '접근 권한 없음' });
  }

  res.json({ project });
});

// 4-1. 프로젝트 멤버 조회 (GET /api/projects/:id/members)
router.get('/:id/members', (req, res) => {
  const { id } = req.params;
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';

  // 권한 체크 (참여 중인 멤버만 조회 가능)
  const membersData = readMembers();
  const membership = membersData.members.find(m => m.projectId === id && m.username === username);
  const isAdmin = username === 'admin';

  if (!isAdmin && !membership) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const projectMembers = membersData.members.filter(m => m.projectId === id);
  res.json({ members: projectMembers });
});

// 4-2. 프로젝트 멤버 권한 변경 (PATCH /api/projects/:id/members/:memberId)
router.patch('/:id/members/:memberId', (req, res) => {
  const { id, memberId } = req.params;
  const { role } = req.body;
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';

  const membersData = readMembers();
  const requester = membersData.members.find(m => m.projectId === id && m.username === username);
  const isAdmin = username === 'admin';

  // 권한 체크: Admin 또는 Project Owner만 변경 가능
  if (!isAdmin && (!requester || requester.role !== 'owner')) {
    return res.status(403).json({ error: 'Only Owners or Admins can change roles' });
  }

  const memberIndex = membersData.members.findIndex(m => m.id === memberId && m.projectId === id);
  if (memberIndex === -1) return res.status(404).json({ error: 'Member not found' });

  // 🔥 Owner의 권한은 누구도 변경 불가
  if (membersData.members[memberIndex].role === 'owner') {
    return res.status(403).json({ error: 'Owner role cannot be changed' });
  }

  membersData.members[memberIndex].role = role;
  membersData.members[memberIndex].updatedAt = new Date().toISOString();

  fs.writeFileSync(membersFile, JSON.stringify(membersData, null, 2));
  res.json({ success: true, member: membersData.members[memberIndex] });
});

// 4-3. 프로젝트 멤버 삭제 (DELETE /api/projects/:id/members/:memberId)
router.delete('/:id/members/:memberId', (req, res) => {
  const { id, memberId } = req.params;
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';

  const membersData = readMembers();
  const requester = membersData.members.find(m => m.projectId === id && m.username === username);
  const isAdmin = username === 'admin';

  if (!isAdmin && (!requester || requester.role !== 'owner')) {
    return res.status(403).json({ error: 'Only Owners or Admins can remove members' });
  }

  const member = membersData.members.find(m => m.id === memberId && m.projectId === id);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  // 🔥 Owner는 삭제 불가
  if (member.role === 'owner') {
    return res.status(403).json({ error: 'Owner cannot be removed' });
  }

  membersData.members = membersData.members.filter(m => m.id !== memberId);
  fs.writeFileSync(membersFile, JSON.stringify(membersData, null, 2));
  res.json({ success: true });
});

// 5. 🏠 씬 삭제 (POST /api/projects/:id/scenes/delete)
router.post('/:id/scenes/delete', async (req, res) => {
  const { id } = req.params;
  const { conceptId, sceneNumber } = req.body;
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';

  if (!conceptId || !sceneNumber) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  await runInProjectQueue(id, async () => {
    try {
      const project = readProjectFile(id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      // 권한 체크 (Owner/Editor/Admin 가능)
      const membersData = readMembers();
      const isCreator = project.createdBy === username;
      const membership = membersData.members.find(m => m.projectId === id && m.username === username);
      const isOwnerOrEditor = membership && ['owner', 'editor'].includes(membership.role);
      const isAdmin = username === 'admin';

      if (!isAdmin && !isCreator && !isOwnerOrEditor) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      if (!project.storyboard || !project.storyboard.styles) {
        return res.status(400).json({ error: 'Invalid project structure: storyboard or styles missing' });
      }

      const styleIndex = project.storyboard.styles.findIndex(s => String(s.conceptId) === String(conceptId));
      if (styleIndex !== -1) {
        const images = project.storyboard.styles[styleIndex].images;
        const initialCount = images.length;

        // 씬 삭제
        project.storyboard.styles[styleIndex].images = images.filter(img => String(img.sceneNumber) !== String(sceneNumber));

        if (initialCount !== project.storyboard.styles[styleIndex].images.length) {
          project.updatedAt = new Date().toISOString();
          if (writeProjectFile(id, project)) {
            console.log(`[projects DELETE SCENE] ✅ Project ${id}, Concept ${conceptId}, Scene ${sceneNumber} deleted`);
            return res.json({ success: true, project });
          }
        } else {
          return res.status(404).json({ error: 'Scene not found in concept' });
        }
      } else {
        return res.status(404).json({ error: 'Style not found' });
      }
    } catch (err) {
      console.error('[projects DELETE SCENE] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });
});

// 6. 프로젝트 삭제 (DELETE /api/projects/:id)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';

  const project = readProjectFile(id);
  if (!project) return res.status(404).json({ error: '프로젝트 없음' });

  const membersData = readMembers();
  const isCreator = project.createdBy === username;
  const membership = membersData.members.find(m => m.projectId === id && m.username === username && m.role === 'owner');
  const isAdmin = username === 'admin';

  if (!isAdmin && !isCreator && !membership) {
    return res.status(403).json({ error: 'Owner 권한 필요' });
  }

  try {
    // S3 삭제
    const { deleteFolderFromS3 } = await import('../utils/s3-uploader.js');
    await deleteFolderFromS3(`projects/${id}/`).catch(() => { });

    // 로컬 작업 폴더 삭제
    const localPath = path.join(__dirname, '../../projects', id);
    if (fs.existsSync(localPath)) fs.rmSync(localPath, { recursive: true, force: true });

    // 개별 JSON 삭제
    const filePath = path.join(PROJECTS_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // 멤버십 삭제
    membersData.members = membersData.members.filter(m => m.projectId !== id);
    fs.writeFileSync(membersFile, JSON.stringify(membersData, null, 2));

    res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

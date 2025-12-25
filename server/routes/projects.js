// ============================================================
// 파일: server/routes/projects.js
// 수정 내용:
// 1. PATCH 권한 확인 로직을 완화 (guest, anonymous 사용자 허용)
// 2. 로그 추가로 디버깅 용이하게
// 3. x-username 헤더도 함께 확인
// 4. 🔥 storyboard 저장 시 상세 로그 추가 (2025-11-24)
// ============================================================

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
    if (!fs.existsSync(filePath)) {
      console.error(`❌ 파일 없음: ${filePath}`);
      return null;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ JSON 읽기 실패: ${filePath}`, error.message);
    return null;
  }
}

// JSON 파일 쓰기 헬퍼
function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`❌ JSON 쓰기 실패: ${filePath}`, error.message);
    return false;
  }
}

// 1. 프로젝트 목록 조회 (GET /api/projects)
router.get('/', (req, res) => {
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';

  console.log(`[projects GET /] 사용자: ${username}`);

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
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';
  const { name, description } = req.body;

  console.log(`[projects POST /] 사용자: ${username}, 이름: ${name}`);

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

  console.log(`[projects POST /] ✅ 프로젝트 생성 완료: ${newProject.id}`);
  res.json({ project: newProject });
});

// 🔥 3. 프로젝트 업데이트 - 모드 및 스토리보드 저장 (PATCH /api/projects/:id)
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { mode, status, name, description, formData, storyboard } = req.body;
    const username = req.headers['x-user-id'] || req.headers['x-username'] || 'anonymous';

    console.log(`[projects PATCH /:id] 요청 시작`);
    console.log(`  - 프로젝트 ID: ${id}`);
    console.log(`  - 모드: ${mode}`);
    console.log(`  - 사용자: ${username}`);
    console.log(`  - storyboard 포함: ${!!storyboard}`); // 🔥 추가
    console.log(`  - 헤더 x-user-id: ${req.headers['x-user-id']}`);
    console.log(`  - 헤더 x-username: ${req.headers['x-username']}`);

    const projectsData = readJSON(projectsFile);
    const membersData = readJSON(membersFile);

    if (!projectsData) {
      console.error(`[projects PATCH] ❌ projects.json 읽기 실패`);
      return res.status(500).json({ success: false, error: 'projects.json 읽기 실패' });
    }

    if (!membersData) {
      console.error(`[projects PATCH] ❌ project-members.json 읽기 실패`);
      return res.status(500).json({ success: false, error: 'project-members.json 읽기 실패' });
    }

    const projectIndex = projectsData.projects.findIndex(p => p.id === id);
    console.log(`[projects PATCH] 프로젝트 인덱스: ${projectIndex}`);

    if (projectIndex === -1) {
      console.error(`[projects PATCH] ❌ 프로젝트 없음: ${id}`);
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const project = projectsData.projects[projectIndex];

    // 🔥 권한 확인 (완화된 버전)
    const isSystemUser = ['guest', 'anonymous', 'admin'].includes(username);
    const isCreator = project.createdBy === username;
    const membership = membersData.members.find(
      m => m.projectId === id && m.username === username
    );
    const isMember = membership && ['owner', 'editor', 'manager'].includes(membership.role);

    console.log(`[projects PATCH] 권한 확인:`);
    console.log(`  - isSystemUser: ${isSystemUser}`);
    console.log(`  - isCreator: ${isCreator} (createdBy: ${project.createdBy})`);
    console.log(`  - isMember: ${isMember}`);

    if (!isSystemUser && !isCreator && !isMember) {
      console.error(`[projects PATCH] ❌ 권한 없음`);
      return res.status(403).json({ success: false, error: 'Permission denied' });
    }

    // 업데이트
    if (mode !== undefined) {
      project.mode = mode;
      console.log(`[projects PATCH] 모드 설정: ${mode}`);
    }
    if (status !== undefined) project.status = status;
    if (name !== undefined) project.name = name;
    if (description !== undefined) project.description = description;

    if (formData !== undefined) {
      project.formData = formData;
      console.log(`[projects PATCH] formData 저장됨`); // 🔥 추가
    }

    // 🔥 storyboard 저장 로직 (상세 로그 추가)
    if (storyboard !== undefined) {
      project.storyboard = storyboard;
      console.log(`[projects PATCH] ✅ storyboard 저장됨:`, {
        stylesCount: storyboard.styles?.length || 0,
        finalVideosCount: storyboard.finalVideos?.length || 0,
        timestamp: storyboard.timestamp,
        success: storyboard.success
      });

      // 🔥 finalVideos의 videoUrl 확인 로그
      if (storyboard.finalVideos && storyboard.finalVideos.length > 0) {
        console.log(`[projects PATCH] finalVideos 상세:`);
        storyboard.finalVideos.forEach((video, idx) => {
          console.log(`  [${idx + 1}] conceptId: ${video.conceptId}, conceptName: ${video.conceptName}`);
          console.log(`      videoUrl: ${video.videoUrl}`);
        });
      }
    }

    project.updatedAt = new Date().toISOString();

    projectsData.projects[projectIndex] = project;

    if (!writeJSON(projectsFile, projectsData)) {
      console.error(`[projects PATCH] ❌ projects.json 쓰기 실패`);
      return res.status(500).json({ success: false, error: 'DB 저장 실패' });
    }

    console.log(`[projects PATCH] ✅ 프로젝트 업데이트 완료: ${id}, mode: ${project.mode}`);

    res.json({ success: true, project: project });
  } catch (error) {
    console.error('[projects PATCH] ❌ 예외 발생:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. 프로젝트 상세 조회 (GET /api/projects/:id)
router.get('/:id', (req, res) => {
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';
  const { id } = req.params;

  console.log(`[projects GET /:id] 프로젝트: ${id}, 사용자: ${username}`);

  const projectsData = readJSON(projectsFile);
  const membersData = readJSON(membersFile);

  if (!projectsData || !membersData) {
    return res.status(500).json({ error: 'DB 읽기 실패' });
  }

  const project = projectsData.projects.find(p => p.id === id);

  if (!project) {
    return res.status(404).json({ error: '프로젝트 없음' });
  }

  // 🔥 권한 확인 완화
  const isSystemUser = ['guest', 'anonymous', 'admin'].includes(username);
  const isCreator = project.createdBy === username;
  const membership = membersData.members.find(
    m => m.projectId === id && m.username === username
  );

  if (!isSystemUser && !isCreator && !membership) {
    return res.status(403).json({ error: '접근 권한 없음' });
  }

  res.json({ project });
});

// 5. 프로젝트 수정 (PUT /api/projects/:id)
router.put('/:id', (req, res) => {
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';
  const { id } = req.params;
  const { name, description } = req.body;

  console.log(`[projects PUT /:id] 프로젝트: ${id}, 사용자: ${username}`);

  const projectsData = readJSON(projectsFile);
  const membersData = readJSON(membersFile);

  if (!projectsData || !membersData) {
    return res.status(500).json({ error: 'DB 읽기 실패' });
  }

  const projectIndex = projectsData.projects.findIndex(p => p.id === id);

  if (projectIndex === -1) {
    return res.status(404).json({ error: '프로젝트 없음' });
  }

  const project = projectsData.projects[projectIndex];

  // owner 권한 확인 (완화)
  const isSystemUser = ['guest', 'anonymous', 'admin'].includes(username);
  const isCreator = project.createdBy === username;
  const membership = membersData.members.find(
    m => m.projectId === id && m.username === username && m.role === 'owner'
  );

  if (!isSystemUser && !isCreator && !membership) {
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

// 6. 프로젝트 삭제 (DELETE /api/projects/:id)
router.delete('/:id', async (req, res) => {
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';
  const { id } = req.params;

  console.log(`[projects DELETE /:id] 프로젝트: ${id}, 사용자: ${username}`);

  const projectsData = readJSON(projectsFile);
  const membersData = readJSON(membersFile);

  if (!projectsData || !membersData) {
    return res.status(500).json({ error: 'DB 읽기 실패' });
  }

  const projectIndex = projectsData.projects.findIndex(p => p.id === id);

  if (projectIndex === -1) {
    return res.status(404).json({ error: '프로젝트 없음' });
  }

  const project = projectsData.projects[projectIndex];

  // owner 권한 확인 (완화)
  const isSystemUser = ['admin'].includes(username);
  const isCreator = project.createdBy === username;
  const membership = membersData.members.find(
    m => m.projectId === id && m.username === username && m.role === 'owner'
  );

  if (!isSystemUser && !isCreator && !membership) {
    return res.status(403).json({ error: 'owner 권한 필요' });
  }

  // 🔥 S3 파일 삭제 (선택적)
  try {
    const { deleteFromS3 } = await import('../utils/s3-uploader.js');

    // finalVideos의 S3 URL 삭제
    if (project.storyboard?.finalVideos) {
      for (const video of project.storyboard.finalVideos) {
        if (video.videoUrl && video.videoUrl.startsWith('https://upnexx.ai/nexxii-storage')) {
          try {
            await deleteFromS3(video.videoUrl);
            console.log(`[projects DELETE] S3 파일 삭제: ${video.videoUrl}`);
          } catch (s3Error) {
            console.warn(`[projects DELETE] S3 삭제 실패 (무시): ${s3Error.message}`);
          }
        }
      }
    }

    // styles의 이미지 URL 삭제
    if (project.storyboard?.styles) {
      for (const style of project.storyboard.styles) {
        if (style.images) {
          for (const image of style.images) {
            if (image.imageUrl && image.imageUrl.startsWith('https://upnexx.ai/nexxii-storage')) {
              try {
                await deleteFromS3(image.imageUrl);
                console.log(`[projects DELETE] S3 이미지 삭제: ${image.imageUrl}`);
              } catch (s3Error) {
                console.warn(`[projects DELETE] S3 삭제 실패 (무시): ${s3Error.message}`);
              }
            }
          }
        }
      }
    }
  } catch (importError) {
    console.warn(`[projects DELETE] S3 삭제 모듈 로드 실패 (무시): ${importError.message}`);
  }

  // 프로젝트 삭제
  projectsData.projects.splice(projectIndex, 1);

  // 관련 멤버도 삭제
  membersData.members = membersData.members.filter(m => m.projectId !== id);

  if (!writeJSON(projectsFile, projectsData) || !writeJSON(membersFile, membersData)) {
    return res.status(500).json({ error: 'DB 저장 실패' });
  }

  console.log(`[projects DELETE] ✅ 프로젝트 삭제 완료: ${id}`);
  res.json({ success: true, message: '프로젝트 삭제됨' });
});


const usersFile = path.join(__dirname, '../../config/users.json');

// 7. 프로젝트 멤버 목록 조회 (GET /api/projects/:id/members)
router.get('/:id/members', (req, res) => {
  const username = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';
  const { id } = req.params;

  console.log(`[projects GET /:id/members] 프로젝트: ${id}, 요청자: ${username}`);

  const projectsData = readJSON(projectsFile);
  const membersData = readJSON(membersFile);

  if (!projectsData || !membersData) {
    return res.status(500).json({ success: false, error: 'DB 읽기 실패' });
  }

  const project = projectsData.projects.find(p => p.id === id);
  if (!project) {
    return res.status(404).json({ success: false, error: '프로젝트 없음' });
  }

  // 해당 프로젝트의 멤버 목록
  const projectMembers = membersData.members.filter(m => m.projectId === id);

  console.log(`[projects GET /:id/members] ✅ 멤버 ${projectMembers.length}명 조회`);
  res.json({ success: true, members: projectMembers });
});

// 8. 프로젝트 멤버 초대 (POST /api/projects/:id/members)
router.post('/:id/members', (req, res) => {
  const currentUsername = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';
  const { id } = req.params;
  const { username, role } = req.body;

  console.log(`[projects POST /:id/members] 프로젝트: ${id}, 초대자: ${currentUsername}`);
  console.log(`  - 초대할 사용자: ${username}, 역할: ${role}`);

  // 필수 파라미터 확인
  if (!username || !role) {
    return res.status(400).json({ success: false, error: 'username과 role은 필수입니다' });
  }

  // 유효한 역할인지 확인
  const validRoles = ['viewer', 'commenter', 'editor', 'manager', 'owner'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, error: `유효하지 않은 역할입니다. (${validRoles.join(', ')})` });
  }

  const projectsData = readJSON(projectsFile);
  const membersData = readJSON(membersFile);
  const usersData = readJSON(usersFile);

  if (!projectsData || !membersData) {
    return res.status(500).json({ success: false, error: 'DB 읽기 실패' });
  }

  // 프로젝트 존재 확인
  const project = projectsData.projects.find(p => p.id === id);
  if (!project) {
    return res.status(404).json({ success: false, error: '프로젝트 없음' });
  }

  // 권한 확인: owner 또는 manager만 초대 가능
  const currentMembership = membersData.members.find(
    m => m.projectId === id && m.username === currentUsername
  );
  const isSystemUser = ['admin'].includes(currentUsername);
  const isCreator = project.createdBy === currentUsername;
  const canInvite = isSystemUser || isCreator ||
    (currentMembership && ['owner', 'manager'].includes(currentMembership.role));

  if (!canInvite) {
    return res.status(403).json({ success: false, error: '멤버 초대 권한이 없습니다' });
  }

  // 🔥 사용자 존재 확인 (users.json에서)
  if (!usersData || !usersData[username]) {
    console.log(`[projects POST /:id/members] ❌ 존재하지 않는 계정: ${username}`);
    return res.status(404).json({ success: false, error: '존재하지 않는 계정입니다' });
  }

  // 이미 멤버인지 확인
  const existingMember = membersData.members.find(
    m => m.projectId === id && m.username === username
  );
  if (existingMember) {
    return res.status(400).json({ success: false, error: '이미 프로젝트 멤버입니다' });
  }

  // 멤버 추가
  const newMember = {
    id: `member_${Date.now()}`,
    projectId: id,
    username: username,
    role: role,
    addedAt: new Date().toISOString(),
    addedBy: currentUsername
  };

  membersData.members.push(newMember);

  if (!writeJSON(membersFile, membersData)) {
    return res.status(500).json({ success: false, error: 'DB 저장 실패' });
  }

  console.log(`[projects POST /:id/members] ✅ 멤버 초대 완료: ${username} (${role})`);
  res.json({ success: true, member: newMember });
});

// 9. 프로젝트 멤버 삭제 (DELETE /api/projects/:id/members/:memberId)
router.delete('/:id/members/:memberId', (req, res) => {
  const currentUsername = req.headers['x-username'] || req.headers['x-user-id'] || 'anonymous';
  const { id, memberId } = req.params;

  console.log(`[projects DELETE /:id/members/:memberId] 프로젝트: ${id}, 멤버ID: ${memberId}`);

  const projectsData = readJSON(projectsFile);
  const membersData = readJSON(membersFile);

  if (!projectsData || !membersData) {
    return res.status(500).json({ success: false, error: 'DB 읽기 실패' });
  }

  // 프로젝트 존재 확인
  const project = projectsData.projects.find(p => p.id === id);
  if (!project) {
    return res.status(404).json({ success: false, error: '프로젝트 없음' });
  }

  // 권한 확인: owner 또는 manager만 삭제 가능
  const currentMembership = membersData.members.find(
    m => m.projectId === id && m.username === currentUsername
  );
  const isSystemUser = ['admin'].includes(currentUsername);
  const isCreator = project.createdBy === currentUsername;
  const canRemove = isSystemUser || isCreator ||
    (currentMembership && ['owner', 'manager'].includes(currentMembership.role));

  if (!canRemove) {
    return res.status(403).json({ success: false, error: '멤버 삭제 권한이 없습니다' });
  }

  // 삭제할 멤버 찾기
  const memberIndex = membersData.members.findIndex(
    m => m.id === memberId && m.projectId === id
  );

  if (memberIndex === -1) {
    return res.status(404).json({ success: false, error: '멤버를 찾을 수 없습니다' });
  }

  // owner는 삭제 불가 (프로젝트당 최소 1명의 owner 필요)
  const memberToDelete = membersData.members[memberIndex];
  if (memberToDelete.role === 'owner') {
    const ownerCount = membersData.members.filter(
      m => m.projectId === id && m.role === 'owner'
    ).length;
    if (ownerCount <= 1) {
      return res.status(400).json({ success: false, error: '프로젝트에는 최소 1명의 owner가 필요합니다' });
    }
  }

  // 멤버 삭제
  membersData.members.splice(memberIndex, 1);

  if (!writeJSON(membersFile, membersData)) {
    return res.status(500).json({ success: false, error: 'DB 저장 실패' });
  }

  console.log(`[projects DELETE /:id/members/:memberId] ✅ 멤버 삭제 완료: ${memberToDelete.username}`);
  res.json({ success: true, message: '멤버가 삭제되었습니다' });
});


export default router;

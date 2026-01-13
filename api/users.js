import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import bcrypt from 'bcrypt';

const router = express.Router();
const USERS_FILE = path.join(process.cwd(), 'config', 'users.json');

console.log('[users] 파일 경로:', USERS_FILE);

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      console.error('[users] ❌ 파일이 없습니다:', USERS_FILE);
      throw new Error('사용자 설정 파일이 없습니다.');
    }

    const data = fs.readFileSync(USERS_FILE, 'utf8');
    const users = JSON.parse(data);
    console.log('[users] ✅ 로드 완료, 사용자 수:', Object.keys(users).length);
    return users;
  } catch (error) {
    console.error('[users] ❌ 로드 오류:', error);
    throw error;
  }
}

function saveUsers(users) {
  try {
    const data = JSON.stringify(users, null, 2);

    console.log('[users] 💾 저장 시도:', USERS_FILE);
    console.log('[users] 저장할 데이터:', data);

    fs.writeFileSync(USERS_FILE, data, 'utf8');

    const verification = fs.readFileSync(USERS_FILE, 'utf8');
    console.log('[users] ✅ 저장 확인:', verification);

    return true;
  } catch (error) {
    console.error('[users] ❌ 저장 실패:', error);
    console.error('[users] 파일 경로:', USERS_FILE);
    console.error('[users] 에러 상세:', error.stack);
    return false;
  }
}

// 🔥 일일 리셋 함수 (오늘 사용량만 리셋)
function checkAndResetDaily(user) {
  const today = new Date().toISOString().split('T')[0];

  if (user.lastResetDate !== today) {
    console.log(`[users] 🔄 일일 리셋: ${user.id} (${user.usageCount}회 → 0회)`);
    user.usageCount = 0; // 오늘 사용량만 리셋
    user.lastResetDate = today;
    return true;
  }

  return false;
}

router.get('/', (req, res) => {
  try {
    console.log('[users GET] 요청 받음');
    const users = loadUsers();
    const currentUsername = req.headers['x-username'];
    const currentUser = users[currentUsername];

    console.log('[users GET] 요청자:', currentUsername, '권한:', currentUser?.role);

    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '관리자 권한이 필요합니다.'
      });
    }

    // 🔥 usageCount 필드 마이그레이션 (필요 시)
    let needsSave = false;
    Object.keys(users).forEach(username => {
      const user = users[username];
      if (user.usageCount === undefined) {
        user.usageCount = 0;
        needsSave = true;
      }
    });

    if (needsSave) {
      saveUsers(users);
    }

    const userList = Object.keys(users).map(username => {
      // 🔥 admin 요청 시에는 password 포함
      if (currentUser.role === 'admin') {
        return { username, ...users[username] };
      }

      const { password, ...userInfo } = users[username];
      return { username, ...userInfo };
    });

    console.log('[users GET] 응답:', userList.length, '명');

    res.json({
      success: true,
      users: userList
    });
  } catch (error) {
    console.error('[users GET] ❌ 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.post('/', async (req, res) => {
  try {
    console.log('[users POST] 요청 받음');
    console.log('[users POST] body:', req.body);
    const users = loadUsers();
    const currentUsername = req.headers['x-username'];
    const currentUser = users[currentUsername];

    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '관리자 권한이 필요합니다.'
      });
    }

    const { username, password, name, usageLimit } = req.body;

    console.log('[users POST] 추가 요청:', { username, name, usageLimit });

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '아이디와 비밀번호는 필수입니다.'
      });
    }

    if (users[username]) {
      return res.status(400).json({
        success: false,
        message: '이미 존재하는 아이디입니다.'
      });
    }

    // 🔥 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('[users POST] 🔐 비밀번호 해싱 완료:', username);

    users[username] = {
      id: username,
      password: hashedPassword,
      plainPassword: password, // 🔥 평문 비밀번호 저장 (관리자 접근용)
      role: 'user',
      name: name || username,
      usageLimit: usageLimit !== undefined && usageLimit !== null && usageLimit !== '' ? parseInt(usageLimit) : null,
      usageCount: 0, // 🔥 누적 총 사용량
      lastResetDate: new Date().toISOString().split('T')[0] // 🔥 한도 편집 날짜
    };

    const saved = saveUsers(users);

    if (!saved) {
      throw new Error('파일 저장에 실패했습니다.');
    }

    console.log('[users POST] ✅ 성공:', username);

    res.json({
      success: true,
      message: '사용자가 추가되었습니다.',
      user: users[username]
    });
  } catch (error) {
    console.error('[users POST] ❌ 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.put('/', async (req, res) => {
  try {
    console.log('[users PUT] 요청 받음');
    console.log('[users PUT] query:', req.query);
    console.log('[users PUT] body:', req.body);
    console.log('[users PUT] headers:', req.headers);

    const users = loadUsers();
    const currentUsername = req.headers['x-username'];
    const currentUser = users[currentUsername];

    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '관리자 권한이 필요합니다.'
      });
    }

    const { username } = req.query;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'username 파라미터가 필요합니다.'
      });
    }

    if (!users[username]) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    console.log('[users PUT] 수정 전:', JSON.stringify(users[username], null, 2));

    // 🔥 usageCount 필드가 없으면 초기화 (기존 데이터 마이그레이션)
    if (users[username].usageCount === undefined) {
      users[username].usageCount = 0;
    }

    const updateData = req.body || {};

    if (updateData.password) {
      // 🔥 비밀번호 해싱
      const hashedPassword = await bcrypt.hash(updateData.password, 10);
      users[username].password = hashedPassword;
      users[username].plainPassword = updateData.password; // 🔥 평문 비밀번호도 저장
      console.log('[users PUT] 🔐 비밀번호 해싱 완료:', username);
    }

    if (updateData.name) {
      users[username].name = updateData.name;
    }

    if (updateData.hasOwnProperty('usageLimit')) {
      const limit = updateData.usageLimit;
      users[username].usageLimit = (limit === null || limit === '' || limit === undefined) ? null : parseInt(limit);
      // 🔥 한도 변경 시 lastResetDate 갱신 (한도 마지막 편집 날짜)
      users[username].lastResetDate = new Date().toISOString().split('T')[0];
      console.log('[users PUT] 한도 변경 → lastResetDate 갱신:', users[username].lastResetDate);
    }

    console.log('[users PUT] 수정 후:', JSON.stringify(users[username], null, 2));

    const saved = saveUsers(users);

    if (!saved) {
      throw new Error('파일 저장에 실패했습니다.');
    }

    console.log('[users PUT] ✅ 성공:', username);

    res.json({
      success: true,
      message: '사용자 정보가 수정되었습니다.',
      user: users[username]
    });
  } catch (error) {
    console.error('[users PUT] ❌ 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.delete('/', async (req, res) => {
  try {
    console.log('[users DELETE] 요청 받음');
    const users = loadUsers();
    const currentUsername = req.headers['x-username'];
    const currentUser = users[currentUsername];

    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '관리자 권한이 필요합니다.'
      });
    }

    const { username } = req.query;

    console.log('[users DELETE] 삭제 대상:', username);

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'username 파라미터가 필요합니다.'
      });
    }

    if (username === 'admin') {
      return res.status(400).json({
        success: false,
        message: '관리자 계정은 삭제할 수 없습니다.'
      });
    }

    if (!users[username]) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    // 🔥 사용자 종속 프로젝트 자동 삭제 (S3 및 로컬)
    try {
      const projectsDir = path.join(process.cwd(), 'config', 'projects');
      const membersFile = path.join(process.cwd(), 'config', 'project-members.json');

      if (fs.existsSync(projectsDir) && fs.existsSync(membersFile)) {
        const membersData = JSON.parse(fs.readFileSync(membersFile, 'utf8'));
        const projectFiles = fs.readdirSync(projectsDir).filter(f => f.endsWith('.json'));

        console.log(`[users DELETE] ${username}의 프로젝트 전수 조사 시작...`);
        const { deleteFolderFromS3 } = await import('../server/utils/s3-uploader.js');

        for (const file of projectFiles) {
          const projectId = file.replace('.json', '');
          const filePath = path.join(projectsDir, file);
          const projectData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

          if (projectData.createdBy === username) {
            console.log(`[users DELETE] 삭제 대상 프로젝트 발견: ${projectId}`);

            // 1. S3 폴더 삭제 (즉시 삭제)
            try {
              const s3Prefix = `nexxii-storage/projects/${projectId}/`;
              await deleteFolderFromS3(s3Prefix);
              console.log(`[users DELETE] S3 삭제 완료: ${s3Prefix}`);
            } catch (s3Err) {
              console.warn(`[users DELETE] S3 삭제 실패 (무시): ${s3Err.message}`);
            }

            // 2. 로컬 프로젝트 폴더 삭제
            try {
              const localFolder = path.join(process.cwd(), 'projects', projectId);
              if (fs.existsSync(localFolder)) {
                fs.rmSync(localFolder, { recursive: true, force: true });
                console.log(`[users DELETE] 로컬 폴더 삭제 완료: ${localFolder}`);
              }
            } catch (localErr) {
              console.warn(`[users DELETE] 로컬 폴더 삭제 실패 (무시): ${localErr.message}`);
            }

            // 3. 개별 JSON 삭제
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[users DELETE] 프로젝트 JSON 삭제 완료: ${filePath}`);
              }
            } catch (jsonErr) {
              console.warn(`[users DELETE] 프로젝트 JSON 삭제 실패: ${jsonErr.message}`);
            }

            // 4. project-members.json에서 해당 프로젝트 관련 모든 멤버 정보 제거
            membersData.members = membersData.members.filter(m => m.projectId !== projectId);
          }
        }

        // 업데이트된 데이터 저장
        fs.writeFileSync(membersFile, JSON.stringify(membersData, null, 2), 'utf8');
        console.log(`[users DELETE] 프로젝트 멤버 JSON 업데이트 완료`);
      }
    } catch (cleanupErr) {
      console.error('[users DELETE] 프로젝트 정리 중 오류 발생:', cleanupErr);
      // 사용자 삭제는 계속 진행
    }

    delete users[username];

    const saved = saveUsers(users);

    if (!saved) {
      throw new Error('파일 저장에 실패했습니다.');
    }

    console.log('[users DELETE] ✅ 성공:', username);

    res.json({
      success: true,
      message: '사용자와 종속 프로젝트가 모두 삭제되었습니다.'
    });
  } catch (error) {
    console.error('[users DELETE] ❌ 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔥 사용량 제한 확인 (누적 총량 기준)
export function checkUsageLimit(username) {
  try {
    const users = loadUsers();
    const user = users[username];

    if (!user) {
      return { allowed: false, message: '사용자를 찾을 수 없습니다.' };
    }

    // 🔥 usageCount 필드가 없으면 초기화
    if (user.usageCount === undefined) {
      user.usageCount = 0;
      saveUsers(users);
    }

    if (user.role === 'admin') {
      return { allowed: true };
    }

    if (user.usageLimit === null || user.usageLimit === undefined) {
      return { allowed: true };
    }

    // 🔥 누적 총량 기준으로 체크 (일일 리셋 없음)
    if (user.usageCount >= user.usageLimit) {
      return {
        allowed: false,
        message: `사용 횟수 한도를 초과했습니다. (사용: ${user.usageCount}/${user.usageLimit})`
      };
    }

    return { allowed: true, remaining: user.usageLimit - user.usageCount };
  } catch (error) {
    console.error('[checkUsageLimit] ❌ 오류:', error);
    return { allowed: false, message: '사용자 정보를 확인할 수 없습니다.' };
  }
}

// 🔥 사용량 증가 (누적 총량만 증가)
export function incrementUsage(username) {
  try {
    const users = loadUsers();
    const user = users[username];

    if (!user) return false;

    // 🔥 usageCount 필드가 없으면 초기화
    if (user.usageCount === undefined) {
      user.usageCount = 0;
    }

    user.usageCount += 1; // 누적 총량 증가

    saveUsers(users);

    console.log(`[incrementUsage] ✅ ${username}: 총 사용 ${user.usageCount}/${user.usageLimit || '무제한'}회`);

    return true;
  } catch (error) {
    console.error('[incrementUsage] ❌ 오류:', error);
    return false;
  }
}

export default router;

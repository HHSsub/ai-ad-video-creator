import express from 'express';
import fs from 'fs';
import path from 'path';

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

function checkAndResetDaily(user) {
  const today = new Date().toISOString().split('T')[0];
  
  if (user.lastResetDate !== today) {
    user.usageCount = 0;
    user.lastResetDate = today;
    console.log('[users] 🔄 일일 리셋:', user.id);
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
    
    const userList = Object.keys(users).map(username => {
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

router.post('/', (req, res) => {
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
    
    users[username] = {
      id: username,
      password,
      role: 'user',
      name: name || username,
      usageLimit: usageLimit !== undefined && usageLimit !== null && usageLimit !== '' ? parseInt(usageLimit) : null,
      usageCount: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
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

router.put('/', (req, res) => {
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
    
    const updateData = req.body || {};
    
    if (updateData.password) {
      users[username].password = updateData.password;
    }
    
    if (updateData.name) {
      users[username].name = updateData.name;
    }
    
    if (updateData.hasOwnProperty('usageLimit')) {
      const limit = updateData.usageLimit;
      users[username].usageLimit = (limit === null || limit === '' || limit === undefined) ? null : parseInt(limit);
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

router.delete('/', (req, res) => {
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
    
    delete users[username];
    
    const saved = saveUsers(users);
    
    if (!saved) {
      throw new Error('파일 저장에 실패했습니다.');
    }
    
    console.log('[users DELETE] ✅ 성공:', username);
    
    res.json({
      success: true,
      message: '사용자가 삭제되었습니다.'
    });
  } catch (error) {
    console.error('[users DELETE] ❌ 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export function checkUsageLimit(username) {
  try {
    const users = loadUsers();
    const user = users[username];
    
    if (!user) {
      return { allowed: false, message: '사용자를 찾을 수 없습니다.' };
    }
    
    const wasReset = checkAndResetDaily(user);
    if (wasReset) {
      saveUsers(users);
    }
    
    if (user.role === 'admin') {
      return { allowed: true };
    }
    
    if (user.usageLimit === null || user.usageLimit === undefined) {
      return { allowed: true };
    }
    
    if (user.usageCount >= user.usageLimit) {
      return {
        allowed: false,
        message: `일일 사용 횟수를 초과했습니다. (${user.usageCount}/${user.usageLimit})`
      };
    }
    
    return { allowed: true, remaining: user.usageLimit - user.usageCount };
  } catch (error) {
    console.error('[checkUsageLimit] ❌ 오류:', error);
    return { allowed: false, message: '사용자 정보를 확인할 수 없습니다.' };
  }
}

export function incrementUsage(username) {
  try {
    const users = loadUsers();
    const user = users[username];
    
    if (!user) return false;
    
    checkAndResetDaily(user);
    user.usageCount += 1;
    
    saveUsers(users);
    
    console.log(`[incrementUsage] ✅ ${username}: ${user.usageCount}/${user.usageLimit || '무제한'}`);
    
    return true;
  } catch (error) {
    console.error('[incrementUsage] ❌ 오류:', error);
    return false;
  }
}

export default router;

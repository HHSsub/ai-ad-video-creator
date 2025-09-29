import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const USERS_FILE = path.join(process.cwd(), 'config', 'users.json');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      console.error('[users] ❌ config/users.json 파일이 없습니다. 서버에 파일을 생성해주세요.');
      throw new Error('사용자 설정 파일이 없습니다. 관리자에게 문의하세요.');
    }
    
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[users] 로드 오류:', error);
    throw error;
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log('[users] ✅ 저장 완료');
    return true;
  } catch (error) {
    console.error('[users] 저장 오류:', error);
    return false;
  }
}

function checkAndResetDaily(user) {
  const today = new Date().toISOString().split('T')[0];
  
  if (user.lastResetDate !== today) {
    user.usageCount = 0;
    user.lastResetDate = today;
    return true;
  }
  
  return false;
}

router.get('/', (req, res) => {
  try {
    const users = loadUsers();
    const currentUsername = req.headers['x-username'];
    const currentUser = users[currentUsername];
    
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
    
    res.json({
      success: true,
      users: userList
    });
  } catch (error) {
    console.error('[users GET] 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '서버 오류가 발생했습니다.'
    });
  }
});

router.post('/', (req, res) => {
  try {
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
    
    saveUsers(users);
    
    console.log(`✅ 신규 사용자 추가: ${username}`);
    
    res.json({
      success: true,
      message: '사용자가 추가되었습니다.',
      user: { username, ...users[username] }
    });
  } catch (error) {
    console.error('[users POST] 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '서버 오류가 발생했습니다.'
    });
  }
});

router.put('/', (req, res) => {
  try {
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
    const { password, name, usageLimit } = req.body;
    
    if (!users[username]) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }
    
    if (password) users[username].password = password;
    if (name) users[username].name = name;
    if (usageLimit !== undefined) {
      users[username].usageLimit = usageLimit === null || usageLimit === '' ? null : parseInt(usageLimit);
    }
    
    saveUsers(users);
    
    console.log(`✅ 사용자 정보 수정: ${username}`);
    
    res.json({
      success: true,
      message: '사용자 정보가 수정되었습니다.',
      user: { username, ...users[username] }
    });
  } catch (error) {
    console.error('[users PUT] 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '서버 오류가 발생했습니다.'
    });
  }
});

router.delete('/', (req, res) => {
  try {
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
    saveUsers(users);
    
    console.log(`✅ 사용자 삭제: ${username}`);
    
    res.json({
      success: true,
      message: '사용자가 삭제되었습니다.'
    });
  } catch (error) {
    console.error('[users DELETE] 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '서버 오류가 발생했습니다.'
    });
  }
});

export function checkUsageLimit(username) {
  try {
    const users = loadUsers();
    const user = users[username];
    
    if (!user) {
      return {
        allowed: false,
        message: '사용자를 찾을 수 없습니다.'
      };
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
    
    return {
      allowed: true,
      remaining: user.usageLimit - user.usageCount
    };
  } catch (error) {
    console.error('[checkUsageLimit] 오류:', error);
    return {
      allowed: false,
      message: '사용자 정보를 확인할 수 없습니다.'
    };
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
    
    console.log(`📊 사용 횟수 증가: ${username} (${user.usageCount}/${user.usageLimit || '무제한'})`);
    
    return true;
  } catch (error) {
    console.error('[incrementUsage] 오류:', error);
    return false;
  }
}

export default router;

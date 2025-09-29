import fs from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'config', 'users.json');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      const dir = path.dirname(USERS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const defaultUsers = {
        admin: {
          id: 'admin',
          password: 'Upnexx!!',
          role: 'admin',
          name: '관리자',
          usageLimit: null,
          usageCount: 0,
          lastResetDate: new Date().toISOString().split('T')[0]
        },
        guest: {
          id: 'guest',
          password: 'guest1234',
          role: 'user',
          name: '게스트',
          usageLimit: 3,
          usageCount: 0,
          lastResetDate: new Date().toISOString().split('T')[0]
        }
      };
      
      fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
      return defaultUsers;
    }
    
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[users] 로드 오류:', error);
    return {};
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-username');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const users = loadUsers();
  
  const currentUsername = req.headers['x-username'] || req.body?.currentUsername || req.query?.currentUsername;
  const currentUser = users[currentUsername];
  
  if (req.method === 'GET') {
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
    
    return res.json({
      success: true,
      users: userList
    });
  }
  
  if (req.method === 'POST') {
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
      usageLimit: usageLimit !== undefined ? parseInt(usageLimit) : null,
      usageCount: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
    };
    
    saveUsers(users);
    
    console.log(`✅ 신규 사용자 추가: ${username}`);
    
    return res.json({
      success: true,
      message: '사용자가 추가되었습니다.',
      user: { username, ...users[username] }
    });
  }
  
  if (req.method === 'PUT') {
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
    
    return res.json({
      success: true,
      message: '사용자 정보가 수정되었습니다.',
      user: { username, ...users[username] }
    });
  }
  
  if (req.method === 'DELETE') {
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
    
    return res.json({
      success: true,
      message: '사용자가 삭제되었습니다.'
    });
  }
  
  return res.status(405).json({
    success: false,
    message: 'Method not allowed'
  });
}

export function checkUsageLimit(username) {
  const users = loadUsers();
  const user = users[username];
  
  if (!user) {
    return {
      allowed: false,
      message: '사용자를 찾을 수 없습니다.'
    };
  }
  
  checkAndResetDaily(user);
  saveUsers(users);
  
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
}

export function incrementUsage(username) {
  const users = loadUsers();
  const user = users[username];
  
  if (!user) return false;
  
  checkAndResetDaily(user);
  
  user.usageCount += 1;
  saveUsers(users);
  
  console.log(`📊 사용 횟수 증가: ${username} (${user.usageCount}/${user.usageLimit || '무제한'})`);
  
  return true;
}

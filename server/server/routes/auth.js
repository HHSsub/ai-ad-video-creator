import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// 하드코딩된 사용자 정보
const users = {
  admin: { 
    id: 'admin', 
    password: 'Upnexx!!', 
    role: 'admin',
    name: '관리자'
  },
  guest: { 
    id: 'guest', 
    password: 'guest1234', 
    role: 'user',
    name: '게스트'
  }
};

const JWT_SECRET = process.env.JWT_SECRET || 'ai-ad-video-creator-secret-2024';

// 로그인 API
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log(`[AUTH] 로그인 시도: ${username}`);
  
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: '아이디와 비밀번호를 입력해주세요.' 
    });
  }

  const user = users[username];
  
  if (!user || user.password !== password) {
    return res.status(401).json({ 
      success: false, 
      message: '아이디 또는 비밀번호가 올바르지 않습니다.' 
    });
  }

  // JWT 토큰 생성
  const token = jwt.sign(
    { 
      id: user.id, 
      role: user.role,
      name: user.name
    }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );

  console.log(`[AUTH] 로그인 성공: ${username} (${user.role})`);
  
  res.json({
    success: true,
    message: '로그인 성공',
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role
    }
  });
});

// 토큰 검증 미들웨어
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: '인증 토큰이 필요합니다.' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        success: false, 
        message: '유효하지 않은 토큰입니다.' 
      });
    }
    
    req.user = user;
    next();
  });
};

// 관리자 권한 확인 미들웨어
export const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: '관리자 권한이 필요합니다.' 
    });
  }
  next();
};

// 사용자 정보 확인 API
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

export default router;

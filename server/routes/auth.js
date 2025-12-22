import express from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';

const router = express.Router();
const USERS_FILE = path.join(process.cwd(), 'config', 'users.json');

console.log('[auth] 라우터 초기화, 사용자 파일:', USERS_FILE);

/**
 * POST /api/auth/login
 * 
 * 로그인 인증 엔드포인트
 * - 평문 비밀번호와 bcrypt 해시 모두 지원 (자동 감지)
 * - 평문 비밀번호로 로그인 성공 시 자동으로 해시로 변환 (점진적 마이그레이션)
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log('[auth/login] 로그인 시도:', username);

    // 1. 입력 검증
    if (!username || !password) {
      console.log('[auth/login] ❌ 입력 누락');
      return res.status(400).json({
        success: false,
        message: '아이디와 비밀번호를 입력해주세요.'
      });
    }

    // 2. 사용자 파일 존재 확인
    if (!fs.existsSync(USERS_FILE)) {
      console.error('[auth/login] ❌ 사용자 파일 없음:', USERS_FILE);
      return res.status(500).json({
        success: false,
        message: '사용자 데이터를 찾을 수 없습니다.'
      });
    }

    // 3. 사용자 파일 로드
    const usersData = fs.readFileSync(USERS_FILE, 'utf8');
    const users = JSON.parse(usersData);
    const user = users[username];

    // 4. 사용자 존재 확인
    if (!user) {
      console.log('[auth/login] ❌ 사용자 없음:', username);
      return res.status(401).json({
        success: false,
        message: '아이디 또는 비밀번호가 올바르지 않습니다.'
      });
    }

    // 5. 비밀번호 검증 (해시 vs 평문 자동 감지)
    let isPasswordValid = false;
    let needsMigration = false;

    if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
      // bcrypt 해시 형식 감지
      console.log('[auth/login] 🔐 bcrypt 해시 검증:', username);
      isPasswordValid = await bcrypt.compare(password, user.password);
    } else {
      // 평문 비밀번호 (레거시)
      console.log('[auth/login] ⚠️  평문 비밀번호 검증:', username);
      isPasswordValid = (user.password === password);
      needsMigration = isPasswordValid; // 로그인 성공 시 마이그레이션 필요
    }

    // 6. 비밀번호 불일치
    if (!isPasswordValid) {
      console.log('[auth/login] ❌ 비밀번호 불일치:', username);
      return res.status(401).json({
        success: false,
        message: '아이디 또는 비밀번호가 올바르지 않습니다.'
      });
    }

    // 7. 🔥 자동 마이그레이션: 평문 비밀번호를 해시로 변환
    if (needsMigration) {
      try {
        console.log('[auth/login] 🔄 자동 마이그레이션 시작:', username);
        const hashedPassword = await bcrypt.hash(password, 10);
        users[username].password = hashedPassword;

        // 원자적 쓰기: 임시 파일에 쓰고 rename
        const tempFile = USERS_FILE + '.tmp';
        fs.writeFileSync(tempFile, JSON.stringify(users, null, 2), 'utf8');
        fs.renameSync(tempFile, USERS_FILE);

        console.log('[auth/login] ✅ 자동 마이그레이션 완료:', username);
      } catch (migrationError) {
        // 마이그레이션 실패해도 로그인은 성공 처리 (중요!)
        console.error('[auth/login] ⚠️  마이그레이션 실패 (로그인은 성공):', migrationError);
      }
    }

    // 8. 로그인 성공
    console.log('[auth/login] ✅ 로그인 성공:', username, '(role:', user.role + ')');

    // 비밀번호 제외한 사용자 정보 반환
    const { password: _, ...userInfo } = user;

    res.json({
      success: true,
      user: {
        username: user.id,
        name: user.name,
        role: user.role,
        usageLimit: user.usageLimit,
        usageCount: user.usageCount,
        totalUsageCount: user.totalUsageCount
      }
    });

  } catch (error) {
    console.error('[auth/login] ❌ 예외 발생:', error);
    res.status(500).json({
      success: false,
      message: '로그인 처리 중 오류가 발생했습니다.'
    });
  }
});

export default router;

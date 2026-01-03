# EC2 배포 가이드: 인증 시스템 업데이트

## 🚀 배포 절차 (데이터 손실 없이 안전하게)

### 1단계: 로컬에서 Git Push

```bash
# 로컬 환경 (Windows)
cd c:\Users\User\.gemini\antigravity\scratch\ai-ad-video-creator

# 변경사항 확인
git status

# 변경된 파일들:
# - server/routes/auth.js (신규)
# - api/users.js (수정)
# - package.json (수정)

# 커밋 및 푸시
git add server/routes/auth.js api/users.js package.json
git commit -m "feat: 로그인 인증 시스템 구현 및 bcrypt 비밀번호 해싱 추가

- server/routes/auth.js 생성: 로그인 엔드포인트 구현
- 평문 비밀번호 자동 마이그레이션 지원
- api/users.js: 사용자 추가/수정 시 bcrypt 해싱 적용
- package.json: bcrypt 의존성 추가"

git push origin main
```

### 2단계: EC2 서버 접속

```bash
# SSH 접속
ssh ec2-user@13.225.134.86
# 또는
ssh ec2-user@your-ec2-ip
```

### 3단계: 사용자 데이터 백업 (필수!)

```bash
# 프로젝트 디렉토리로 이동
cd /home/ec2-user/projects/ai-ad-video-creator

# 🔥 중요: 사용자 데이터 백업
sudo cp config/users.json config/users.json.backup.$(date +%Y%m%d_%H%M%S)

# 백업 확인
ls -lh config/users.json*
```

**예상 출력:**
```
-rw-r--r-- 1 ec2-user ec2-user 1.2K Dec 22 17:40 users.json
-rw-r--r-- 1 ec2-user ec2-user 1.2K Dec 22 17:40 users.json.backup.20251222_174000
```

### 4단계: Git Pull

```bash
# 최신 코드 가져오기
git pull origin main

# 🔥 중요: 프론트엔드 빌드 (화면 변경사항 적용을 위해 필수!)
npm run build
```

**예상 출력:**
```
remote: Counting objects: 5, done.
remote: Compressing objects: 100% (5/5), done.
remote: Total 5 (delta 3), reused 0 (delta 0)
Unpacking objects: 100% (5/5), done.
From github.com:your-repo/ai-ad-video-creator
   abc1234..def5678  main -> origin/main
Updating abc1234..def5678
Fast-forward
 api/users.js           | 15 ++++++++++-----
 package.json           |  1 +
 server/routes/auth.js  | 125 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 136 insertions(+), 5 deletions(-)
 create mode 100644 server/routes/auth.js
```

### 5단계: bcrypt 패키지 설치

```bash
# npm install 실행
npm install

# bcrypt 설치 확인
npm list bcrypt
```

**예상 출력:**
```
ai-ad-video-creator@1.0.0 /home/ec2-user/projects/ai-ad-video-creator
└── bcrypt@5.1.1
```

**⚠️ bcrypt 설치 오류 발생 시:**

bcrypt는 네이티브 모듈이므로 컴파일이 필요합니다. 오류 발생 시:

```bash
# Python과 build tools 설치 (Amazon Linux 2)
sudo yum install -y python3 gcc-c++ make

# 또는 Ubuntu/Debian
sudo apt-get install -y python3 build-essential

# 다시 설치
npm install bcrypt
```

### 6단계: PM2 재시작

```bash
# PM2로 실행 중인 프로세스 확인
pm2 list

# 애플리케이션 재시작
pm2 restart all

# 또는 특정 앱만 재시작
pm2 restart ai-ad-video-creator
```

**예상 출력:**
```
[PM2] Applying action restartProcessId on app [all](ids: [ 0 ])
[PM2] [ai-ad-video-creator](0) ✓
┌─────┬──────────────────────┬─────────┬─────────┬──────────┬────────┐
│ id  │ name                 │ mode    │ status  │ cpu      │ memory │
├─────┼──────────────────────┼─────────┼─────────┼──────────┼────────┤
│ 0   │ ai-ad-video-creator  │ fork    │ online  │ 0%       │ 45.2mb │
└─────┴──────────────────────┴─────────┴─────────┴──────────┴────────┘
```

### 7단계: 로그 확인

```bash
# 실시간 로그 확인
pm2 logs --lines 50

# 또는 특정 앱 로그만
pm2 logs ai-ad-video-creator --lines 50
```

**확인할 로그:**
```
[auth] 라우터 초기화, 사용자 파일: /home/ec2-user/projects/ai-ad-video-creator/config/users.json
[server] ✅ 서버 시작: http://localhost:3000
```

**오류가 있다면:**
```bash
# 로그 확인 (생략 가능)
pm2 logs --err

# ⚠️ 만약 화면이 안 바뀌면? (캐시 문제)
# 1. 브라우저 강력 새로고침 (Ctrl + F5)
# 2. CloudFront Invalidation (무효화) 실행
#    - 경로: /*

```

### 8단계: 로그인 테스트

#### 테스트 1: 기존 관리자 계정 로그인

```bash
# curl로 직접 테스트
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YOUR_ADMIN_PASSWORD"}'
```

**예상 응답 (성공):**
```json
{
  "success": true,
  "user": {
    "username": "admin",
    "name": "관리자",
    "role": "admin",
    "usageLimit": null,
    "usageCount": 0,
    "totalUsageCount": 0
  }
}
```

**로그 확인:**
```
[auth/login] 로그인 시도: admin
[auth/login] ⚠️  평문 비밀번호 검증: admin
[auth/login] 🔄 자동 마이그레이션 시작: admin
[auth/login] ✅ 자동 마이그레이션 완료: admin
[auth/login] ✅ 로그인 성공: admin (role: admin)
```

#### 테스트 2: 자동 마이그레이션 확인

```bash
# users.json 파일 확인
cat config/users.json | grep -A 5 '"admin"'
```

**예상 결과:**
```json
"admin": {
  "id": "admin",
  "password": "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNO",
  "role": "admin",
  ...
}
```

비밀번호가 `$2b$10$`으로 시작하면 해싱 완료!

#### 테스트 3: 해시된 비밀번호로 재로그인

```bash
# 같은 명령어로 다시 로그인
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YOUR_ADMIN_PASSWORD"}'
```

**로그 확인:**
```
[auth/login] 로그인 시도: admin
[auth/login] 🔐 bcrypt 해시 검증: admin
[auth/login] ✅ 로그인 성공: admin (role: admin)
```

이제 "평문 비밀번호 검증" 대신 "bcrypt 해시 검증"이 나타남!

### 9단계: 브라우저에서 테스트

```bash
# 브라우저에서 접속
# http://13.225.134.86/nexxii/ 또는 http://your-domain.com/nexxii/
```

1. 관리자 계정으로 로그인
2. 관리자 패널 → 사용자 관리
3. 신규 사용자 추가 (예: testuser / test1234)
4. 로그아웃
5. 신규 사용자로 로그인
6. ✅ 성공 확인

### 10단계: 사용자 데이터 확인

```bash
# 모든 사용자의 비밀번호가 해시로 저장되었는지 확인
cat config/users.json | jq '.[] | {id: .id, password: .password[0:20]}'
```

**예상 출력:**
```json
{
  "id": "admin",
  "password": "$2b$10$abcdefghij"
}
{
  "id": "testuser",
  "password": "$2b$10$klmnopqrst"
}
```

---

## 🔄 자동 마이그레이션 동작 방식

### 점진적 마이그레이션
- **기존 사용자**: 로그인 시 자동으로 평문 → 해시 변환
- **신규 사용자**: 처음부터 해시로 저장
- **데이터 손실**: 없음 (로그인 성공 시에만 변환)

### 마이그레이션 상태 확인

```bash
# 평문 비밀번호가 남아있는 사용자 찾기
cat config/users.json | jq 'to_entries[] | select(.value.password | startswith("$2b$") | not) | .key'
```

**출력이 없으면**: 모든 사용자 마이그레이션 완료!

---

## 🚨 문제 해결

### 문제 1: bcrypt 설치 실패

**증상:**
```
npm ERR! Failed at the bcrypt@5.1.1 install script
```

**해결:**
```bash
# Python과 컴파일 도구 설치
sudo yum install -y python3 gcc-c++ make

# node-gyp 재빌드
npm rebuild bcrypt

# 또는 전체 재설치
rm -rf node_modules package-lock.json
npm install
```

### 문제 2: 로그인 실패 (401 에러)

**증상:**
```json
{"success":false,"message":"아이디 또는 비밀번호가 올바르지 않습니다."}
```

**확인 사항:**
```bash
# 1. 서버 로그 확인
pm2 logs --lines 100

# 2. users.json 파일 권한 확인
ls -l config/users.json

# 3. 파일 내용 확인
cat config/users.json | jq .
```

**해결:**
```bash
# 백업에서 복구 (필요 시)
cp config/users.json.backup.YYYYMMDD_HHMMSS config/users.json
pm2 restart all
```

### 문제 3: 서버가 시작되지 않음

**증상:**
```
[PM2] Process ai-ad-video-creator errored
```

**확인:**
```bash
# 에러 로그 확인
pm2 logs --err

# 수동으로 서버 실행 (디버깅)
cd /home/ec2-user/projects/ai-ad-video-creator
node server/index.js
```

**일반적인 원인:**
- `server/routes/auth.js` 파일 누락
- bcrypt 모듈 설치 안됨
- users.json 파일 손상

### 문제 4: 자동 마이그레이션이 작동하지 않음

**확인:**
```bash
# auth.js 파일 존재 확인
ls -l server/routes/auth.js

# 로그 확인
pm2 logs | grep "자동 마이그레이션"
```

**수동 마이그레이션 (필요 시):**
```bash
# Node.js REPL에서 수동 변환
node
```

```javascript
const bcrypt = require('bcrypt');
const fs = require('fs');

const users = JSON.parse(fs.readFileSync('config/users.json', 'utf8'));

for (const username in users) {
  const user = users[username];
  if (!user.password.startsWith('$2b$')) {
    const hashed = bcrypt.hashSync(user.password, 10);
    users[username].password = hashed;
    console.log('Migrated:', username);
  }
}

fs.writeFileSync('config/users.json', JSON.stringify(users, null, 2));
console.log('Done!');
```

---

## ✅ 배포 완료 체크리스트

- [ ] 로컬에서 git push 완료
- [ ] EC2에서 users.json 백업 완료
- [ ] git pull 완료
- [ ] npm install 완료 (bcrypt 설치 확인)
- [ ] PM2 재시작 완료
- [ ] 서버 로그 정상 확인
- [ ] 관리자 로그인 테스트 성공
- [ ] 자동 마이그레이션 로그 확인
- [ ] 신규 사용자 추가 테스트 성공
- [ ] 신규 사용자 로그인 테스트 성공
- [ ] users.json에 해시 저장 확인

---

## 📊 배포 후 모니터링

### 로그 모니터링
```bash
# 실시간 로그 확인
pm2 logs --lines 0

# 인증 관련 로그만 필터링
pm2 logs | grep "\[auth"
```

### 성능 모니터링
```bash
# PM2 모니터링
pm2 monit

# 메모리 사용량 확인
pm2 status
```

### 사용자 데이터 모니터링
```bash
# 마이그레이션 진행률 확인
cat config/users.json | jq '[.[] | select(.password | startswith("$2b$"))] | length'
cat config/users.json | jq '. | length'
```

---

## 🔙 롤백 절차 (문제 발생 시)

```bash
# 1. 백업 복구
cp config/users.json.backup.YYYYMMDD_HHMMSS config/users.json

# 2. 이전 커밋으로 되돌리기
git log --oneline -5
git reset --hard PREVIOUS_COMMIT_HASH

# 3. 의존성 재설치
npm install

# 4. 서버 재시작
pm2 restart all

# 5. 확인
curl http://localhost:3000/health
```

---

**배포 완료 후 이 가이드는 보관하세요!**

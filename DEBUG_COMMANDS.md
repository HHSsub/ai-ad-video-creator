# 디버깅 명령어

## 1. 사용자 목록 확인
```bash
cat config/users.json
```

## 2. 프로젝트 멤버 확인
```bash
cat config/project-members.json
```

## 3. 프로젝트 목록 확인
```bash
cat config/projects.json
```

## 4. 서버 로그 실시간 확인
```bash
pm2 logs api-server --lines 50
```

## 5. API 테스트 (멤버 초대)
```bash
# 프로젝트 ID와 사용자명을 실제 값으로 변경
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/members \
  -H "Content-Type: application/json" \
  -H "x-username: admin" \
  -d '{"username": "test1", "role": "viewer"}'
```

## 6. 라우트 등록 확인
```bash
grep -n "app.use" server/index.js | grep -E "(projects|auth)"
```

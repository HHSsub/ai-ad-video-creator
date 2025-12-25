# 🚨 절대 변경 금지 설정# 🚨 CRITICAL_CONFIG.md

> **절대 위반 금지 규칙 - 이 규칙을 어기면 시스템 전체가 망가집니다**

---

## ⚠️ 최우선 절대 규칙 (ABSOLUTE RULES)

### 🔴 규칙 1: API/엔진 관련 수정 절대 금지

**절대로 추측, 추정, 가정으로 API 호출 코드를 작성하거나 수정하지 말 것**

- ✅ **허용**: Freepik 공식 문서(https://docs.freepik.com)에 명시된 정확한 엔드포인트, 파라미터, 응답 형식 사용
- ❌ **금지**: "아마도 이렇게 하면 될 것 같다", "보통 이런 식으로 한다" 등의 추측성 코드 작성
- ❌ **금지**: 함수명, 파라미터명, API 경로를 임의로 변경
- ❌ **금지**: 공식 문서 확인 없이 엔진별 파라미터 수정 (seedream, kling, mystic, minimax 등 각 엔진마다 파라미터가 다름)

**위반 시 조치**: 즉시 작업 중단, 공식 문서 확인 후 사용자에게 질문

### 🔴 규칙 2: Import 문 누락 절대 금지

**함수를 사용하기 전 반드시 import 확인**

- ✅ **필수 절차**:
  1. 함수 사용 전 해당 파일에서 `grep` 또는 `view_file`로 import 문 확인
  2. import 되지 않은 함수 발견 시 즉시 추가
  3. 파일 수정 후 import 문 재확인

- ❌ **금지**: "이미 import 되어 있을 것이다" 라는 가정
- ❌ **금지**: import 문 확인 없이 함수 호출 코드 작성

**위반 시 조치**: 모든 코드 수정 전 import 문 전수 조사 필수

---

## 📌 목차

1. [Import 경로 규칙](#import-경로-규칙)
2. [API 경로 규칙 (절대 누락 금지)](#api-경로-규칙-절대-누락-금지)
3. [API/엔진 수정 금지 규칙](#apiengine-modification-rules)

# 🚨 절대 변경 금지 설정 (CRITICAL CONFIG)

## ⚠️ 이 파일의 설정들은 절대 변경하지 마세요!

---

## 1. vite.config.js

### 필수 설정 (절대 삭제 금지)

```javascript
export default defineConfig({
  plugins: [react()],
  base: '/nexxii/',  // ⚠️ 절대 삭제 금지! nginx 경로와 일치해야 함
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      host: '52.87.89.0',  // ⚠️ 현재 EC2 Public IP (변경 시 업데이트 필요)
      port: 5173,
      protocol: 'ws'
    },
    // ... 나머지 설정
  }
});
```

**왜 필요한가?**
- `base: '/nexxii/'`: nginx에서 `/nexxii/` 경로로 서빙하므로 필수
- `hmr.host`: HMR(Hot Module Replacement) 웹소켓 연결을 위한 EC2 Public IP

**에러 증상**:
- `base` 누락 시: `Failed to load module script: Expected JavaScript but got HTML` (MIME type 에러)
- `hmr.host` 잘못된 IP: 개발 서버 HMR 작동 안 함

---

## 2. Import 경로 규칙

### ✅ 올바른 경로

```javascript
// api/ 폴더에서 src/utils 접근
import { safeCallFreepik } from '../src/utils/apiHelpers.js';
import { getTextToImageUrl } from '../src/utils/engineConfigLoader.js';

// api/ 폴더에서 server/utils 접근
import { uploadImageToS3 } from '../server/utils/s3-uploader.js';
```

### ❌ 잘못된 경로

```javascript
// ❌ utils는 존재하지 않음 (src/utils 또는 server/utils만 존재)
import { getTextToImageUrl } from '../utils/engineConfigLoader.js';
```

**프로젝트 구조**:
```
ai-ad-video-creator/
├── api/                    # API 라우트
├── server/
│   └── utils/             # 서버 전용 유틸 (s3-uploader.js 등)
├── src/
│   └── utils/             # 클라이언트/공용 유틸 (apiHelpers.js 등)
```

**에러 증상**:
- `Cannot find module '/home/ec2-user/projects/ai-ad-video-creator/utils/...'`
- 서버 크래시 (502 Bad Gateway)

---

## 3. API 경로 규칙 (절대 누락 금지)

### ✅ 올바른 API 경로

```javascript
// ✅ 프론트엔드에서 백엔드 API 호출 시 반드시 /nexxii/ prefix 포함
fetch(`${API_BASE}/nexxii/api/projects/${projectId}/members`, { ... });
fetch(`${API_BASE}/nexxii/api/storyboard-init`, { ... });
fetch(`${API_BASE}/nexxii/api/apply-bgm`, { ... });
```

### ❌ 잘못된 API 경로

```javascript
// ❌ /nexxii/ prefix 누락 - CloudFront에서 HTML 에러 응답
fetch(`${API_BASE}/api/projects/${projectId}/members`, { ... });
```

**왜 필요한가?**
- nginx에서 `/nexxii/` 경로로 라우팅 설정됨
- CloudFront도 `/nexxii/` 경로 기준으로 캐싱
- prefix 누락 시 404 또는 HTML 에러 응답

**에러 증상**:
- `Unexpected token '<'` (HTML 응답을 JSON으로 파싱 시도)
- `<!DOCTYPE html>` 에러 메시지
- CloudFront HTML 에러 페이지 반환

**검증 방법**:
```bash
# 프론트엔드 코드에서 API 호출 검색
grep -r "fetch.*api/" src/
# 모든 결과에 /nexxii/ prefix 있는지 확인
```

---

## 4. EC2 Public IP 변경 시 체크리스트

EC2 인스턴스를 재시작하거나 IP가 변경되면:

1. **vite.config.js** 업데이트:
   ```javascript
   hmr: {
     host: '새로운.IP.주소',  // 여기 업데이트
   }
   ```

2. **재빌드**:
   ```bash
   npm run build
   pm2 restart all
   ```

---

## 4. nginx 설정 (참고용)

```nginx
location /nexxii/ {
    alias /home/ec2-user/projects/ai-ad-video-creator/dist/;
    try_files $uri $uri/ /nexxii/index.html;
    
    types {
        application/javascript js;
        text/css css;
        text/html html;
    }
}

location /nexxii/api/ {
    proxy_pass http://localhost:3000/api/;
    # ... 프록시 설정
}
```

**중요**: `location /nexxii/`와 `base: '/nexxii/'`는 반드시 일치해야 함!

---

## 5. 빠른 문제 해결

### MIME type 에러 발생 시
```bash
# 1. vite.config.js에 base: '/nexxii/' 있는지 확인
cat vite.config.js | grep "base:"

# 2. 재빌드
npm run build

# 3. nginx 재시작
sudo systemctl reload nginx
```

### 502 Bad Gateway 발생 시
```bash
# 1. pm2 상태 확인
pm2 status

# 2. 에러 로그 확인
pm2 logs api-server --lines 50

# 3. import 경로 에러 확인 (utils vs src/utils)
# 4. pm2 재시작
pm2 restart all
```

---

## 📝 변경 이력

- **2025-12-25**: 초기 작성
  - EC2 IP: 52.87.89.0
  - base: '/nexxii/'
  - import 경로 규칙 정립

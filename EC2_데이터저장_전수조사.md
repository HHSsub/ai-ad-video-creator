# EC2 파일시스템 전수조사 결과

## 📊 데이터 저장 카테고리 (10개)

### 1. 계정 정보 (users.json)
**파일**: `config/users.json`  
**저장 시점**: 회원가입, 비밀번호 변경  
**저장 코드**: `api/users.js`, `server/routes/auth.js`, `api/storyboard-init.js`

**데이터 구조**:
```json
{
  "username": {
    "password": "bcrypt_hash",
    "createdAt": "ISO_timestamp"
  }
}
```

**S3 마이그레이션**: ❌ **불필요** (민감 정보, DB로 이전 권장)

---

### 2. 프로젝트 정보 (projects.json)
**파일**: `config/projects.json`  
**저장 시점**: 프로젝트 생성, 수정, 스토리보드 저장  
**저장 코드**: `server/routes/projects.js`, `api/projects/index.js`

**데이터 구조**:
```json
{
  "projects": [
    {
      "id": "project_1763355992778",
      "name": "프로젝트명",
      "createdBy": "username",
      "mode": "auto|manual",
      "formData": { ... },
      "storyboard": {
        "styles": [
          {
            "images": [
              {
                "imageUrl": "https://cdn-magnific.freepik.com/...",
                "videoUrl": "https://cdn-magnific.freepik.com/..."
              }
            ]
          }
        ]
      }
    }
  ]
}
```

**S3 마이그레이션**: ⚠️ **부분 필요** (imageUrl, videoUrl만 S3로 변경)

---

### 3. 엔진 설정 (engines.json)
**파일**: `config/engines.json`  
**저장 시점**: 엔진 변경 (textToImage, imageToVideo)  
**저장 코드**: `api/engines-update.js`, `server/index.js`

**데이터 구조**:
```json
{
  "currentEngine": {
    "textToImage": {
      "provider": "freepik",
      "model": "seedream-v4",
      "endpoint": "...",
      "updatedAt": "ISO_timestamp",
      "updatedBy": "username"
    }
  },
  "engineHistory": [
    {
      "timestamp": "ISO_timestamp",
      "changeType": "update",
      "engineType": "textToImage",
      "previousEngine": "seedream-v3",
      "newEngine": "seedream-v4",
      "updatedBy": "username"
    }
  ]
}
```

**S3 마이그레이션**: ❌ **불필요** (설정 파일, 로컬 유지)

---

### 4. 관리자 설정 (runtime-admin-settings.json)
**파일**: `config/runtime-admin-settings.json`  
**저장 시점**: 관리자 UI 설정 변경  
**저장 코드**: `api/admin-config.js`

**데이터 구조**:
```json
{
  "imageUpload": {
    "label": "이미지 업로드",
    "descriptions": {
      "product": "제품 이미지를 올려주세요",
      "service": "브랜드 로고를 올려주세요"
    }
  }
}
```

**S3 마이그레이션**: ❌ **불필요** (설정 파일, 로컬 유지)

---

### 5. 필드 설정 (runtime-field-config.json)
**파일**: `config/runtime-field-config.json`  
**저장 시점**: 필드 표시/숨김 설정 변경  
**저장 코드**: `api/admin-config.js`, `api/admin-field-config.js`

**데이터 구조**:
```json
{
  "fieldName": {
    "visible": true,
    "required": false
  }
}
```

**S3 마이그레이션**: ❌ **불필요** (설정 파일, 로컬 유지)

---

### 6. 프롬프트 파일 (현재 버전)
**파일**: `prompts/{engineId}_auto_product.txt`, `prompts/{engineId}_auto_service.txt`, `prompts/{engineId}_manual.txt`  
**저장 시점**: 프롬프트 업데이트  
**저장 코드**: `api/prompts-update.js`

**데이터 형식**: Plain text (프롬프트 내용)

**S3 마이그레이션**: ❌ **불필요** (설정 파일, 로컬 유지)

---

### 7. 프롬프트 히스토리 (백업 버전)
**파일**: `prompts/versions/{mode}/{videoPurpose}/{promptKey}_{timestamp}.txt`  
**저장 시점**: 프롬프트 업데이트 시 기존 버전 백업  
**저장 코드**: `api/prompts-update.js`

**예시 경로**:
```
prompts/versions/auto/product/seedream-v4_auto_product_1734567890123.txt
prompts/versions/manual/null/seedream-v4_manual_1734567890456.txt
```

**S3 마이그레이션**: ⚠️ **선택** (히스토리 보관용, S3 Glacier로 이전 고려)

---

### 8. Gemini 응답 (gemini-responses/)
**파일**: `gemini-responses/{promptKey}_{timestamp}.json`, `gemini-responses/{promptKey}_test_{timestamp}.json`  
**저장 시점**: Gemini API 호출 후 응답 저장  
**저장 코드**: `server/index.js` (Line 388, 592), `api/storyboard-init.js` (Line 250)

**데이터 구조**:
```json
{
  "promptKey": "seedream-v4_auto_product",
  "step": 1,
  "formData": { ... },
  "response": "Gemini 응답 텍스트",
  "timestamp": "ISO_timestamp",
  "savedAt": "ISO_timestamp",
  "isTest": false
}
```

**S3 마이그레이션**: ⚠️ **선택** (로그성 데이터, S3 Glacier로 이전 고려)

---

### 9. 최종 합성 영상 (public/videos/compiled/)
**파일**: `public/videos/compiled/compiled_{timestamp}_{hash}.mp4`  
**저장 시점**: 영상 합성 완료  
**저장 코드**: `api/compile-videos.js` (Line 537-547)

**URL 형식**: `/videos/compiled/compiled_1763966375486_ae0ae663.mp4`

**S3 마이그레이션**: ✅ **필수** (미디어 파일, S3 + CloudFront 필수)

---

### 10. BGM 합성 임시 파일 (tmp/bgm/)
**파일**: `tmp/bgm/merged-{timestamp}-{uuid}.mp4`  
**저장 시점**: BGM 합성 중  
**저장 코드**: `api/apply-bgm.js`

**URL 형식**: `/tmp/bgm/merged-1758268423425-0dcf34a5-18f0-4c31-8253-e425e37ae851.mp4`

**S3 마이그레이션**: ❌ **불필요** (임시 파일, 자동 삭제 대상)

---

## 📁 EC2 디렉토리 구조 (실제)

```
/home/ec2-user/projects/ai-ad-video-creator/
├── config/
│   ├── users.json                      (계정 정보)
│   ├── projects.json                   (프로젝트 정보) ⚠️
│   ├── project-members.json            (프로젝트 멤버)
│   ├── engines.json                    (엔진 설정)
│   ├── runtime-admin-settings.json     (관리자 설정)
│   └── runtime-field-config.json       (필드 설정)
│
├── prompts/
│   ├── {engineId}_auto_product.txt     (프롬프트)
│   ├── {engineId}_auto_service.txt
│   ├── {engineId}_manual.txt
│   └── versions/                       (프롬프트 히스토리) ⚠️
│       ├── auto/
│       │   ├── product/
│       │   └── service/
│       └── manual/
│
├── gemini-responses/                   (Gemini 응답) ⚠️
│   ├── {promptKey}_{timestamp}.json
│   └── {promptKey}_test_{timestamp}.json
│
├── public/
│   └── videos/
│       └── compiled/                   (최종 영상) ✅
│           └── compiled_{timestamp}_{hash}.mp4
│
└── tmp/
    ├── compiled/                       (임시 합성 영상) ❌
    └── bgm/                            (BGM 임시 파일) ❌
```

---

## 🎯 S3 마이그레이션 우선순위

### 🔴 최우선 (필수)
1. **최종 합성 영상** (`public/videos/compiled/*.mp4`)
   - 현재: EC2 로컬 저장
   - 변경: S3 `projects/{projectId}/videos/compiled_{timestamp}.mp4`
   - 이유: 영구 보관 필요, CloudFront CDN 필수

2. **프로젝트 imageUrl/videoUrl** (`projects.json` 내부)
   - 현재: Freepik CDN URL (token 만료)
   - 변경: S3 `projects/{projectId}/images/*.jpg`, `videos/*.mp4`
   - 이유: URL 만료 방지, 영구 접근 보장

### 🟡 선택 (고려)
3. **프롬프트 히스토리** (`prompts/versions/`)
   - 현재: EC2 로컬 저장
   - 변경: S3 Glacier (저비용 아카이브)
   - 이유: 장기 보관, 비용 절감

4. **Gemini 응답** (`gemini-responses/`)
   - 현재: EC2 로컬 저장
   - 변경: S3 Glacier (저비용 아카이브)
   - 이유: 로그성 데이터, 분석용

### ⚫ 불필요 (로컬 유지)
5. **설정 파일** (`config/*.json`)
   - 이유: 빈번한 읽기/쓰기, 로컬이 빠름

6. **프롬프트 현재 버전** (`prompts/*.txt`)
   - 이유: 빈번한 읽기, 로컬이 빠름

7. **임시 파일** (`tmp/`)
   - 이유: 자동 삭제 대상, 영구 보관 불필요

---

## 📊 저장 패턴 분석

### 파일 쓰기 패턴 (24개 writeFileSync 호출)

| 파일 | 호출 횟수 | 빈도 | S3 필요성 |
|------|----------|------|-----------|
| `config/users.json` | 3 | 낮음 (회원가입) | ❌ |
| `config/projects.json` | 2 | 중간 (프로젝트 수정) | ⚠️ |
| `config/engines.json` | 2 | 낮음 (엔진 변경) | ❌ |
| `config/runtime-*.json` | 3 | 낮음 (설정 변경) | ❌ |
| `prompts/*.txt` | 2 | 낮음 (프롬프트 업데이트) | ❌ |
| `gemini-responses/*.json` | 3 | 높음 (API 호출마다) | ⚠️ |
| `public/videos/compiled/*.mp4` | 1 | 중간 (영상 생성) | ✅ |
| `tmp/bgm/*.mp4` | 1 | 중간 (BGM 합성) | ❌ |

---

## 🔍 SessionStore 분석

**위치**: `src/utils/sessionStore.js`  
**저장 방식**: **메모리 전용** (Map 객체)  
**파일 저장**: ❌ **없음**

**데이터 구조**:
```javascript
{
  sessionId: {
    id: sessionId,
    status: 'pending|processing|completed|error',
    progress: { phase, currentStep, percentage },
    result: { ... },
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}
```

**S3 마이그레이션**: ❌ **불필요** (휘발성 데이터, 메모리 유지)

---

## 🚀 다음 단계

1. **최종 영상 S3 업로드** (`compile-videos.js` 수정)
2. **Freepik URL → S3 URL** (`storyboard-render-image.js` 수정)
3. **projects.json URL 업데이트** (기존 프로젝트 마이그레이션)
4. **선택적 아카이브** (프롬프트 히스토리, Gemini 응답)

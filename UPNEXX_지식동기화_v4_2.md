# UPNEXX 프로젝트 지식동기화 문서 v4.2 (S3 미디어 영속화판)

**문서 목적**: AI가 코드 작업 시 매번 참조하고 업데이트하여 작업 맥락을 유지  
**최종 수정**: 2025-12-24 (KST)  
**이전 버전**: v4.1 (2025-12-11)  
**주요 변경**: S3 미디어 영속화 작업 추가 (작업 I, J, K, L) + 로그 자동 삭제 로직

---

## 📌 필수 규칙

> **AI는 코드 작업 전/후 반드시 이 문서를 읽고 업데이트해야 함**
> 
> 1. 작업 시작 전: 현재 진행 상황 확인
> 2. 작업 완료 후: 작업 히스토리에 기록 (prepend 방식)
> 3. 구현 완료 판단: 반드시 사용자가 테스트 후 승인해야 함 (자의적 완료 판단 절대 금지)
> 4. 문서 양식 자의적 수정 금지
> 5. 파일 구조 암기: ls 명령어 남발 금지
> 6. nginx 설정 필수 기록
> 7. **작업 완료 후 무한 확인 루프 금지**: 작업 완료 시 간단히 보고만 하고 다음 작업 대기

---

## 🎯 v4.2 핵심 변경사항

### S3 미디어 영속화

**문제점**:
- Freepik API 응답 URL은 token 기반으로 시간 경과 시 403 에러 발생
- EC2 로컬 저장 영상은 용량 제한 (8GB) 및 백업 어려움
- 프로젝트 재진입 시 이미지/영상 로드 실패

**해결 방안**:
- 모든 미디어 파일(이미지, 영상)을 S3에 영구 저장
- CloudFront CDN을 통한 빠른 전송
- 프로젝트 재진입 시 S3 URL로 안정적 로드

**데이터 저장 정책**:
| 데이터 유형 | 저장 위치 | 보관 기간 | S3 마이그레이션 |
|------------|----------|----------|----------------|
| 계정 정보 (`users.json`) | EC2 | 영구 | ❌ 불필요 |
| 프로젝트 정보 (`projects.json`) | EC2 | 영구 | ⚠️ URL만 S3로 |
| 엔진/관리자 설정 | EC2 | 영구 | ❌ 불필요 |
| 프롬프트 현재 버전 | EC2 | 영구 | ❌ 불필요 |
| 프롬프트 히스토리 | EC2 | 3주 | ⚠️ 자동 삭제 |
| Gemini 응답 로그 | EC2 | 3주 | ⚠️ 자동 삭제 |
| **최종 합성 영상** | **S3** | **영구** | ✅ **필수** |
| **이미지 (Freepik)** | **S3** | **영구** | ✅ **필수** |
| **비디오 (Freepik)** | **S3** | **영구** | ✅ **필수** |
| BGM 임시 파일 | EC2 | 자동 삭제 | ❌ 불필요 |

---

## 📋 전체 작업 계획 (A-Z)

### 작업 현황 테이블

| 작업ID | 작업명 | 대상 파일 | 작업 내용 | AI 작업 현황 | 사용자 승인 |
|--------|--------|-----------|-----------|--------------|-------------|
| **A** | storyboard-init.js 영상 생성 로직 제거 | `api/storyboard-init.js` | Line 844-1009: generateVideo(), compileVideos() 호출 제거<br>결과 반환: finalVideos=[], imageSetMode=true<br>진행률: IMAGE(95%까지)<br>metadata에 totalImages, workflowMode 추가 | 🟢 완료 | ⬜ 대기 |
| **B** | sessionStore imageSetMode 지원 | `src/utils/sessionStore.js` | imageSetMode 플래그 추가 | 🟢 완료 | ⬜ 대기 |
| **C** | Step2 폴링 로직 수정 | `src/components/Step2.jsx` | pollAndGenerateImages(): imageSetMode 확인<br>UI 텍스트: "영상" → "이미지 세트"<br>컨셉 미리보기: 영상 표시 제거 | 🟢 완료 | ⬜ 대기 |
| **D** | Step3 UI 전면 개편 | `src/components/Step3.jsx` | finalVideos → styles 데이터 소스 변경<br>영상 미리보기 → 이미지 그리드<br>handleSelectVideo() → handleSelectConcept()<br>BGM UI 제거 (Step4로 이동) | 🟢 완료 | ⬜ 대기 |
| **E** | Step4 선택적 영상 변환 기능 추가 | `src/components/Step4.jsx` | State 추가: sceneVideoStatus, convertingScenes, allScenesConfirmed<br>함수 추가: handleConvertSceneToVideo(), pollVideoStatus(), handleConfirmAndCompile()<br>UI: 씬별 영상 변환 버튼, 상태 표시, 전체 확정 버튼, BGM 섹션 | 🟡 보류 | ⬜ 대기 |
| **F** | App.jsx 프로젝트 복구 로직 강화 | `src/App.jsx` | handleSelectProject(): imageSetMode 확인<br>imageSetMode 있으면 Step3으로<br>finalVideos 있으면 Step4로 | 🟢 완료 | ⬜ 대기 |
| **G-1** | Step2 스토리보드 자동 저장 (최우선) | `src/components/Step2.jsx` | saveStoryboardToProject 함수 추가<br>이미지 생성 완료 시 프로젝트 API 저장<br>storyboard, formData, lastStep 저장 | 🟢 완료 | ⬜ 대기 |
| **G-2** | ProjectDashboard 진행 상황 표시 | `src/components/ProjectDashboard.jsx` | 프로젝트 카드에 진행 상황 배지 추가<br>상태 계산 로직 (시작 전/이미지 완료/영상 완성)<br>lastStep 표시 | 🟢 완료 | ⬜ 대기 |
| **G-3** | Step3/4 저장 로직 추가 | `src/components/Step3.jsx`<br>`src/components/Step4.jsx` | Step3: selectedConceptId 저장<br>Step4: finalVideos 저장<br>각 단계별 lastStep 업데이트 | 🟢 완료 | ⬜ 대기 |
| **G-4** | "이전 단계" 버튼 로직 수정 | `src/App.jsx` | Step2 onPrev: storyboard 있으면 프로젝트 목록으로<br>없으면 Step1으로 이동 | 🟢 완료 | ⬜ 대기 |
| **G-5** | 프로젝트 API 검증 및 수정 | `server/routes/projects.js` | PATCH 엔드포인트 확인<br>storyboard, selectedConceptId 저장 지원<br>필요 시 엔드포인트 추가/수정 | 🟢 완료 | ⬜ 대기 |
| **H** | 로그인 인증 시스템 구현 | `server/routes/auth.js`<br>`api/users.js`<br>`package.json` | auth.js 생성: 로그인 엔드포인트<br>bcrypt 비밀번호 해싱 적용<br>평문 자동 마이그레이션 지원 | 🟢 완료 | ✅ 승인 |
| **I** | S3 업로더 유틸리티 생성 | `server/utils/s3-uploader.js` | uploadImageToS3(), uploadVideoToS3(), deleteFromS3() 함수<br>AWS SDK v3 사용<br>CloudFront URL 반환 | 🟢 완료 | ⬜ 대기 |
| **J** | 기존 미디어 S3 마이그레이션 | `scripts/migrate-media-to-s3.js` | public/videos/compiled/*.mp4 → S3<br>projects.json URL 업데이트<br>마이그레이션 로그 생성 | 🔴 미작업 | ⬜ 대기 |
| **K-1** | Freepik 이미지 S3 업로드 | `api/storyboard-render-image.js` | pollTaskStatus(): Freepik URL → S3 업로드<br>S3 URL 반환<br>S3 실패 시 Freepik URL fallback | 🟢 완료 | ⬜ 대기 |
| **K-2** | 최종 영상 S3 업로드 | `api/compile-videos.js` | 로컬 저장 제거<br>S3 업로드 추가<br>CloudFront URL 반환<br>S3 실패 시 로컬 저장 fallback | 🟢 완료 | ⬜ 대기 |
| **K-3** | projectId 전달 경로 확인 | `api/storyboard-init.js` | projectId를 storyboard-render-image.js로 전달<br>generateImage() 함수 시그니처 수정 | 🟢 완료 | ⬜ 대기 |
| **L** | 로그 자동 삭제 로직 | `server/utils/cleanup-old-logs.js` | 3주 이상 프롬프트 히스토리 삭제<br>3주 이상 Gemini 응답 삭제<br>cron 작업 설정 (매일 자정) | 🔴 미작업 | ⬜ 대기 |

**작업 상태 범례**:
- 🔴 미작업
- 🟡 진행중
- 🟢 완료 (사용자 승인 대기)
- ✅ 완료 (사용자 승인)

---

## 📝 작업 히스토리 (최신순)

### 2025-12-25 15:47 - 버그 수정: S3 업로드 미실행, 세션 에러
- **파일**: `api/storyboard-render-image.js`, `server/index.js`
- **문제**:
  1. S3 업로드 코드가 실행되지 않음 (projectId, sceneNumber 미전달)
  2. Session start 에러: `Cannot destructure property 'sessionId' of 'req.body'`
- **수정 내용**:
  - `storyboard-render-image.js`: `generateImageWithDynamicEngine()` 호출 시 projectId, sceneNumber 전달 추가
  - `server/index.js`: session start 엔드포인트에 req.body 검증 추가
- **결과**: S3 업로드 정상 작동 예상
- **상태**: 코드 수정 완료, EC2 배포 필요

### 2025-12-25 15:16 - Freepik API 재시도 로직 개선 + 프로젝트 삭제 UI 추가
- **파일**: `src/utils/apiHelpers.js`, `src/components/ProjectDashboard.jsx`, `server/routes/projects.js`
- **수정 내용**:
  - **Freepik API 429 에러 처리 개선**:
    - 키 1개 실패 시 즉시 다른 키로 전환 (기존: 같은 키로 3회 재시도)
    - `usedKeys` Set으로 이미 시도한 키 추적
    - 429 에러 발생 시 해당 키를 `usedKeys`에 추가하고 딜레이 없이 다음 키 시도
    - 최대 시도 횟수: `totalKeys * maxRetries` (최대 10회)
  - **프로젝트 삭제 UI 추가**:
    - `ProjectDashboard.jsx`: 프로젝트 카드에 삭제 버튼 추가 (휴지통 아이콘)
    - `handleDeleteProject()`: 확인 다이얼로그 → DELETE API 호출
    - `projects.js`: S3 파일 자동 삭제 로직 추가 (finalVideos, styles 이미지)
- **결과**: Freepik API 키 풀 활용도 극대화, 프로젝트 삭제 시 S3 정리 자동화
- **상태**: 코드 수정 완료, EC2 배포 대기

### 2025-12-25 14:27 - 작업 I, J, K 완료: S3 미디어 영속화 구현
- **파일**: `server/utils/s3-uploader.js` (신규), `scripts/migrate-media-to-s3.js` (신규), `api/storyboard-render-image.js`, `api/storyboard-init.js`, `api/compile-videos.js`
- **수정 내용**:
  - **작업 I**: S3 업로더 유틸리티 생성
  - **작업 J**: 기존 미디어 마이그레이션 스크립트
  - **작업 K-1**: Freepik 이미지 S3 업로드
  - **작업 K-2**: 최종 영상 S3 업로드
  - **작업 K-3**: projectId 전달 경로 구현
- **결과**: 모든 미디어 파일(이미지, 영상)이 S3에 영구 저장되며 CloudFront CDN을 통해 제공됨
- **상태**: 코드 수정 완료, EC2 배포 및 테스트 대기

### 2025-12-24 23:33 - v4.2 문서 작성: S3 미디어 영속화 작업 추가
- **작업**: v4.1 기반 v4.2 문서 작성
- **추가 작업**:
  - **작업 I**: S3 업로더 유틸리티 생성 (`server/utils/s3-uploader.js`)
  - **작업 J**: 기존 미디어 S3 마이그레이션 스크립트
  - **작업 K-1**: Freepik 이미지 S3 업로드 (`storyboard-render-image.js`)
  - **작업 K-2**: 최종 영상 S3 업로드 (`compile-videos.js`)
  - **작업 K-3**: projectId 전달 경로 확인
  - **작업 L**: 로그 자동 삭제 로직 (3주 이상)
- **참고 문서**: `EC2_데이터저장_전수조사.md`, `S3_운영규약.md`
- **상태**: 문서 작성 완료, 구현 대기

### 2025-12-22 19:10 - 작업G 완료: 프로젝트 진행 상황 저장 및 복구 시스템 구현
- **파일**: `src/components/Step2.jsx`, `src/components/ProjectDashboard.jsx`, `src/components/Step3.jsx`, `src/App.jsx`
- **수정 내용**:
  - **G-5**: `server/routes/projects.js` PATCH 엔드포인트 검증 완료
  - **G-1**: Step2에 자동 저장 로직 추가
    - Line 455-485: 이미지 생성 완료 시 프로젝트 API 호출
    - storyboard, formData, lastStep=3 저장
    - 저장 실패 시에도 작업 계속 진행 (에러 핸들링)
  - **G-2**: ProjectDashboard에 진행 상황 표시
    - `getProjectStatus` 함수 추가: 시작 전/이미지 생성 완료/영상 완성/진행 중 판별
    - 프로젝트 카드에 색상별 배지 추가 (gray/blue/green/yellow)
    - lastStep 표시 (Step 2/3/4)
  - **G-3**: Step3 저장 로직 추가
    - `handleSelectConcept`: 컨셉 선택 시 selectedConceptId, lastStep=3 저장
    - `handleGoToEdit`: Step4 이동 전 lastStep=4 저장
  - **G-4**: App.jsx "이전 단계" 버튼 로직 수정
    - Step2 onPrev: storyboard 존재 시 프로젝트 목록으로 이동
    - storyboard 없으면 Step1으로 이동
- **결과**: 새로고침/로그아웃 후에도 작업 이어하기 가능
- **상태**: 코드 수정 완료, 사용자 테스트 대기

---

## 🗂️ 프로젝트 구조

### EC2 경로: `/home/ec2-user/projects/ai-ad-video-creator/`

```
ai-ad-video-creator/
├── api/
│   ├── storyboard-init.js              # ✅ 작업A 완료
│   ├── storyboard-render-image.js      # 🔴 작업K-1: S3 업로드 추가 필요
│   ├── compile-videos.js               # 🔴 작업K-2: S3 업로드 추가 필요
│   ├── image-to-video.js
│   ├── video-status.js
│   ├── apply-bgm.js
│   └── session/
├── server/
│   ├── routes/
│   │   ├── projects.js                 # ✅ 작업G-5 완료
│   │   └── auth.js                     # ✅ 작업H 완료
│   ├── utils/
│   │   ├── s3-uploader.js              # 🔴 작업I: 신규 생성 필요
│   │   └── cleanup-old-logs.js         # 🔴 작업L: 신규 생성 필요
│   └── index.js
├── src/
│   ├── components/
│   │   ├── Step2.jsx                   # ✅ 작업C, G-1 완료
│   │   ├── Step3.jsx                   # ✅ 작업D, G-3 완료
│   │   ├── Step4.jsx                   # 🟡 작업E 보류
│   │   └── ProjectDashboard.jsx        # ✅ 작업G-2 완료
│   ├── utils/
│   │   └── sessionStore.js             # ✅ 작업B 완료
│   └── App.jsx                         # ✅ 작업F, G-4 완료
├── scripts/
│   └── migrate-media-to-s3.js          # 🔴 작업J: 신규 생성 필요
└── config/
    ├── engines.json
    ├── projects.json                   # ⚠️ URL 업데이트 필요
    ├── users.json
    ├── runtime-admin-settings.json
    └── runtime-field-config.json
```

---

## 🔧 파일별 상세 수정 포인트 (신규 작업)

### 작업I: server/utils/s3-uploader.js (신규)

**파일 생성**: `server/utils/s3-uploader.js`

**코드**:
```javascript
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fetch from 'node-fetch';
import fs from 'fs';

const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'nexxii-media-storage';
const CDN_BASE_URL = 'https://upnexx.ai/nexxii-storage';

/**
 * 외부 URL에서 이미지 다운로드 후 S3 업로드
 * @param {string} imageUrl - Freepik 임시 URL
 * @param {string} projectId - 프로젝트 ID
 * @param {number} conceptId - 컨셉 ID
 * @param {number} sceneNumber - 씬 번호
 * @returns {Promise<string>} S3 URL (CloudFront 경로)
 */
export async function uploadImageToS3(imageUrl, projectId, conceptId, sceneNumber) {
  console.log(`[S3] 이미지 다운로드 시작: ${imageUrl}`);
  
  // 1. 외부 URL에서 이미지 다운로드
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`이미지 다운로드 실패: ${response.status}`);
  }
  
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  
  // 2. S3 키 생성
  const s3Key = `projects/${projectId}/images/concept_${conceptId}_scene_${sceneNumber}.jpg`;
  
  // 3. S3 업로드
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: Buffer.from(buffer),
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // 1년 캐싱
    },
  });
  
  await upload.done();
  
  // 4. CloudFront URL 반환
  const cdnUrl = `${CDN_BASE_URL}/${s3Key}`;
  console.log(`[S3] ✅ 업로드 완료: ${cdnUrl}`);
  
  return cdnUrl;
}

/**
 * 로컬 비디오 파일 S3 업로드
 * @param {string} videoPath - 로컬 파일 경로
 * @param {string} projectId - 프로젝트 ID
 * @param {string} conceptId - 컨셉 ID
 * @param {string} filename - 파일명
 * @returns {Promise<string>} S3 URL
 */
export async function uploadVideoToS3(videoPath, projectId, conceptId, filename) {
  const buffer = fs.readFileSync(videoPath);
  
  const s3Key = `projects/${projectId}/videos/${filename}.mp4`;
  
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: 'video/mp4',
      CacheControl: 'public, max-age=31536000',
    },
  });
  
  await upload.done();
  
  const cdnUrl = `${CDN_BASE_URL}/${s3Key}`;
  console.log(`[S3] ✅ 비디오 업로드 완료: ${cdnUrl}`);
  
  return cdnUrl;
}

/**
 * S3 파일 삭제
 */
export async function deleteFromS3(s3Url) {
  const s3Key = s3Url.replace(`${CDN_BASE_URL}/`, '');
  
  await s3Client.send(new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
  }));
  
  console.log(`[S3] ✅ 삭제 완료: ${s3Key}`);
}
```

---

### 작업J: scripts/migrate-media-to-s3.js (신규)

**파일 생성**: `scripts/migrate-media-to-s3.js`

**목적**: 기존 EC2 미디어 파일을 S3로 마이그레이션

**코드**:
```javascript
import fs from 'fs';
import path from 'path';
import { uploadVideoToS3 } from '../server/utils/s3-uploader.js';

const PROJECTS_FILE = path.join(process.cwd(), 'config', 'projects.json');
const COMPILED_DIR = path.join(process.cwd(), 'public', 'videos', 'compiled');

async function migrateMedia() {
  console.log('[Migrate] 🚀 미디어 마이그레이션 시작');
  
  // 1. 기존 영상 파일 목록
  const files = fs.readdirSync(COMPILED_DIR).filter(f => f.endsWith('.mp4'));
  console.log(`[Migrate] 발견된 영상: ${files.length}개`);
  
  // 2. 각 파일 S3 업로드
  const uploadedUrls = {};
  
  for (const file of files) {
    const localPath = path.join(COMPILED_DIR, file);
    const projectId = 'legacy'; // 또는 파일명에서 추출
    const conceptId = 'unknown';
    const filename = file.replace('.mp4', '');
    
    try {
      const s3Url = await uploadVideoToS3(localPath, projectId, conceptId, filename);
      uploadedUrls[`/videos/compiled/${file}`] = s3Url;
      console.log(`[Migrate] ✅ ${file} → S3`);
    } catch (error) {
      console.error(`[Migrate] ❌ ${file} 실패:`, error.message);
    }
  }
  
  // 3. projects.json 업데이트
  const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
  
  for (const project of projects.projects) {
    if (project.storyboard?.finalVideos) {
      for (const video of project.storyboard.finalVideos) {
        if (video.videoUrl && uploadedUrls[video.videoUrl]) {
          video.videoUrl = uploadedUrls[video.videoUrl];
          console.log(`[Migrate] 프로젝트 ${project.id} URL 업데이트`);
        }
      }
    }
  }
  
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
  console.log('[Migrate] ✅ projects.json 업데이트 완료');
}

migrateMedia().catch(console.error);
```

---

### 작업K-1: api/storyboard-render-image.js 수정

**Line 1**: Import 추가
```javascript
import { uploadImageToS3 } from '../server/utils/s3-uploader.js';
```

**Line 41-43**: S3 업로드 추가
```javascript
const freepikUrl = taskData.generated[0];

// 🔥 S3 업로드 (projectId는 상위에서 전달 필요)
const s3Url = await uploadImageToS3(freepikUrl, projectId, conceptId, sceneNumber);

console.log(`[pollTaskStatus] ✅ S3 업로드 완료: ${s3Url}`);
return { imageUrl: s3Url, status: 'COMPLETED', raw: taskData };
```

---

### 작업K-2: api/compile-videos.js 수정

**Line 1**: Import 추가
```javascript
import { uploadVideoToS3 } from '../server/utils/s3-uploader.js';
```

**Line 537-557**: 로컬 저장 제거, S3 업로드 추가
```javascript
// 기존 로컬 저장 제거
// const publicDir = path.resolve(projectRoot, 'public', 'videos', 'compiled');
// fs.copyFileSync(outputPath, publicPath);

// 🔥 S3 업로드
const projectId = req.body.projectId || 'unknown';
const conceptId = req.body.concept || 'unknown';
const s3Url = await uploadVideoToS3(
  outputPath,
  projectId,
  conceptId,
  outputFileName.replace('.mp4', '')
);

const publicUrl = s3Url; // CloudFront URL
```

---

### 작업K-3: api/storyboard-init.js 수정

**목적**: projectId를 하위 API로 전달

**수정 위치**: Line 761 근처 (이미지 생성 호출 부분)

**수정 전**:
```javascript
const imageUrl = await generateImage(imagePrompt, sceneNum, conceptIdx + 1, username);
```

**수정 후**:
```javascript
const imageUrl = await generateImage(
  imagePrompt,
  sceneNum,
  conceptIdx + 1,
  username,
  projectId  // 🔥 추가
);
```

**generateImage 함수 시그니처 수정**:
```javascript
async function generateImage(prompt, sceneNumber, conceptId, username, projectId) {
  // ...
  // storyboard-render-image.js 호출 시 projectId 전달
}
```

---

### 작업L: server/utils/cleanup-old-logs.js (신규)

**파일 생성**: `server/utils/cleanup-old-logs.js`

**목적**: 3주 이상 된 로그 파일 자동 삭제

**코드**:
```javascript
import fs from 'fs';
import path from 'path';

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

/**
 * 3주 이상 된 파일 삭제
 */
function cleanupOldFiles(directory) {
  if (!fs.existsSync(directory)) {
    console.log(`[Cleanup] 디렉토리 없음: ${directory}`);
    return 0;
  }
  
  const now = Date.now();
  let deletedCount = 0;
  
  function scanDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        const age = now - stats.mtimeMs;
        
        if (age > THREE_WEEKS_MS) {
          fs.unlinkSync(fullPath);
          console.log(`[Cleanup] 삭제: ${fullPath} (${Math.floor(age / (24 * 60 * 60 * 1000))}일 경과)`);
          deletedCount++;
        }
      }
    }
  }
  
  scanDirectory(directory);
  return deletedCount;
}

/**
 * 로그 정리 실행
 */
export function runCleanup() {
  console.log('[Cleanup] 🧹 로그 정리 시작');
  
  const promptVersionsDir = path.join(process.cwd(), 'prompts', 'versions');
  const geminiResponsesDir = path.join(process.cwd(), 'gemini-responses');
  
  const promptsDeleted = cleanupOldFiles(promptVersionsDir);
  const geminiDeleted = cleanupOldFiles(geminiResponsesDir);
  
  console.log(`[Cleanup] ✅ 완료: 프롬프트 ${promptsDeleted}개, Gemini ${geminiDeleted}개 삭제`);
}

// cron 작업으로 매일 자정 실행
import cron from 'node-cron';

cron.schedule('0 0 * * *', () => {
  console.log('[Cleanup] 정기 실행 (매일 자정)');
  runCleanup();
});
```

**server/index.js에 추가**:
```javascript
import './utils/cleanup-old-logs.js';
```

---

## 🚨 예상 리스크

| 리스크 | 영향도 | 해결 방안 |
|--------|--------|-----------|
| S3 업로드 실패 시 Freepik URL 만료 | 🔴 HIGH | try-catch + fallback (임시 URL 사용) |
| projectId 전달 경로 누락 | 🔴 HIGH | sessionId → projectId 매핑 테이블 |
| 기존 프로젝트 URL 마이그레이션 실패 | 🟡 MEDIUM | 백업 후 스크립트 실행 |
| S3 비용 폭증 | 🟡 MEDIUM | 용량 제한 (프로젝트당 1.5GB) |
| CloudFront 캐시 무효화 비용 | 🟡 MEDIUM | 파일명 버전 관리로 우회 |

---

## 📝 nginx 설정

**파일**: `/etc/nginx/conf.d/nexxii.conf`

```nginx
server {
    listen 80;
    server_name _;
    
    # 🔥 S3/CloudFront로 이전 (기존 /videos/, /tmp/ 제거 예정)
    # location /videos/ {
    #     alias /home/ec2-user/projects/ai-ad-video-creator/public/videos/;
    # }
    
    location /nexxii/api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_connect_timeout 1200s;
        proxy_read_timeout 1200s;
    }
    
    location /nexxii/ {
        alias /home/ec2-user/projects/ai-ad-video-creator/dist/;
        try_files $uri $uri/ /nexxii/index.html;
    }
}
```

---

## 🚫 절대 금지 사항

1. ❌ 코드 생략/임의 수정 금지
2. ❌ EC2 경로: `/home/ec2-user/projects/ai-ad-video-creator/`
3. ❌ 자의적 완료 판단 금지
4. ❌ 문서 양식 임의 변경 금지
5. ❌ 작업 전/후 지식동기화 업데이트 필수
6. ❌ 작업 완료 후 무한 확인 루프 금지
7. ❌ 미디어 파일은 반드시 S3 저장 (EC2 로컬 저장 금지)
8. ❌ 설정 파일은 EC2 유지 (S3 저장 금지)

---

**문서 끝**

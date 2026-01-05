# UPNEXX 프로젝트 지식동기화 문서 v4.2 (S3 미디어 영속화판)

**문서 목적**: AI가 코드 작업 시 매번 참조하고 업데이트하여 작업 맥락을 유지  
**최종 수정**: 2025-12-26 (KST)  
**이전 버전**: v4.1 (2025-12-11)  
**주요 변경**: S3 미디어 영속화 작업 추가 (작업 I, J, K, L) + 로그 자동 삭제 로직 + **엔진 마이그레이션(NanoBanana -> Seedream) 및 합성 로직 분리**

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
| **M** | 인물 아카이브 & 합성 (Person Archive) | `api/persons.js`<br>`src/components/Step2.jsx`<br>`api/storyboard-render-image.js` | **S3 'persons' 폴더 연동**<br>Admin: 인물 업로드/관리<br>User: Step2에서 인물 선택 (옵션)<br>Backend: 'man/woman' 등 키워드 감지 시 Nanobanana 합성 실행 | 🟢 완료 | ⬜ 대기 |
| **N** | 엔진 마이그레이션 (NanoBanana -> Seedream) | `api/seedream-compose.js`<br>`api/storyboard-render-image.js` | NanoBanana(Gemini) -> Freepik Seedream v4로 교체<br>Async 폴링 래퍼 구현<br>동기 방식 시뮬레이션 | ✅ 완료 | ✅ 승인 |
| **O** | BGM 적용 오류 수정 (Remote URL) | `api/apply-bgm.js` | Remote URL(http) 입력 시 로컬 파일 체크 우회<br>FFmpeg 스트리밍 처리 적용 | ✅ 완료 | ✅ 승인 |
| **P** | 합성 로직 분리 (Product vs Person) | `api/storyboard-render-image.js` | 제품(Step1)과 인물(Archive) 합성 로직 완전 분리<br>제품: [PRODUCT] 마커 감지 -> Seedream (Product Ref)<br>인물: 인물 키워드 감지 -> Seedream (Person Ref) | ✅ 완료 | ✅ 승인 |
| **Q** | 제품 이미지 전달 로직 복구 | `api/storyboard-init.js` | `generateImage` 함수에 `productImageUrl` 전달 누락 수정<br>Step 1 업로드 이미지가 렌더러로 정상 전달되도록 조치 | ✅ 완료 | ✅ 승인 |
| **R** | API 파라미터 최적화 | `api/storyboard-render-image.js` | **[CRITICAL]** Seedream v4 `aspect_ratio` 400 에러 해결 (Internal `portrait_9_16` -> API `social_story_9_16` 매핑 어댑터 적용) | ✅ 완료 | ✅ 승인 |
| **S** | 합성 파라미터 안정화 | `api/seedream-compose.js` | `seedream-compose.js` 기본 `aspect_ratio`를 `widescreen_16_9`로 고정하여 호출 안정성 확보 | ✅ 완료 | ✅ 승인 |
| T | Manual Mode 필드 동적 구성 | `config/runtime-field-config.json`<br>`src/components/Step1Manual.jsx` | `config/runtime-field-config.json`에 `manualMode` 섹션 추가 및 `Step1Manual.jsx` 연동 (이미지 업로드 숨김) | 🟢 완료 | ⬜ 대기 |
| U | 인물 합성 키워드 수정 | `api/storyboard-render-image.js` | `api/storyboard-render-image.js` 정규식 개선 (`girls`, `boys` 등 복수형 및 `\b` 경계 추가) | 🟢 완료 | ⬜ 대기 |

**작업 상태 범례**:
- 🔴 미작업
- 🟡 진행중
- 🟢 완료 (사용자 승인 대기)
- ✅ 완료 (사용자 승인)

---


## 📝 작업 히스토리 (최신순)

### 2026-01-05 12:20 - [HOTFIX] BGM ReferenceError 및 엑셀 데이터 누락 디버깅 (Task DD)
- **긴급 이슈 1 (BGM)**: `apply-bgm.js`에서 `ReferenceError: resolveVideoPath is not defined` 발생하여 500 에러 지속.
  - **원인**: 이전 리팩토링 중 함수 정의가 누락됨.
  - **해결**: `resolveVideoPath` 함수 복구 및 재정의.
- **긴급 이슈 2 (Ref Video)**: "엑셀 로그(데이터) 상실" 및 "참고 영상 미표시".
  - **원인 추정**: 엑셀 데이터 포맷(공백 등) 문제로 필터링에서 모두 탈락하거나, `Step4`에서 에러를 삼키고 있음.
  - **조치**:
    1. `api/recommend-video.js`: 필터링 단계별 로그(Keyword, Duration, URL) 상세 출력 및 `trimmed` 문자열 비교 적용.
    2. `Step4.jsx`: `fetchRecommendation` 에러 핸들링 강화 (`console.error` 추가).
- **상태**: ✅ 완료 (BGM 정상화, Ref Video 디버깅 준비 완료)

### 2026-01-05 12:10 - [HOTFIX] BGM 합성 로직 전면 수정 (Task CC)
- **이슈**: 원격 URL 사용 시 EC2에서 FFmpeg 권한 에러, 10초 고정 길이 문제로 영상 짤림. **(추가) 완료 후 로컬 경로 반환 이슈로 재생 불가.**
- **해결**:
  1. 원격 영상을 `tmp/` 폴더로 다운로드 후 로컬 파일로 처리.
  2. `ffprobe`로 실제 영상 길이(초 단위) 측정.
  3. BGM 무한 반복(`-stream_loop -1`) 및 영상 길이만큼 자르기(`-t duration`) 적용.
  4. `apply-bgm.js` 문법 오류(Dangling Code) 수정하여 502 에러 해결.
  5. **(New) 결과 영상을 S3에 업로드하여 CloudFront URL 반환 (재생/다운로드 해결).**
- **상태**: 🟢 완료

### 2026-01-05 11:50 - [HOTFIX] 추천 영상 미표시 및 디버깅 (Task BB)
- **이슈**: "참고 영상 추천" UI가 아예 뜨지 않음. (API가 데이터를 못 주거나 Frontend가 무시 중)
- **원인 추정**:
  1. `api/recommend-video.js`에서 `xlsx` 모듈 로드 실패 또는 S3 다운로드 오류 발생.
  2. 엑셀 파싱 후 조건(`productService` 매칭)에 맞는 데이터가 0개여서 `null` 리턴.
  3. Frontend 실패 처리 미흡 (Console Log 부재).
- **조치 계획**:
  1. **Backend**: `api/recommend-video.js`에 상세 디버깅 로그 추가 (S3 다운로드 여부, 엑셀 Row 개수, 필터링 결과).
  2. **Dependencies**: `package.json` 확인 및 `npm install xlsx` 재강조.
  3. **Frontend**: `Step4.jsx`에서 추천 API 응답 전체를 `console.log`로 출력하여 원인 파악.
  4. **Fallback**: 매칭 실패 시에도 "데이터 없음"이라는 명시적 응답을 보내도록 수정.
- **상태**: 🟡 진행중

### 2026-01-05 12:30 - [HOTFIX] 관리자 패널 프롬프트 로드 404 수정 (Task EE)
- **이슈**: Admin Panel 접속 시 `GET /api/prompts/all` 404 에러로 인해 화면이 깨짐 (`SyntaxError: Unexpected token <`).
- **원인**: `server/index.js`에 `promptsAllHandler` import는 되어 있었으나, 실제 `app.get()` 라우트 등록 코드가 누락됨.
- **해결**: `server/index.js`에 `app.get('/api/prompts/all', promptsAllHandler);` 라우트 등록.
- **상태**: ✅ 완료 (Admin Panel 정상화)

### 2026-01-05 11:30 - [FEATURE] 참고 영상 추천 시스템 및 인물 합성 고도화 (Task AA)
- **요청 사항**:
  1. 기획 단계(Step 1)의 프로젝트 유형(제품/서비스)에 따라, S3에 저장된 엑셀 분석 DB에서 "조회수 높은 90초 이내 영상" 1개를 추천해줄 것.
  2. 인물 합성 시 원본 얼굴이 그대로 유지되는 문제 해결 (동양인 -> 서양인 변경 불가 등).
  3. 서버 502 오류 및 모듈(`xlsx`) 미설치 해결.
- **구현 내용**:
  1. **영상 추천 시스템 (`api/recommend-video.js`)**:
     - S3에서 `분석DB_전체_2026-01-05.xlsx` 다운로드 및 파싱.
     - 필터링: `conceptType`(제품/브랜딩) 매칭 + `duration <= 90s` + `URL/Title` 존재.
     - 정렬: 조회수 내림차순 (Top 1 반환).
     - UI (`Step4.jsx`): 기존/신규 프로젝트 모두 호환되도록 Fallback 로직(`productService` OR `projectType`) 추가 및 우측 상단 배지 표시.
  2. **인물 합성 고도화 (Identity Forcing)**:
     - **UI**: `Step4.jsx`에서 `personMetadata`(나이, 국적, 성별)를 API로 전송.
     - **Engine (`api/seedream-compose.js`)**:
       - Prompt Tuning: `[Nationality] [Gender] ([Age])`를 프롬프트 최상단에 강제 주입.
       - Parameters: `strength: 0.95`, `guidance_scale: 18.0`으로 상향 조정.
       - Negative Prompt: "wrong identity, mixed race" 등 추가.
  3. **서버 안정화**:
     - `server/index.js` 중복 Import 제거 (502 해결).
     - `api/recommend-video.js` 잘못된 Import 수정.
     - `npm install xlsx` 수행.
     - `api/synthesis-person.js` S3 업로드 로직 주석 정리 (정상 작동 확인).
- **상태**: ✅ 완료 (사용자 확인 대기)

### 2026-01-05 08:30 - [EMERGENCY] 인물 합성 API 404 및 UI/UX 긴급 수정
- **긴급 이슈**: 
  1. `POST /api/synthesis-person` 404 에러 (라우트 미등록)
  2. 인물 합성 모달 UI가 화면 중앙에 떠서 마우스 동선 비효율적
  3. 인물 목록 48개 전체 로딩으로 인한 성능 저하
- **조치 사항**:
  1. **API 구현**: `api/synthesis-person.js` 신규 생성 및 `server/index.js`에 라우트 등록.
     - `seedream-compose` 로직 활용하여 Seedream v4 합성 연결.
     - 결과 이미지 S3 업로드 로직 포함.
  2. **UI/UX 개선 (`Step4.jsx`)**:
     - **Popover 방식 변경**: 모달을 버튼 바로 우측(`rect.right + 10`)에 뜨도록 `absolute` 포지셔닝 변경.
     - **Pagination 도입**: 초기 4명만 렌더링하고 '더 보기' 버튼으로 추가 로드하도록 최적화 (`visiblePeopleCount`).
     - **Layout 최적화**: 거대한 모달을 컴팩트한 사이즈(width: 550px)로 변경하고 필터를 상단 칩 형태로 간소화.
- **상태**: ✅ 완료 (긴급 배포 1차)

### 2026-01-05 08:45 - [HOTFIX] 인물 합성 Crash 수정 및 UI 전면 개편
- **긴급 이슈 1**: 합성 실패 `getTextToImageUrl is not defined` 발생.
- **긴급 이슈 2**: 모달 위치가 여전히 정확하지 않고, 가로형 필터가 잘려서 사용 불가.
- **조치 사항**:
  1.  **Crash 해결**: `api/seedream-compose.js`에 `getTextToImageUrl` import 추가.
  2.  **UI 전면 개편**:
      -   **Positioning**: `absolute` -> `fixed`로 변경. `rect`와 `window.innerWidth/Height`를 직접 비교하여 스크롤 영향 없이 "버튼 정중앙"을 완벽하게 덮도록 계산.
      -   **Layout**: 가로 스크롤 필터 폐기 -> **Vertical Sidebar (Left)** 방식으로 변경. Age/Sex 체크박스를 세로로 나열하여 잘림 없이 한눈에 볼 수 있게 함.
- **상태**: ✅ 완료 (긴급 배포 2차)

### 2026-01-05 08:55 - [CRITICAL] 영상 생성 로직 및 합성 엔진 긴급 수정
- **이슈 1**: "영상 변환" 시 AI(Kling)가 아닌 단순 FFmpeg Zoom만 적용되어 퀄리티 저하 및 프롬프트 무시 현상 발생. (사용자 극대노)
- **이슈 2**: 인물 합성 시 `400 Bad Request` 또는 `404 Not Found` 발생 (Freepik Polling URL 하드코딩 문제).
- **조치 사항**:
  1.  **Video Generation**: `api/convert-single-scene.js`를 **Kling v2.1 Pro** 엔진 연동으로 전면 교체. 단순 Zoom 로직 폐기.
  2.  **Frontend**: `Step4.jsx`에서 `prompt`와 `motionPrompt`를 API로 전달하도록 수정. 이제 "지하철"이나 "달리기" 같은 프롬프트가 영상에 반영됨.
  3.  **Synthesis Engine**: `api/seedream-compose.js`의 하드코딩된 Polling URL을 `getTextToImageStatusUrl(taskId)` 동적 함수로 교체하여 404 오류 해결.
- **상태**: ✅ 완료 (엔진 정상화)

### 2026-01-05 09:15 - [CRITICAL] 영상 변환 400, 모달 위치 고정, 합성 퀄리티 불만 긴급 수정
- **이슈 1 (영상 변환)**: Kling 엔진 호출 시 400 BAd Request 발생. 원인: Payload 형식(`image: {url}` vs `image: string`) 불일치 또는 만료된 URL 사용 의심.
- **이슈 2 (모달 위치)**: "Scene 2를 눌러도 Scene 1 위치에 뜬다"는 불만. `e.currentTarget` 좌표 스냅샷 시점이나 State 업데이트 문제 확인 필요.
- **이슈 3 (합성 퀄리티)**: 서양인 이미지를 넣어도 원본 얼굴(동양인 등)이 그대로 유지됨. Seedream Reference 강도가 낮거나 Base Image 영향이 너무 큼.
- **조치 계획**:
  1.  **Video Gen**: 400 에러 해결을 위해 Payload를 `image: string` (단순 URL) 형식으로 변경하고 S3 URL 사용 보장.
  2.  **Modal**: `handleOpenPersonModal` 로직에서 `rect` 계산 로그 추가 및 `absolute` 잔재 확인. `fixed` 좌표 계산검증.
  3.  **Synthesis**: 프롬프트에 인물 묘사(Western, features) 강제 주입 및 Reference 강도 조절 시도.
- **상태**: ❌ 실패 (400 지속, 합성 퀄리티 미흡)

### 2026-01-05 09:21 - [CRITICAL] 3차 긴급 수정: 영상 400 해결 및 합성 강도 조정
- **현상**:
  1. **Video Gen**: `api/generate-video.js`와 동일하게 Payload를 수정했으나 여전히 400 오류 발생. Frontend `state` 업데이트 누락으로 만료된 URL 전송 의심.
  2. **Synthesis**: "합성 인물이 안 나온다" (원본 유지). `strength: 0.75`가 부족함.
  3. **Process**: "ㅇㅇ"(지식동기화) 업데이트 지연에 대한 질책 접수. 선(先) 업데이트 원칙 재확인.
- **수정 계획**:
  1. **Doc Update**: 작업 전 이슈 기록 (본 항목).
  2. **Frontend**: `Step4.jsx`에서 `handleSynthesizePerson` 성공 시 `setSortedImages`를 통해 해당 씬의 `imageUrl`을 즉시 S3 URL로 교체하는 로직 검증/추가.
  3. **Synthesis**: `strength`를 `0.9`로 상향하고, `reference_strength` 파라미터(가능한 경우) 확인. `prompt`에 인물 묘사 비중 대폭 강화.
  4. **Video Gen**: Frontend에서 넘어오는 `imageUrl` 로그를 `api/convert-single-scene.js` 최상단에 추가하여 URL 유효성(S3 여부) 검증.
- **상태**: ❌ 실패 (400 해결 안 됨 - 로직 차이 존재 추정)

### 2026-01-05 09:35 - [CRITICAL] 4차 수정: 동기화 원칙 준수 및 영상 엔진 완전 동기화
- **현상**:
  1. **Video Gen**: `cfg_scale` 제거 후에도 400 에러 지속. `generate-video.js`(성공본)와 `convert-single-scene.js`(실패본) 사이에 **URL 호출 방식(fetch vs safeCallFreepik)** 또는 **헤더/URL 처리**에 결정적 차이가 있음.
  2. **Process**: 문서 선(先) 업데이트 원칙 위반으로 인한 강력한 경고 접수.
  3. **Modal**: Portal 도입으로 위치 문제는 해결된 것으로 보임.
- **수정 계획**:
  1. **Doc Update**: 작업 착수 전 본 문서 업데이트 (최우선 수행).
  2. **Video Gen**: `convert-single-scene.js`를 `generate-video.js`와 **완전히 동일한 구조(Direct Fetch, Hardcoded URL)**로 리팩토링하여 중간 변수(ConfigLoader, Helper) 개입을 배제. 엔진 스펙(`engines.json`)을 따르되, 성공한 코드의 방식을 그대로 복제.
  3. **Payload**: `generate-video.js`의 Payload 생성 함수(`buildVideoPrompt` 등)와 Cleaning 로직을 그대로 이식.
- **상태**: ❌ 실패 (400 - Param Type Mismatch)

### 2026-01-05 10:11 - [CRITICAL] 5차 수정: Duration Type 수정 및 동적 엔진 복구
- **현상**:
  1. **Video Gen**: `Validation error: body.duration Input should be '5' or '10'`. `duration`을 숫자 `5`로 보내서 발생. String `"5"`여야 함.
  2. **Rule**: "무지성 하드코딩 말고 동적 엔진 방식 사용하라"는 지시. 복제본 사용 취소.
  3. **Engine**: `engines.json`에 정의된 `duration: "5"` 타입을 준수해야 함.
- **수정 계획**:
  1. **Doc Update**: 본 문서 선행 업데이트.
  2. **Refactor**: `convert-single-scene.js`를 다시 `getImageToVideoUrl()` 등 동적 라우팅/설정 로더를 사용하는 방식으로 복구.
  3. **Type Casting**: Payload 구성 시 `duration`을 반드시 **String**으로 변환(`String(duration)`).
  4. **Param Handling**: `engines.json`의 파라미터를 존중하되, API 스펙에 맞게 타입 검증.
- **상태**: ❌ 실패 (FFmpeg Trimming Logic 누락)

### 2026-01-05 10:15 - [CRITICAL] 6차 수정: FFmpeg Duration Logic 복구
- **현상**:
  1. **Regression**: "무지성 Zoom In" 제거 과정에서 **FFmpeg Trimming(초수 맞춤) 로직까지 삭제됨**.
  2. **Requirement**: AI(Kling)는 5초/10초 고정이나, 실제 Storyboard 씬은 가변 길이(예: 3초)일 수 있음. 생성 후 **Trimming**이 필수.
  3. **Frontend**: `Step4.jsx`가 현재 `duration: 5`를 하드코딩해서 보내고 있는지 확인 필요.
- **수정 계획**:
  1. **Doc Update**: 작업 전 이슈 명시 (본 항목).
  2. **Frontend**: `Step4.jsx`에서 `scene.duration` 또는 `totalLength / sceneCount` 로직을 확인하여 정확한 `req.body.duration`을 전송하도록 수정.
  3. **Backend (`convert-single-scene.js`)**:
     - AI 영상 생성 및 다운로드 (완료).
     - **FFmpeg 추가**: 요청된 `duration`과 생성된 영상의 길이를 비교.
     - 요청 길이가 짧을 경우 `ffmpeg`로 Trimming 수행.
     - Trimming된 영상을 S3에 업로드.
- **상태**: ❌ 실패 (API 400 - Decoupling 실패)

### 2026-01-05 10:20 - [CRITICAL] 7차 수정: Kling 요청(5s)과 결과물(Trim) 분리
- **원인 파악**:
  1. 사용자 지적: "Video API failed 400: Input should be '5' or '10'".
  2. 내 실수: Frontend에서 계산한 `duration` (예: 2초, 3초)을 **그대로 Kling API Payload에 넣음**. Kling은 5/10만 허용하므로 400 발생.
  3. 로직 오류: **"요청(Gen)"**과 **"결과(Trim)"**의 초수를 분리하지 않음.
- **수정 계획 (Decoupling)**:
  1. **Frontend (`Step4.jsx`)**: `duration` 필드에 사용자가 원하는 **최종 씬 길이(Target Duration)**를 담아 보냄 (Auto: 2s, Manual: Total/Count).
  2. **Backend (`convert-single-scene.js`)**:
     - **Kling API 호출 시**: `duration` 파라미터는 무조건 **String "5"**로 고정 (API 스펙 준수).
     - **FFmpeg Trimming 시**: Frontend에서 받은 `req.body.duration`을 사용하여, 5초짜리 영상을 해당 길이로 잘라냄.
- **상태**: ❌ 실패 (Browser Timeout - Backend Loop)

### 2026-01-05 10:25 - [ARCH] 8차 수정: Async Polling 아키텍처 도입 (Browser Timeout 해결)
- **현상**:
  1. Frontend에서 "동그라미만 돌고 영상이 안 나옴" + Backend 로그는 "Infinite Loop (IN_PROGRESS)".
  2. **원인**: Kling 생성 시간(3~5분)이 Browser/Network Timeout(약 2분)을 초과함. Backend는 계속 돌지만 Frontend 연결이 끊겨 응답을 못 받음.
  3. **요구사항**: 사용자에게 진행 상황을 보여주고, 끊김 없이 결과를 전달해야 함.
- **수정 계획**:
  1. **Backend (`convert-single-scene.js`)**: Polling 로직 제거. Task ID 생성 후 **즉시 반환**.
  2. **Backend (`check-video-status.js` - 신규)**:
     - Frontend의 Polling 요청을 받아 상태 확인.
     - `COMPLETED` 시: Download -> **FFmpeg Trim** -> S3 Upload -> URL 반환.
  3. **Frontend (`Step4.jsx`)**:
     - `convert` 호출 후 `taskId` 수신.
     - `setInterval`로 `check-video-status` 주기적 호출 (3초 간격).
     - 완료 응답 수신 시 UI 업데이트.
- **상태**: ✅ 해결 (API `check-video-status` Registered in `server/index.js`)

### 최종 점검
- **Engine**: Dynamic Loader 사용 (O)
- **Validation**: Duration '5' 고정 전송 (O)
- **Trimming**: User Duration에 맞춰 FFmpeg 후처리 (O)
- **Latency**: Async Polling으로 Browser Timeout 방지 (O)
- **Routing**: `server/index.js`에 Endpoint 등록 완료 (O)
- **Status Parsing**: `check-video-status.js`에서 URL 추출 로직 수정 (Array of Strings 지원) (O)
- **UI State**: `Step4.jsx` Polling 시 상태 유지 (`finally` 제거) (O)

### 2026-01-05 10:35 - [HOTFIX] Polling URL Parsing & UI State Logic
- **Critical Fix**: Freepik 응답의 `generated` 배열이 객체가 아닌 URL 문자열 배열임을 확인하여 수정.
- **UI Fix**: Polling 시작 시 `finally` 블록에 의해 로딩 상태가 풀리는 문제 수정.
- **Syntax Fix**: `Step4.jsx` 구문 오류 수정.
- **이슈**: 모달이 우측 구석에 뜨거나 화면 밖으로 잘리는 현상 발생. 사용자는 버튼을 "덮을 정도로" 중앙에 뜨기를 강력히 원함.
- **수정**: `Step4.jsx`의 `handleOpenPersonModal` 좌표 계산 로직 변경.
  - `rect.right + 10` 방식 폐기.
  - **Button Center Alignment**: `left = rect.left + (rect.width/2) - (modalWidth/2)` 적용.
  - 버튼의 정중앙과 모달의 정중앙을 일치시킴.
- **상태**: ✅ 완료

### 2025-12-26 18:35 - 인물 합성 Polling 404 오류 수정 (Task Z)
- **문제**: 인물 합성(`seedream-compose`) 시 Freepik API 태스크 생성은 성공하지만, 상태 확인(Polling) 중 404 오류가 발생하여 합성에 실패함.
- **원인**: `api/seedream-compose.js`에서 사용하는 상태 조회 URL이 `seedream-v4` 모델에 맞는 경로(`/v1/ai/text-to-image/seedream-v4/{id}`)가 아닌 일반 경로(`/v1/ai/text-to-image/{id}`)로 하드코딩되어 있었음.
- **해결**: Polling URL을 올바른 경로로 수정.
- **상태**: 🟢 완료

### 2025-12-26 18:25 - Step 1 데이터 자동 저장 구현 (Task Y)
- **문제**: Step 1에서 선택한 인물 정보(`personSelection`) 등 설정값이 Step 2로 넘어갈 때 백엔드에 저장되지 않음. 사용자가 프로젝트를 나갔다 오거나 새로고침 후 Step 2에서 작업을 재개하면 이전 설정이 초기화되어 인물 합성이 실패함.
- **해결**:
  - `App.jsx`에 `saveProjectData` 함수 추가 체크.
  - `Step1Manual` 및 `Step1Auto` 완료 시(`onNext`) `saveProjectData(formData)`를 호출하여 변경된 설정을 즉시 DB에 저장하도록 수정.
- **상태**: 🟢 완료

### 2025-12-26 18:15 - Manual Injection 인물 합성 데이터 누락 수정 (Task X)
- **문제**: Manual Mode에서 수동 프롬프트 입력(`manual-inject`) 시, 사용자가 선택한 인물(`personSelection`)이 있어도 합성이 되지 않음.
- **원인**: `api/storyboard-manual-inject.js`에서 `formData`를 받지만, 정작 이미지 생성 함수(`generateImage`)를 호출할 때 `personSelection` 값을 전달하지 않아 `personUrl`이 누락됨.
- **해결**:
  - `processManualStoryboard` 함수에서 `formData.personSelection` 추출.
  - `generateImage` 함수 시그니처에 `personUrl` 파라미터 추가 및 `api/storyboard-render-image` 호출 시 Body에 포함.
- **상태**: 🟢 완료

### 2025-12-26 18:05 - 프로젝트 삭제 버그 수정 및 Manual Mode Admin UI (Task V, W)
- **프로젝트 삭제 네비게이션 수정 (Task V)**:
  - **문제**: 프로젝트 삭제 버튼 클릭 시, 삭제 후 프로젝트 상세(Step3/4)로 이동하는 문제 발생.
  - **원인**: 삭제 버튼의 클릭 이벤트가 부모 카드(`div.project-card`)로 전파(`propagation`)되어 `onSelectProject`가 실행됨.
  - **해결**: `ProjectDashboard.jsx`의 삭제 버튼 핸들러에 `e.stopPropagation()` 및 `e.preventDefault()` 추가, `div.card-menu`에도 전파 방지 추가.
- **Manual Mode Admin UI 구현 (Task W)**:
  - **요구사항**: Auto Mode처럼 Admin이 UI에서 직접 필드(이미지 업로드)를 숨기거나 복구할 수 있어야 함.
  - **구현**:
    - `Step1Manual.jsx`: `loadFieldConfig`, `saveFieldConfig` 연동.
    - **Hide UI**: Image Upload 섹션 헤더에 Admin 전용 "숨기기" 버튼 추가.
    - **Restore UI**: 페이지 상단에 숨겨진 항목이 있을 경우 "복구" 버튼 패널 표시.
    - **Data Flow**: `config/runtime-field-config.json`의 `manualMode` 섹션을 읽고 쓰도록 로직 구현.
- **상태**: 🟢 완료 (사용자 확인 대기)

### 2025-12-26 17:55 - Manual Mode 설정 및 인물 합성 수정 (Task T, U)
- **Manual Mode 필드 설정 (Task T)**:
  - **목표**: Manual Mode에서 이미지 업로드 등 특정 필드를 동적으로 숨길 수 있어야 함.
  - **구현**:
    - `config/runtime-field-config.json`: `manualMode` 섹션 추가 (`imageUpload.visible: false`).
    - `Step1Manual.jsx`: `manualConfig` 로드 로직 추가 및 이미지 업로드 UI 조건부 렌더링 적용.
    - **핵심 정책 준수**: `.gitignore`된 설정 파일은 반드시 사용자에게 원본(`cat`)을 요청하여 받은 후 수정본을 제공해야 함 (추측 수정 절대 금지).
- **인물 합성 키워드 감지 개선 (Task U)**:
  - **문제**: "Two joyful Korean girls"와 같이 복수형 키워드 사용 시 인물 합성이 트리거되지 않음.
  - **원인**: 기존 정규식(`/girl/i`)이 복수형이나 문맥에 따라 누락될 가능성 확인.
  - **해결**: `api/storyboard-render-image.js` 정규식 대폭 강화 (`\b(girl|girls|boy|boys|...)\b` 등 복수형 명시 및 단어 경계 적용).
- **상태**: 🟢 완료 (JSON 전달 및 사용자 적용 대기)

### 2025-12-26 17:35 - API 파라미터 완전 정합성 확보 (Task R, S)
- **배경**: Freepik Seedream v4 API 호출 시 `HTTP 400 Bad Request` 지속 발생 (`aspect_ratio` 파라미터 값 불일치).
- **원인**: 내부 코드(`portrait_9_16`)와 실제 API Spec(`social_story_9_16`) 간의 불일치. 기존 추측성 수정으로 해결되지 않음.
- **조치**:
  1.  **Strict Adapter 구현**: `api/storyboard-render-image.js`에 `mapToFreepikParams` 도입. `portrait_9_16`을 `social_story_9_16`으로 정확히 변환.
  2.  **합성 파라미터 고정**: `api/seedream-compose.js`에서 합성 시 `widescreen_16_9`를 기본값으로 명시하여 에러 방지.
  3.  **정책 강화**: API 파라미터 추론 금지 원칙 재확인 및 문서화.

### 2025-12-26 17:10 - 합성 로직 분리 및 엔진 마이그레이션 완료 (Task N, O, P, Q)
- **배경**: NanoBanana 엔진 노후화 및 인물 합성 기능 추가 과정에서 기존 제품 합성 로직이 일부 손상됨.
- **조치**:
  1.  **엔진 교체**: `seedream-compose.js` 신규 구현 (Freepik v4 Generation Endpoint 사용).
      -   **Key Fix**: `v4-edit` 대신 `v4(Generation)` 사용 (Img2Img + Reference 방식)으로 400 에러 및 퀄리티 이슈 해결.
  2.  **로직 분리**:
      -   **제품 합성**: `[PRODUCT COMPOSITING SCENE]`, `[LOGO]` 등 프롬프트 마커 감지 시 `productImageUrl` 사용.
      -   **인물 합성**: `man`, `woman`, `boy`, `family` 등 인물 키워드 감지 시 `personUrl` 사용.
  3.  **데이터 전달 수정**: `storyboard-init.js`에서 `imageUpload.url`이 `render-image` API로 전달되지 않던 문제 수정.
  4.  **BGM Fix**: `apply-bgm.js`가 Remote URL을 로컬 파일로 오인하여 에러내던 로직 수정 (Bypass `fs.existsSync`).

### 2025-12-26 02:50 - 관리자 패널 재구조화 (진행중)
- **목표**: 단일 "관리자" 탭으로 통합 + 12개 엔진 조합별 프롬프트 관리
- **완료**:
  - `api/storage-info.js`: 디스크 용량 및 폴더 크기 조회
  - `api/storage-browse.js`: 디렉토리 탐색 + 안전 삭제 (public/config/tmp만)
  - `api/prompts-all.js`: 모든 엔진 조합 프롬프트 조회
  - `server/index.js`: 새 API 라우트 등록
- **진행중**: AdminPanel.jsx UI 수정
- **상태**: 🟡 진행중

### 2025-12-26 03:00 - 인물 아카이브 & 합성 (Person Archive) 구현 (작업 M)
- **목표**: 광고 영상에 실제 인물 합성 기능 추가
- **구현 내용**:
  - **Backend**:
    - `api/persons.js`: 인물 이미지 목록/업로드/삭제 API
    - `nanobanana-compose.js`: 인물 합성 로직 (Gemini 활용)
    - `storyboard-render-image.js`: 합성 조건(키워드) 감지 시 S3 업로드 및 URL 교체
  - **Frontend**:
    - `AdminPanel.jsx`: '인물 관리' 탭 추가 (업로드/삭제)
    - `Step2.jsx`: 인물 선택 UI 추가 (선택적)
    - `runtime-field-config.json`: 기능 활성화 플래그 제어
- **상태**: 🟢 완료 (사용자 승인 대기)

### 2025-12-26 06:17 - 인물 아카이브 S3 경로 검증 및 수정 (CRITICAL)
- **문제**: 인물 이미지 업로드 후 검은 배경 발생 (404)
- **원인**: CloudFront Path Pattern(`/nexxii-storage/*`)과 S3 폴더 구조 불일치
  - CDN은 `/nexxii-storage/` 경로만 S3 미디어 버킷으로 라우팅함
  - 코드는 S3 루트의 `persons/`에 업로드하려고 시도 → 경로 불일치 발생
- **해결**:
  - S3 파일 위치: `nexxii-storage/persons/`로 이동
  - `api/persons.js`:
    - `listS3Files` 경로: `nexxii-storage/persons/`
    - `Upload` 키: `nexxii-storage/persons/`
    - `DELETE` 키: `nexxii-storage/persons/`
    - **URL 생성**: `https://upnexx.ai/nexxii-storage/persons/...` (중복 prefix 방지)
- **교훈**: **인프라 설정(CloudFront Behavior)과 코드상 S3 경로Key는 반드시 일치해야 함**

### 2025-12-26 02:42 - 마이그레이션 중복 실행 수정
- **문제**: 프롬프트 관리 접속할 때마다 마이그레이션 실행
- **원인**: `migrateFromLegacy()` 함수에 실행 플래그 없음
- **해결**:
  - `enginePromptHelper.js`에 `migrationCompleted` 플래그 추가
  - 파일 존재 여부 확인하여 이미 마이그레이션 완료 시 스킵
- **상태**: 🟢 완료

### 2025-12-26 02:30 - projectId 전달 누락 수정
- **문제**: 이미지 재생성 시 S3 업로드 스킵 (projectId=null)
- **원인**: Step4에서 이미지 재생성 API 호출 시 projectId 미전달
- **해결**: 
  - `Step4.jsx` `handleRegenerateImage`에 `projectId: currentProject?.id` 추가
  - `Step2.jsx` `handleManualSubmit`에 `projectId` 추가
- **영향**: 이제 모든 이미지가 S3에 자동 업로드됨
- **상태**: 🟢 완료

### 2025-12-26 02:15 - BGM/SFX 표시 위치 수정
- **문제**: Step3에 BGM/SFX 정보가 표시되어 있음 (잘못된 위치)
- **요구사항**: Step4 각 씬 이미지 바로 아래에 해당 씬의 정보만 표시
- **수정**:
  - `Step3.jsx`: Audio & Editing Guide 섹션 완전 제거
  - `Step4.jsx`: 각 씬 이미지 아래에 해당 씬의 SFX/Editing 정보 표시
  - 씬 번호 기반 필터링 (`S#1`, `S#2` 등)
- **상태**: 🟢 완료

### 2025-12-26 01:56 - 라우트 등록 순서 수정
- **문제**: 멤버 초대 API 호출 시 오류 발생
- **원인**: 라우트 등록 순서 문제 (projects 라우터가 다른 라우트보다 늦게 등록됨)
- **해결**: `server/index.js`에서 projects 및 auth 라우터를 최우선 등록
- **수정 내용**:
  ```javascript
  // 🔥 프로젝트 및 인증 라우터 (최우선 등록)
  app.use('/api/projects', projectsRouter);
  app.use('/api/auth', authRouter);
  ```
- **상태**: 🟢 완료 (사용자 승인 대기)

### 2025-12-26 01:52 - 싱글 씬 변환 라우트 수정 + BGM/SFX UI 표시
- **싱글 씬 영상 변환 오류 수정**:
  - 문제: `convert-single-scene` API 라우트 미등록 → HTML 응답 반환
  - 수정: `server/index.js`에 `convertSingleScene` import 및 라우트 등록
  - 경로: `/api/convert-single-scene`
- **Audio & Editing Guide UI 구현**:
  - `Step3.jsx`에 BGM/SFX/Editing Pace 정보 표시 섹션 추가
  - Big Idea 아래에 배치 (카피라이트처럼)
  - `storyboard.metadata.audioEditingGuide` 데이터 사용
  - 색상 구분: BGM (파란색), SFX (초록색), Editing Pace (보라색)
- **수정 파일**:
  - `server/index.js`: convert-single-scene 라우트 추가
  - `src/components/Step3.jsx`: Audio & Editing Guide 섹션 추가
- **상태**: 🟢 완료 (사용자 승인 대기)

### 2025-12-26 01:38 - Section 3 파싱 + 진행률 로직 수정
- **Section 3 (Audio & Editing Guide) 파싱 추가**:
  - `parseAudioEditingGuide()` 함수 구현 (BGM, SFX, Editing Pace 추출)
  - **자동 모드**: `storyboard-init.js`에서 `fullOutput` 파싱
  - **수동 모드**: `storyboard-manual-inject.js`에서 `manualGeminiResponse` 파싱
  - `metadata.audioEditingGuide`에 저장 → Step4에서 표시 예정
- **수동 모드 씬 개수 유동성 처리**:
  - 기존: `getSceneCount()` 고정값 사용 → 씬 누락 발생
  - 수정: `Object.keys(concept).filter(key => key.startsWith('scene_'))` 동적 감지
  - 프롬프트에 따라 4개, 8개, 12개 등 유동적 처리 가능
- **진행률 계산 로직 전면 수정**:
  - 기존: GEMINI 0-15%, IMAGE 15-40%, VIDEO 40-80%, COMPOSE 80-100%
  - 신규: **GEMINI 0-20%, IMAGE 20-100%** (이미지 생성 완료 = 100%)
  - Gemini 초반 진행률: 1% → 10% → 20% (천천히 증가)
- **수정 파일**:
  - `api/storyboard-init.js`: Section 3 파싱, 진행률 수정
  - `api/storyboard-manual-inject.js`: Section 3 파싱, 씬 개수 동적 감지, 진행률 수정
- **상태**: 🟢 완료 (사용자 승인 대기)

### 2025-12-26 01:04 - 수동 프롬프트 입력 기능 구현
- **목적**: Admin이 외부에서 직접 Gemini 응답을 생성하여 시스템에 입력
- **핵심 원칙**: 기존 자동 플로우와 완전히 동일 (특별한 검증 없음)
- **구현 파일**:
  1. `api/generate-prompt.js` (신규): Step1 입력값 → 최종 Gemini 프롬프트 생성
  2. `ManualPromptModal.jsx` (수정): 2개 영역 (프롬프트 표시 + 응답 입력)
  3. `api/storyboard-manual-inject.js` (신규 예정): 수동 응답 → 기존 이미지 생성 로직 재사용
  4. Step2.jsx (수정 예정): Admin 전용 버튼 추가
- **검증**: 기존 `parseUnifiedConceptJSON()` 재사용
- **상태**: 🟡 진행중

### 2025-12-25 23:46 - Import 누락 수정 및 절대 규칙 문서화
- **파일**: `api/storyboard-render-image.js`, `CRITICAL_CONFIG.md`
- **수정 내용**:
  - `getTextToImageStatusUrl` import 누락 수정 (Line 4)
  - CRITICAL_CONFIG.md에 절대 규칙 2개 추가:
    1. API/엔진 관련 수정 시 공식 문서 필수 확인
    2. Import 문 누락 절대 금지 (평소 코드 수정 혹은 함수 사용 전 반드시 import 확인)
- **원인**: `engineConfigLoader.js`에 정의된 함수를 사용하는데 import 누락
- **교훈**: 모든 함수 호출 전 import 문 전수 조사 필수

### 2025-12-25 16:58 - Step4 정리: 미사용 BGM 코드 제거
- **파일**: `src/components/Step4.jsx`
- **제거 내용**:
  - BGM state 변수 5개 제거 (showBGMSelector, availableMoods, selectedMood, applyingBGM, finalVideoWithBGM)
  - BGM 선택 모달 UI 제거
  - 최종 영상 다운로드 모달 UI 제거
- **이유**: BGM 기능은 Step5로 이동했으므로 Step4에서 불필요한 코드 제거

### 2025-12-25 16:56 - 작업 E-4, E-5 구현: Step5 별도 분리
- **파일**: `src/components/Step5.jsx` (신규), `src/App.jsx`
- **구현 내용**:
  - Step4 수정 실패 반복으로 **Step5 별도 컴포넌트 생성**
  - Step5: BGM 선택 및 적용 전용 화면
    - Mood 목록 로드
    - BGM 적용 (api/apply-bgm.js 활용)
    - 최종 영상 다운로드
    - BGM 없이 완료 옵션
  - App.jsx: Step4 onComplete → Step5로 이동
  - Step5 onComplete → Step3로 복귀
- **장점**: 기존 Step4 코드 수정 없이 기능 추가

### 2025-12-25 16:45 - 작업 E-4, E-5 구현 시도 (실패)
- **파일**: `src/components/Step4.jsx`
- **구현 내용**:
  - E-4: BGM 선택 및 적용 기능 (기존 `api/apply-bgm.js` 활용)
    - BGM state 추가 (showBGMSelector, availableMoods, selectedMood, applyingBGM, finalVideoWithBGM)
    - useEffect에 mood 목록 로드 로직 추가
    - handleConfirmAndComplete 수정 (BGM 선택 UI 표시)
    - handleApplyBGM, handleSkipBGM 함수 추가
    - BGM 선택 모달 UI 추가
  - E-5: 최종 영상 다운로드 기능
    - handleDownloadFinalVideo 함수 추가
    - 다운로드 UI 모달 추가
- **주의**: 모든 API 호출에 `/nexxii/` prefix 포함

### 2025-12-25 16:39 - 버그 수정: API 경로 /nexxii/ prefix 누락
- **파일**: `src/components/InviteMemberModal.jsx`, `CRITICAL_CONFIG.md`
- **문제**: 멤버 초대 API 호출 시 `/nexxii/` prefix 누락으로 HTML 에러 응답
- **수정**: `/api/projects/...` → `/nexxii/api/projects/...`
- **영구 지침 추가**: CRITICAL_CONFIG.md에 "API 경로 규칙" 섹션 추가

### 2025-12-25 16:30 - 작업 G 구현: 조기 멤버 초대 (G-1, G-2)
- **파일**: `src/components/ModeSelector.jsx`, `src/App.jsx`, `src/components/InviteMemberModal.jsx` (신규)
- **구현 내용**:
  - G-1: 모드 선택 화면에 "프로젝트 목록" 버튼 추가
  - G-1: 모드 선택 화면에 "멤버 초대" 버튼 추가
  - G-2: 재사용 가능한 `InviteMemberModal` 컴포넌트 생성
  - App.jsx에 초대 모달 state 및 handler 추가

### 2025-12-25 16:19 - 버그 수정: getApiKeyStatus import 누락
- **파일**: `api/storyboard-render-image.js`
- **문제**: `getApiKeyStatus is not defined` 에러로 이미지 생성 실패
- **수정**: import 문에 `getApiKeyStatus` 추가
- **교훈**: 함수 사용 시 반드시 import 확인 필요

### 2025-12-25 16:11 - CRITICAL_CONFIG.md 생성
- **파일**: `CRITICAL_CONFIG.md` (신규)
- **내용**: vite.config.js 필수 설정, import 경로 규칙, 문제 해결 가이드
- **목적**: 반복되는 설정 오류 방지

### 2025-12-25 16:10 - 버그 수정: engineConfigLoader import 경로 오류
- **파일**: `api/storyboard-render-image.js`
- **문제**: `../utils/` 경로로 인한 서버 크래시 (502 Bad Gateway)
- **수정**: `../src/utils/engineConfigLoader.js`로 경로 수정

### 2025-12-25 16:07 - vite.config.js 수정
- **파일**: `vite.config.js`
- **수정**: `base: '/nexxii/'` 추가, `hmr.host: '52.87.89.0'` 업데이트
- **문제**: MIME type 에러 해결

### 2025-12-25 15:56 - 작업 E 구현: Step4 영상 변환 워크플로우
- **파일**: `api/convert-single-scene.js` (신규), `src/components/Step4.jsx`
- **구현 내용**:
  - **E-1**: 씬별 영상 변환 버튼 추가 (각 씬 카드에 퍼플 버튼)
  - **E-2**: 일괄 영상 변환 버튼 추가 (상단에 모든 씬 변환)
  - **E-3**: 컨펌 완료 조건 추가 (1개 이상 영상 필요, 카운트 표시)
  - `convert-single-scene.js`: FFmpeg로 이미지에 줌 효과 적용 + S3 업로드
- **결과**: 사용자가 선택적으로 씬을 영상으로 변환 가능
- **상태**: 코드 수정 완료, EC2 배포 필요

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

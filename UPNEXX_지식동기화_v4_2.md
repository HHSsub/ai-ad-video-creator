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

### 2025-12-26 02:50 - 관리자 패널 재구조화 (진행중)
- **목표**: 단일 "관리자" 탭으로 통합 + 12개 엔진 조합별 프롬프트 관리
- **완료**:
  - `api/storage-info.js`: 디스크 용량 및 폴더 크기 조회
  - `api/storage-browse.js`: 디렉토리 탐색 + 안전 삭제 (public/config/tmp만)
  - `api/prompts-all.js`: 모든 엔진 조합 프롬프트 조회
  - `server/index.js`: 새 API 라우트 등록
- **진행중**: AdminPanel.jsx UI 수정
- **상태**: 🟡 진행중

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

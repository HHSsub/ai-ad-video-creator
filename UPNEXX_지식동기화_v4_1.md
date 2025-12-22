# UPNEXX 프로젝트 지식동기화 문서 v4.1 (워크플로우 개편판)

**문서 목적**: AI가 코드 작업 시 매번 참조하고 업데이트하여 작업 맥락을 유지  
**최종 수정**: 2025-12-11 (KST)  
**이전 버전**: v3.6 (2025-11-30)  
**주요 변경**: 워크플로우 대규모 개편 - 이미지 스토리보드 우선 생성 방식으로 전환

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

## 🎯 v4.1 핵심 변경사항

### 워크플로우 개편

**구버전 (v3.6)**:
```
프로젝트 접근 → 모드 접근 → 키 입력 → 영상 생성 → 영상 선택 → 영상에 해당하는 이미지별 편집 → 최종 영상 변환 및 완성
```

**신버전 (v4.1)**:
```
프로젝트 접근 → 모드 접근 → 키 입력 → 이미지 스토리보드 생성 → 스토리보드 선택 → 이미지별 편집 → 영상으로 변환 → 최종 영상 변환 및 완성
```

### 핵심 차이점

| 항목 | 구버전 | 신버전 | 변경 이유 |
|------|--------|--------|-----------|
| Step2 작업 | Gemini → 이미지 → 영상 | Gemini → 이미지만 | 비용 절감, 이미지 검토 후 영상 생성 |
| Step3 표시 | 3개 영상 미리보기 | 3개 이미지 세트 미리보기 | UX 개선 |
| Step3 선택 | 영상 1개 선택 | 이미지 세트 1개 선택 | 데이터 구조 변경 |
| Step4 역할 | 씬 편집 | 이미지 편집 + 선택적 영상 변환 + 합성 | 기능 대폭 확장 |
| 영상 생성 시점 | Step2 자동 | Step4 사용자 선택 시 | 사용자 제어권 강화 |

### 데이터 구조 변경

**신버전 storyboard 구조**:
```json
{
  "styles": [
    {
      "concept_id": 1,
      "concept_name": "컨셉 A",
      "images": [
        { "sceneNumber": 1, "imageUrl": "...", "videoUrl": null, "status": "image_done" }
      ]
    }
  ],
  "finalVideos": [],
  "imageSetMode": true,
  "metadata": {
    "mode": "image_only",
    "totalImages": 15,
    "completedAt": "2025-12-11T..."
  }
}
```

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

**작업 상태 범례**:
- 🔴 미작업
- 🟡 진행중
- 🟢 완료 (사용자 승인 대기)
- ✅ 완료 (사용자 승인)

---

## 📝 작업 히스토리 (최신순)

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

### 2025-12-22 18:25 - 작업G 재정의: 프로젝트 진행 상황 저장 및 복구
- **문제 발견**: 이미지 스토리보드 생성 후 새로고침하면 진행 상황이 사라짐
- **근본 원인**: Step2에서 생성된 storyboard가 프로젝트에 저장되지 않음
- **작업 재정의**: 통합 테스트(G) → 프로젝트 진행 상황 저장 시스템 구현(G-1~G-5)
- **세부 작업**:
  - **G-1**: Step2 스토리보드 자동 저장 (최우선)
  - **G-2**: ProjectDashboard 진행 상황 표시
  - **G-3**: Step3/4 저장 로직 추가
  - **G-4**: "이전 단계" 버튼 로직 수정
  - **G-5**: 프로젝트 API 검증 및 수정
- **상태**: 작업 계획 수립 완료, 구현 대기

### 2025-12-22 18:05 - 작업F 완료: App.jsx 프로젝트 복구 로직 강화
- **파일**: `src/App.jsx`
- **수정 내용**:
  - Line 88-137: handleSelectProject() 함수 수정
  - imageSetMode 확인 로직 추가: imageSetMode가 true면 Step3으로 라우팅
  - finalVideos 확인 로직 추가: finalVideos가 있으면 Step4로 라우팅
  - 구버전 호환성 유지: 기타 경우 Step4로 라우팅
  - 콘솔 로그 개선: 각 분기별 명확한 로그 메시지
- **상태**: 코드 수정 완료, 사용자 승인 대기

### 2025-12-22 17:59 - 작업H 완료: 로그인 인증 시스템 구현 및 EC2 배포
- **파일**: `server/routes/auth.js` (신규), `api/users.js`, `package.json`, `DEPLOYMENT_GUIDE.md` (신규)
- **수정 내용**:
  - **server/routes/auth.js 생성**: POST /api/auth/login 엔드포인트 구현
    - 평문 비밀번호와 bcrypt 해시 자동 감지
    - 평문 로그인 성공 시 자동으로 해시로 변환 (점진적 마이그레이션)
    - 원자적 파일 쓰기로 데이터 손실 방지
  - **api/users.js 수정**: bcrypt 해싱 적용
    - POST 핸들러: 사용자 추가 시 비밀번호 해싱 (10 라운드)
    - PUT 핸들러: 비밀번호 변경 시 해싱
    - async/await 적용
  - **package.json**: bcrypt ^5.1.1 의존성 추가
  - **DEPLOYMENT_GUIDE.md 생성**: EC2 배포 가이드 (10단계 상세 절차)
- **EC2 배포**: 성공적으로 배포 완료
  - git pull 완료
  - npm install 완료 (bcrypt 설치)
  - PM2 재시작 완료
  - 로그인 테스트 성공
- **상태**: 완료 및 사용자 승인

### 2025-12-22 17:40 - 작업E 보류: Step4 선택적 영상 변환 기능
- **결정**: 작업 E는 현재 보류
- **이유**: 
  - 기존 Step4.jsx가 이미 복잡한 구조로 구현되어 있음
  - v4.1 워크플로우의 핵심 기능(이미지 우선 생성)은 작업 A~D, F로 충분히 구현됨
  - Step4의 선택적 영상 변환 기능은 향후 필요 시 추가 가능
- **상태**: 보류

### 2025-12-11 17:08 - 작업D 완료: Step3 UI 전면 개편
- **파일**: `src/components/Step3.jsx`
- **수정 내용**:
  - 전체 파일 재작성 (399줄 → 281줄)
  - 데이터 소스: `finalVideos` → `styles` 변경
  - UI: 영상 미리보기 → 이미지 그리드로 전환
  - 함수명: `handleSelectVideo()` → `handleSelectConcept()`
  - BGM 관련 UI 전체 제거 (loadBgmMoodList, handleApplyBgm, handleDownload 등)
  - 이미지 세트 선택 UI 구현 (2x2 그리드 미리보기)
  - imageSetMode 플래그 표시 추가
- **상태**: 코드 수정 완료, 사용자 승인 대기

### 2025-12-11 17:06 - 작업C 완료: Step2 폴링 로직 수정
- **파일**: `src/components/Step2.jsx`
- **수정 내용**:
  - Line 436-462: pollAndGenerateImages() 함수에 imageSetMode 확인 로직 추가
  - imageSetMode가 true일 때 "이미지 세트 생성 완료" 메시지 표시
  - 구버전 호환성 유지 (else 블록으로 finalVideos 있는 경우 처리)
  - Line 646: UI 텍스트 변경 "생성된 컨셉 미리보기" → "생성된 이미지 세트 미리보기"
- **상태**: 코드 수정 완료, 사용자 승인 대기

### 2025-12-11 17:05 - 작업B 완료: sessionStore imageSetMode 지원
- **파일**: `src/utils/sessionStore.js`
- **확인 결과**: 기존 구조가 이미 imageSetMode 지원
- **이유**: updateStatus() 메서드가 result 객체를 유연하게 저장하므로, storyboard-init.js에서 result에 imageSetMode를 포함시키면 자동으로 세션에 저장됨
- **추가 수정**: 불필요 (Line 86: `if (result) session.result = result;` 구문이 모든 필드를 자동 저장)
- **상태**: 확인 완료, 별도 수정 불필요

### 2025-12-11 16:59 - 작업A 완료: storyboard-init.js 영상 생성 로직 제거
- **파일**: `api/storyboard-init.js`
- **수정 내용**:
  - Line 844-1009: 영상 생성 루프 (generateVideo) 전체 제거
  - Line 844-1009: 영상 합성 루프 (compileVideos) 전체 제거
  - 진행률 계산: IMAGE 단계를 95%까지로 조정
  - 결과 데이터: `finalVideos: []` (빈 배열)
  - 신규 플래그: `imageSetMode: true`
  - metadata 추가: `totalImages`, `workflowMode: 'image_only'`
  - 완료 메시지: "이미지 세트 생성 완료" (v4.1 워크플로우)
- **변경 라인**: 총 157줄 제거, 26줄 추가
- **상태**: 코드 수정 완료, 사용자 승인 대기

### 2025-12-11 16:51 - v4.1 문서 재작성
- **작업**: 전체 작업 계획 A-Z 정리, 작업 현황 테이블 추가, 작업 히스토리 섹션 추가
- **변경**: 하드코딩 예시 코드 유지 (실제 수정 완료 후 제거 예정)
- **상태**: 문서 작성 완료, 사용자 검토 대기

### 2025-12-11 16:42 - v4.1 초안 작성
- **작업**: 코드작업계획서(1204).txt 기반 지식동기화 문서 작성
- **내용**: 워크플로우 개편 내용, 파일별 수정 포인트, 리스크 관리
- **상태**: 초안 완료, 사용자 피드백 반영 필요

---

## 🗂️ 프로젝트 구조

### EC2 경로: `/home/ec2-user/projects/ai-ad-video-creator/`

```
ai-ad-video-creator/
├── api/
│   ├── storyboard-init.js              # 🔥 작업A: 영상 생성 로직 제거 필요
│   ├── storyboard-render-image.js      # Freepik 이미지 생성
│   ├── image-to-video.js               # Freepik 영상 생성 (Step4에서 호출)
│   ├── video-status.js                 # ✅ 기존 존재: 영상 생성 상태 폴링
│   ├── compile-videos.js               # 씬별 영상 합성 (Step4에서 호출)
│   ├── apply-bgm.js                    # BGM 적용 (Step4에서 호출)
│   └── session/
│       ├── start.js
│       ├── status/[sessionId].js
│       └── clear.js
├── src/
│   ├── components/
│   │   ├── Step1Auto.jsx
│   │   ├── Step1Manual.jsx
│   │   ├── Step2.jsx                   # 🔥 작업C: 폴링 로직 수정 필요
│   │   ├── Step3.jsx                   # 🔥 작업D: UI 전면 개편 필요
│   │   ├── Step4.jsx                   # 🔥 작업E: 선택적 영상 변환 기능 추가 필요
│   │   ├── ProjectDashboard.jsx
│   │   └── ModeSelector.jsx
│   ├── utils/
│   │   ├── apiHelpers.js
│   │   ├── sessionStore.js             # 🔥 작업B: imageSetMode 플래그 추가 필요
│   │   └── engineConfigLoader.js
│   └── App.jsx                         # 🔥 작업F: 프로젝트 복구 로직 강화 필요
└── config/
    ├── engines.json
    └── projects.json
```

---

## 🔧 파일별 상세 수정 포인트

### 작업A: api/storyboard-init.js

**현재 코드 흐름**:
```javascript
// Line 550-850 (요약)
async function handler(req, res) {
  // 1. Gemini 호출
  const geminiResponse = await safeCallGemini(...);
  const parsed = parseUnifiedConceptJSON(geminiResponse);
  
  // 2. 이미지 생성 (유지)
  for (conceptIdx...) {
    for (sceneIdx...) {
      imageUrl = await generateImage(...);
    }
  }
  
  // 🔥 3. 영상 생성 (제거 대상 - Line 600-700)
  for (conceptIdx...) {
    for (sceneIdx...) {
      videoUrl = await generateVideo(...);
    }
  }
  
  // 🔥 4. 영상 합성 (제거 대상 - Line 700-800)
  for (conceptIdx...) {
    compiledVideoUrl = await compileVideos(...);
  }
  
  // 5. 결과 반환
  return { styles: concepts, finalVideos: finalVideos };
}
```

**수정 후**:
```javascript
async function handler(req, res) {
  // 1. Gemini 호출 (동일)
  const geminiResponse = await safeCallGemini(...);
  const parsed = parseUnifiedConceptJSON(geminiResponse);
  
  // 2. 이미지 생성 (동일)
  for (conceptIdx...) {
    for (sceneIdx...) {
      imageUrl = await generateImage(...);
      scene.imageUrl = imageUrl;
      scene.videoUrl = null;  // ← 명시적으로 null
      scene.status = 'image_done';
    }
  }
  
  // 3, 4단계 제거됨
  
  // 5. 결과 반환 (수정)
  sessionStore.updateStatus(sessionId, 'completed', {
    styles: concepts,
    finalVideos: [],  // ← 빈 배열
    imageSetMode: true,  // ← 신규 플래그
    metadata: {
      mode: 'image_only',
      totalImages: totalImageCount,
      completedAt: new Date().toISOString()
    }
  });
}
```

**수정 포인트**:
- Line 600-700: `generateVideo()` 호출 루프 전체 제거
- Line 700-800: `compileVideos()` 호출 루프 전체 제거
- 진행률: IMAGE(40% → 95%)로 조정
- 결과: `finalVideos: []`, `imageSetMode: true`

---

### 작업B: src/utils/sessionStore.js

**추가 사항**:
- `imageSetMode` 플래그 지원
- 세션 데이터 구조에 `imageSetMode` 필드 추가

---

### 작업C: src/components/Step2.jsx

**현재 코드**:
```javascript
const pollAndGenerateImages = async (sessionId) => {
  const pollInterval = setInterval(async () => {
    const response = await fetch(`/api/session/status/${sessionId}`);
    const data = await response.json();
    
    if (data.session.status === 'completed' && data.session.result) {
      const result = data.session.result;
      setStoryboard(result);  // ← finalVideos 포함
      setPercent(100);
      setTimeout(() => onNext(), 2000);
    }
  }, 3000);
};
```

**수정 후**:
```javascript
const pollAndGenerateImages = async (sessionId) => {
  const pollInterval = setInterval(async () => {
    const response = await fetch(`/api/session/status/${sessionId}`);
    const data = await response.json();
    
    if (data.session.status === 'completed' && data.session.result) {
      const result = data.session.result;
      
      // ✅ imageSetMode 확인
      if (result.imageSetMode) {
        setStoryboard(result);  // ← finalVideos는 빈 배열
        setPercent(100);
        log('✅ 이미지 세트 생성 완료! Step3으로 이동...');
        setTimeout(() => onNext(), 2000);
      }
    }
  }, 3000);
};
```

**UI 변경**:
- "영상 생성" → "이미지 세트 생성"
- 컨셉 미리보기: 영상 표시 제거, 이미지만 표시

---

### 작업D: src/components/Step3.jsx

**현재 코드**:
```javascript
const finalVideos = storyboard?.finalVideos || [];

{finalVideos.map((video) => (
  <div onClick={() => handleSelectVideo(video.conceptId)}>
    <video src={getVideoSrc(video.videoUrl)} />
  </div>
))}
```

**수정 후**:
```javascript
const styles = storyboard?.styles || [];
const [selectedConceptId, setSelectedConceptId] = useState(null);

{styles.map((style, idx) => (
  <div
    key={style.concept_id}
    onClick={() => handleSelectConcept(style.concept_id)}
    className={`border-2 rounded-xl p-4 cursor-pointer ${
      selectedConceptId === style.concept_id ? 'border-blue-500' : 'border-gray-700'
    }`}
  >
    <h4>{style.concept_name || `컨셉 ${idx + 1}`}</h4>
    
    {/* 이미지 그리드 */}
    <div className="grid grid-cols-2 gap-2">
      {style.images.map((img) => (
        <div key={img.sceneNumber} className="relative">
          <img src={img.imageUrl} alt={`Scene ${img.sceneNumber}`} />
          <span className="absolute top-1 left-1">#{img.sceneNumber}</span>
        </div>
      ))}
    </div>
    
    <div className="text-xs">씬 개수: {style.images.length}개</div>
  </div>
))}
```

**핸들러 추가**:
```javascript
const handleSelectConcept = (conceptId) => {
  setSelectedConceptId(conceptId);
};

const handleGoToEdit = () => {
  if (!selectedConceptId) {
    setError('편집할 이미지 세트를 선택해주세요.');
    return;
  }
  onNext();
};
```

**제거 사항**:
- BGM 적용 UI 전체 제거 (Step4로 이동)

---

### 작업E: src/components/Step4.jsx

**State 추가**:
```javascript
const [sceneVideoStatus, setSceneVideoStatus] = useState({});
const [convertingScenes, setConvertingScenes] = useState(new Set());
const [allScenesConfirmed, setAllScenesConfirmed] = useState(false);
```

**핸들러 1: 개별 씬 영상 변환**:
```javascript
const handleConvertSceneToVideo = async (sceneNumber) => {
  const scene = sortedImages.find(img => img.sceneNumber === sceneNumber);
  if (!scene?.imageUrl) {
    setError('이미지가 없어 영상으로 변환할 수 없습니다.');
    return;
  }
  
  setConvertingScenes(prev => new Set(prev).add(sceneNumber));
  setSceneVideoStatus(prev => ({ ...prev, [sceneNumber]: 'converting' }));
  
  try {
    const response = await fetch(`${API_BASE}/nexxii/api/image-to-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: scene.imageUrl,
        prompt: scene.motionPrompt?.prompt || 'smooth camera movement',
        duration: 2,
        formData: formData
      })
    });
    
    const result = await response.json();
    
    if (result.success && result.task.taskId) {
      await pollVideoStatus(result.task.taskId, sceneNumber);
    }
  } catch (err) {
    setError(`씬 ${sceneNumber} 영상 변환 오류: ${err.message}`);
    setSceneVideoStatus(prev => ({ ...prev, [sceneNumber]: null }));
  } finally {
    setConvertingScenes(prev => {
      const newSet = new Set(prev);
      newSet.delete(sceneNumber);
      return newSet;
    });
  }
};
```

**핸들러 2: 영상 상태 폴링**:
```javascript
const pollVideoStatus = async (taskId, sceneNumber) => {
  const maxAttempts = 40;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const response = await fetch(`${API_BASE}/nexxii/api/video-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId })
    });
    
    const result = await response.json();
    
    if (result.success && result.status === 'COMPLETED') {
      const scene = sortedImages.find(img => img.sceneNumber === sceneNumber);
      scene.videoUrl = result.videoUrl;
      scene.status = 'video_done';
      setSceneVideoStatus(prev => ({ ...prev, [sceneNumber]: 'done' }));
      return;
    } else if (result.status === 'FAILED') {
      throw new Error('영상 생성 실패');
    }
  }
  
  throw new Error('영상 생성 타임아웃');
};
```

**핸들러 3: 전체 확정 및 합성**:
```javascript
const handleConfirmAndCompile = async () => {
  setLoading(true);
  
  try {
    // 1. 영상이 없는 씬들 자동 변환
    const scenesNeedingVideo = sortedImages.filter(img => !img.videoUrl);
    
    if (scenesNeedingVideo.length > 0) {
      for (const scene of scenesNeedingVideo) {
        await handleConvertSceneToVideo(scene.sceneNumber);
      }
    }
    
    // 2. 전체 합성
    const segments = sortedImages
      .filter(img => img.videoUrl)
      .map(img => ({
        sceneNumber: img.sceneNumber,
        videoUrl: img.videoUrl
      }));
    
    const compileResponse = await fetch(`${API_BASE}/nexxii/api/compile-videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segments: segments,
        videoLength: formData?.videoLength || '10초',
        formData: formData,
        mode: formData?.mode,
        jsonMode: true
      })
    });
    
    const compileResult = await compileResponse.json();
    
    if (compileResult.success && compileResult.compiledVideoUrl) {
      if (!storyboard.finalVideos) storyboard.finalVideos = [];
      
      storyboard.finalVideos.push({
        conceptId: selectedConceptId,
        videoUrl: compileResult.compiledVideoUrl,
        metadata: compileResult.metadata
      });
      
      setAllScenesConfirmed(true);
    }
  } catch (err) {
    setError(`영상 확정 및 합성 오류: ${err.message}`);
  } finally {
    setLoading(false);
  }
};
```

**UI 추가**:
```jsx
{/* 씬별 영상 변환 버튼 */}
<button
  onClick={() => handleConvertSceneToVideo(img.sceneNumber)}
  disabled={convertingScenes.has(img.sceneNumber) || loading}
>
  {sceneVideoStatus[img.sceneNumber] === 'converting' 
    ? '영상 변환 중...' 
    : sceneVideoStatus[img.sceneNumber] === 'done'
      ? '✅ 영상 변환 완료'
      : '🎬 이 씬을 영상으로 변환'}
</button>

{/* 영상 미리보기 */}
{img.videoUrl && <video src={getVideoSrc(img.videoUrl)} controls muted />}

{/* 전체 확정 버튼 */}
<button
  onClick={handleConfirmAndCompile}
  disabled={loading || allScenesConfirmed}
>
  {loading ? '처리 중...' : allScenesConfirmed ? '✅ 합성 완료' : '🎬 모든 씬 확정 → 영상 합성'}
</button>

{/* BGM 적용 (합성 완료 후) */}
{allScenesConfirmed && (
  <button onClick={handleApplyBgm}>🎵 BGM 적용</button>
)}
```

---

### 작업F: src/App.jsx

**수정 포인트**:
```javascript
const handleSelectProject = async (project) => {
  setCurrentProject(project);
  
  try {
    const response = await fetch(`/nexxii/api/projects/${project.id}`);
    if (response.ok) {
      const data = await response.json();
      
      if (data.project.storyboard) {
        // 🔥 imageSetMode 확인
        if (data.project.storyboard.imageSetMode) {
          // 이미지 세트만 → Step3
          setStoryboard(data.project.storyboard);
          setCurrentView('step3');
          setStep(3);
        } else if (data.project.storyboard.finalVideos?.length > 0) {
          // 영상 완성 → Step4
          setStoryboard(data.project.storyboard);
          setCurrentView('step4');
          setStep(4);
        } else {
          setCurrentView('step2');
          setStep(2);
        }
        return;
      }
    }
  } catch (error) {
    console.error('[App] 프로젝트 로드 실패:', error);
  }
  
  setCurrentView('mode-select');
};
```

---

## 🚨 예상 리스크

| 리스크 | 영향도 | 해결 방안 |
|--------|--------|-----------|
| 기존 프로젝트 복구 실패 | 🔴 HIGH | imageSetMode 플래그로 신/구 버전 구분 |
| 진행률 계산 오류 | 🟡 MEDIUM | IMAGE 단계를 40% → 95%로 조정 |
| Step3 UI 개편 시 기존 데이터 처리 | 🔴 HIGH | 조건부 렌더링 (imageSetMode 체크) |
| Step4 영상 변환 폴링 무한 대기 | 🟡 MEDIUM | 타임아웃 40회 (2분) 설정 |
| 전체 합성 실패 시 롤백 | 🟡 MEDIUM | try-catch + 에러 메시지 표시 |

---

## 📝 nginx 설정

**파일**: `/etc/nginx/conf.d/nexxii.conf`

```nginx
server {
    listen 80;
    server_name _;
    
    location /videos/ {
        alias /home/ec2-user/projects/ai-ad-video-creator/public/videos/;
        add_header Access-Control-Allow-Origin *;
        expires 30d;
        types { video/mp4 mp4; }
    }
    
    location /tmp/ {
        alias /home/ec2-user/projects/ai-ad-video-creator/tmp/;
        add_header Access-Control-Allow-Origin *;
        expires 1h;
        types { video/mp4 mp4; }
    }
    
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
7. ❌ 하드코딩 예시 코드는 실제 수정 완료 및 사용자 승인 후에만 제거

---

**문서 끝**

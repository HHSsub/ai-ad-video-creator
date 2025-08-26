# AI 광고 영상 제작 웹앱 MVP

AI 기반 자동 광고 영상 스토리보드 생성 도구입니다. 사용자가 브랜드 정보를 입력하면, 브랜드를 분류하고 CapCut API용 JSON 스토리보드 프롬프트를 자동 생성합니다.

## 🚀 주요 기능

### 1단계: 기본 정보 입력
- 브랜드명, 타겟 연령대, 업종, 광고 톤, 광고 목표 입력
- 모든 필드 필수 입력 및 유효성 검사
- 실시간 입력 데이터 미리보기

### 2단계: 브랜드 분류  
- 입력된 브랜드명을 모크 DB와 대조하여 기존/신규 브랜드 분류
- 브랜드 유형에 따른 추천 전략 및 스타일 제안
- 분류 결과에 기반한 비주얼 가이드 제공

### 3단계: 스토리보드 생성
- 사용자 입력을 키워드와 스타일로 매핑
- 6개 장면으로 구성된 스토리보드 자동 생성
- CapCut API 호출용 JSON 프롬프트 완성
- JSON 복사 및 콘솔 출력 기능

## 🛠 기술 스택

- **Frontend**: React 18 (함수형 컴포넌트 + Hooks)
- **UI/Styling**: Tailwind CSS
- **Build Tool**: Vite
- **언어**: JavaScript (ES6+)

## 📁 프로젝트 구조

```
src/
├── components/           # React 컴포넌트
│   ├── Step1.jsx        # 기본 정보 입력 폼
│   ├── Step2.jsx        # 브랜드 분류 결과
│   └── Step3.jsx        # 스토리보드 및 JSON 생성
├── mock/                # 모크 데이터
│   ├── brands.js        # 브랜드 DB 및 분류 로직
│   └── patterns.js      # 브랜드 패턴, 업종/연령대 매핑
├── mappings.js          # 입력→키워드 매핑 및 JSON 생성 로직
└── App.jsx             # 메인 앱 컴포넌트
```

## 🚀 실행 방법

### 설치 및 실행
```bash
# 의존성 설치
pnpm install

# 개발 서버 실행  
pnpm run dev

# 린트 검사
pnpm run lint

# 프로덕션 빌드
pnpm run build
```

### 브라우저에서 접속
```
http://localhost:5173
```

## 💡 사용 방법

1. **1단계**: 브랜드명, 타겟 연령대, 업종, 광고 톤, 광고 목표를 모두 입력
2. **2단계**: 브랜드 분류 결과 확인 및 추천 전략 검토  
3. **3단계**: 생성된 스토리보드 확인 및 JSON 프롬프트 복사

## 🧪 테스트 데이터

### 기존 브랜드 테스트
- 브랜드명: "삼성"
- 결과: 기존 브랜드로 분류되며 전문적인 전략 제안

### 신규 브랜드 테스트  
- 브랜드명: "새로운브랜드"
- 결과: 신규 브랜드로 분류되며 창의적인 전략 제안

## 🔗 CapCut API 연동 가이드

### API 연동 위치
`src/mappings.js`의 `generateFinalPrompt` 함수에서 TODO 주석 위치에 API 호출 코드 추가:

```javascript
// TODO: CapCut API 호출 위치
api_integration: {
  status: "준비완료",
  endpoint: "CapCut API", 
  note: "이 JSON 데이터를 CapCut API로 전송하여 실제 영상 생성"
}
```

### 연동 예시 코드
```javascript
// CapCut API 호출 함수 (예시)
const callCapCutAPI = async (promptData) => {
  const response = await fetch('https://api.capcut.com/v1/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY'
    },
    body: JSON.stringify(promptData)
  });
  
  return await response.json();
};
```

## 📋 수용 기준 검증

✅ **모든 사용자 입력 필수 검증** - 빈 필드 시 에러 메시지 표시  
✅ **브랜드 "삼성" 기존 브랜드 분류** - 전문적 전략 패턴 적용  
✅ **정확히 6개 스토리보드 장면 생성** - 각 장면별 키워드 및 전환효과 포함  
✅ **CapCut API 호출 위치 주석** - mappings.js 파일에 명시  
✅ **모듈화된 확장 가능한 코드** - 컴포넌트 분리 및 한글 주석 완비

## 🔧 확장 포인트

### 1. 백엔드 연동
- 실제 브랜드 데이터베이스 연결
- 사용자 인증 및 프로젝트 저장 기능
- CapCut API 실제 연동

### 2. 고도화 기능
- 스토리보드 미리보기 이미지 생성
- 다양한 영상 템플릿 지원
- A/B 테스트용 다중 버전 생성

### 3. UI/UX 개선
- 드래그 앤 드롭으로 장면 순서 변경
- 실시간 스토리보드 편집
- 더 풍부한 시각적 피드백

## 📝 개발 노트

- 모든 UI 텍스트 및 코드 주석이 한국어로 작성됨
- MVP 단계이므로 핵심 기능에 집중하여 개발됨  
- CapCut API 실제 호출은 제외하고 JSON 생성까지만 구현됨
- 콘솔 출력 및 클립보드 복사 기능으로 개발자 편의성 확보

---

**개발자**: Alex (MetaGPTX Team)  
**프로젝트 타입**: React 기반 웹앱 MVP  
**목적**: AI 광고 영상 제작 파이프라인의 프론트엔드 구현
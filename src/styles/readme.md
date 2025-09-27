# AI Ad Video Creator - Style System

세련되고 고급스러운 디자인 시스템으로, [Coverr.co Studio](https://coverr.co/studio)의 디자인 철학을 바탕으로 제작되었습니다.

## 📁 파일 구조

```
src/styles/
├── main.css                    # 메인 CSS 파일 (모든 스타일을 통합)
├── globals.css                 # 전역 스타일 및 CSS 변수
├── components/                 # UI 컴포넌트 스타일
│   ├── buttons.css            # 버튼 컴포넌트
│   ├── forms.css              # 폼 컴포넌트
│   ├── cards.css              # 카드 컴포넌트
│   └── navigation.css         # 네비게이션 컴포넌트
├── layout/                     # 레이아웃 관련 스타일
│   └── layout.css             # 그리드, 플렉스박스, 컨테이너
├── pages/                      # 페이지별 특화 스타일
│   ├── login.css              # 로그인 페이지
│   ├── dashboard.css          # 대시보드 페이지
│   └── steps.css              # 단계별 폼 페이지
└── utils/                      # 유틸리티 클래스
    ├── animations.css         # 애니메이션 효과
    └── utilities.css          # 헬퍼 클래스

src/components/                 # React 컴포넌트용 CSS 모듈
├── Step1.module.css           # Step1 컴포넌트 전용 스타일
├── Step2.module.css           # Step2 컴포넌트 전용 스타일
└── Step3.module.css           # Step3 컴포넌트 전용 스타일
```

## 🎨 디자인 시스템 특징

### 색상 팔레트
- **다크 테마**: 세련된 검정/회색 기반
- **프라이머리**: 보라색 그라데이션 (#6366f1 → #8b5cf6)
- **액센트**: 성공(녹색), 경고(주황), 오류(빨강)
- **텍스트**: 계층적 투명도로 가독성 최적화

### 타이포그래피
- **폰트**: Inter (주), JetBrains Mono (코드)
- **크기**: 반응형 스케일 (clamp 사용)
- **무게**: 100-900 범위 지원

### 간격 시스템
- **일관된 간격**: CSS 변수로 정의
- **반응형**: 화면 크기에 따라 자동 조정
- **리듬감**: 1.5rem 기반 스케일

### 그림자 효과
- **다층 그림자**: 깊이감 표현
- **글로우 효과**: 상호작용 강조
- **부드러운 전환**: 모든 애니메이션 최적화

## 🚀 사용법

### 1. 메인 CSS 임포트 (App.jsx)

```jsx
// App.jsx
import './styles/main.css';

function App() {
  return (
    <div className="app">
      {/* 앱 내용 */}
    </div>
  );
}
```

### 2. CSS 모듈 사용 (컴포넌트별)

```jsx
// Step1.jsx
import styles from './Step1.module.css';

function Step1() {
  return (
    <div className={styles.step1Container}>
      <div className={styles.stepHeader}>
        <h1 className={styles.stepTitle}>브랜드 정보 입력</h1>
        <p className={styles.stepSubtitle}>광고 영상 제작을 위한 기본 정보를 입력해주세요.</p>
      </div>
      
      <div className={styles.formSection}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>🏢</span>
          브랜드 정보
        </h2>
        
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={`${styles.formLabel} ${styles.required}`}>
              브랜드명
            </label>
            <input 
              type="text" 
              className={styles.formInput}
              placeholder="예: 삼성전자"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 3. 유틸리티 클래스 활용

```jsx
// 임의의 컴포넌트
function Dashboard() {
  return (
    <div className="container mx-auto py-8">
      <div className="grid grid-cols-3 gap-lg">
        <div className="card animate-fade-in-up">
          <h3 className="text-xl font-semibold text-primary mb-4">
            통계
          </h3>
          <p className="text-secondary">
            최근 30일간의 데이터입니다.
          </p>
        </div>
      </div>
    </div>
  );
}
```

## 🧩 주요 컴포넌트 클래스

### 버튼
```css
.btn                    /* 기본 버튼 */
.btn-primary           /* 프라이머리 버튼 */
.btn-secondary         /* 세컨더리 버튼 */
.btn-outline           /* 아웃라인 버튼 */
.btn-ghost             /* 고스트 버튼 */
.btn-lg                /* 큰 버튼 */
.btn-sm                /* 작은 버튼 */
```

### 폼
```css
.form-input            /* 기본 입력 필드 */
.form-textarea         /* 텍스트 영역 */
.form-select           /* 선택 박스 */
.form-checkbox         /* 체크박스 */
.form-radio            /* 라디오 버튼 */
.form-switch           /* 스위치 */
```

### 카드
```css
.card                  /* 기본 카드 */
.card-elevated         /* 부동 효과 카드 */
.card-glass            /* 글래스모피즘 카드 */
.card-interactive      /* 상호작용 카드 */
.card-selectable       /* 선택 가능 카드 */
```

### 애니메이션
```css
.animate-fade-in       /* 페이드 인 */
.animate-slide-in-up   /* 아래에서 위로 슬라이드 */
.animate-zoom-in       /* 줌 인 */
.animate-pulse         /* 펄스 효과 */
.animate-spin          /* 회전 효과 */
```

## 📱 반응형 디자인

### 브레이크포인트
- **모바일**: 480px 이하
- **태블릿**: 768px 이하  
- **데스크톱**: 1024px 이상
- **와이드**: 1400px 이상

### 반응형 클래스
```css
.md\:hidden           /* 태블릿에서 숨김 */
.lg\:grid-cols-3      /* 데스크톱에서 3열 */
.sm\:text-center      /* 모바일에서 중앙 정렬 */
```

## 🎭 애니메이션 시스템

### 기본 애니메이션
- **지속 시간**: 150ms-600ms
- **이징**: ease-out 기본
- **지연**: stagger 효과 지원

### 접근성 고려
```css
@media (prefers-reduced-motion: reduce) {
  /* 애니메이션 비활성화 */
}
```

## 🌟 특별 기능

### AI 브랜딩 요소
```css
.ai-brand              /* AI 브랜드 그라데이션 텍스트 */
.ai-logo               /* AI 로고 컴포넌트 */
.video-player          /* 비디오 플레이어 */
.storyboard-grid       /* 스토리보드 그리드 */
.concept-grid          /* 컨셉 선택 그리드 */
```

### 상태 표시
```css
.ai-status             /* AI 생성 상태 */
.ai-status.processing  /* 처리 중 */
.ai-status.completed   /* 완료 */
.ai-status.error       /* 오류 */
```

## 🔧 커스터마이징

### CSS 변수 수정
```css
:root {
  --accent-primary: #your-color;  /* 프라이머리 색상 변경 */
  --space-md: 1.5rem;             /* 기본 간격 조정 */
  --radius-lg: 12px;              /* 모서리 둥글기 조정 */
}
```

### 새로운 컴포넌트 추가
1. `src/styles/components/` 에 새 CSS 파일 생성
2. `src/styles/main.css` 에서 임포트
3. 네이밍 컨벤션 준수

## 📚 추가 리소스

- **Figma 디자인**: [Coverr.co Studio 분석](https://coverr.co/studio)
- **아이콘**: Google Icons, Heroicons
- **애니메이션 라이브러리**: Framer Motion (선택사항)
- **CSS 프레임워크**: 커스텀 (Tailwind 영감)

## 🤝 기여 가이드

1. 기존 디자인 시스템 규칙 준수
2. 반응형 우선 설계
3. 접근성 고려 필수
4. 성능 최적화 (will-change 등 활용)
5. 브라우저 호환성 확인

---

이 디자인 시스템으로 세련되고 전문적인 AI 광고 영상 제작 도구를 구축할 수 있습니다. 모든 스타일은 모듈화되어 있어 유지보수가 용이하며, Coverr.co Studio의 고급스러운 디자인 철학을 반영했습니다.

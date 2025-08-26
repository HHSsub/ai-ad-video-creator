# GitHub Pages 배포 가이드

## 🌐 GitHub Pages 자동 배포 설정

### 1단계: GitHub 저장소 생성
1. GitHub.com에서 새 저장소 생성
2. 저장소명: `ai-ad-video-creator` (또는 원하는 이름)
3. Public으로 설정 (Pages 사용을 위해)

### 2단계: 코드 업로드
```bash
git init
git add .
git commit -m "Initial commit: AI 광고 영상 제작 웹앱"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

### 3단계: GitHub Actions 설정
1. 저장소 Settings > Pages 이동
2. Source: **GitHub Actions** 선택
3. 코드에 포함된 `.github/workflows/deploy.yml` 자동 실행

### 4단계: 배포 완료 확인
- Actions 탭에서 배포 진행상황 확인
- 성공 시 `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME` 에서 접속 가능

## 🔗 예상 배포 URL
```
https://YOUR_USERNAME.github.io/ai-ad-video-creator
```

## 📋 배포 전 체크리스트
- [x] `vite.config.js`에 `base: './'` 설정됨
- [x] 모든 파일 경로가 상대경로로 설정됨
- [x] `deploy.yml` 워크플로우 파일 포함됨
- [x] 빌드 테스트 통과 (`pnpm run build`)

## 🚀 배포 후 테스트 항목
1. **기본 접속**: 메인 페이지 로딩 확인
2. **1단계**: 폼 입력 및 검증 작동
3. **2단계**: 브랜드 분류 정상 동작
4. **3단계**: JSON 생성 및 출력 확인
5. **반응형**: 모바일/태블릿 화면 확인

## 🛠 배포 문제 해결

### 빌드 실패 시
```bash
# 로컬에서 빌드 테스트
pnpm run build

# 오류 확인 후 수정
pnpm run lint
```

### 페이지 접속 불가 시
1. Settings > Pages에서 Source 재설정
2. Actions 탭에서 배포 로그 확인
3. `base: './'` 설정 확인

### 리소스 로딩 실패 시
- 모든 import 경로가 상대경로인지 확인
- public 폴더의 파일들이 제대로 빌드되는지 확인

## 📈 배포 성능 최적화

### 빌드 최적화
```bash
# 압축된 빌드 생성
pnpm run build

# 빌드 크기 확인
ls -la dist/
```

### 현재 빌드 크기
- `index.html`: 0.49 kB
- `CSS`: 13.88 kB (gzip: 3.33 kB)
- `JavaScript`: 158.06 kB (gzip: 51.28 kB)

## 🔄 업데이트 배포
코드 수정 후:
```bash
git add .
git commit -m "업데이트 내용"
git push
```
자동으로 재배포됩니다.

---
**배포 준비 완료!** 위 가이드를 따라 GitHub Pages에 배포하면 전 세계 어디서나 접속 가능한 웹앱이 됩니다.
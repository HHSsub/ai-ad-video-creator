# 디버깅 가이드 (S3 다운로드 문제)

## 1. 브라우저 콘솔 확인
다운로드 버튼을 클릭했을 때 생성된 URL을 확인하려면:
1. **F12** 키를 눌러 개발자 도구를 엽니다.
2. **Console (콘솔)** 탭을 클릭합니다.
3. [DOWNLOAD] 버튼을 클릭합니다.
4. 아래와 같은 메시지를 찾습니다:
   > `[S3 Download] Opening URL: https://upnexx.ai/nexxii-storage/...`

이 URL이 올바른지 확인하십시오. (`nexxii-storage`가 두 번 반복되면 안 됩니다!)

## 2. CloudFront 직접 테스트
터미널에서 아래 명령어로 파일 접근이 되는지 확인합니다.

```bash
# 예시 URL (콘솔에서 복사한 것)
curl -I "https://upnexx.ai/nexxii-storage/projects/..."

# 정상 응답 코드: 200 OK
# 에러 응답 코드: 403 Forbidden, 404 Not Found
```

## 3. 리다이렉트 원인
만약 `studio.upnexx.ai`로 강제 이동된다면, CloudFront가 403/404 에러 발생 시 커스텀 에러 페이지로 리다이렉트 시키도록 설정되어 있을 확률이 높습니다.
- **403 Forbidden**: 권한 없음 (OAI/OAC 설정 문제 또는 파일 없음)
- **404 Not Found**: 파일 경로가 틀림 (URL 생성 로직 문제)

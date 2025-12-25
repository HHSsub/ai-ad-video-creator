# AWS NEXXII 인프라 설정 및 관리 문서

> **목적**: Nexxii 프로젝트의 모든 AWS 관련 설정, 작업 내역, 트러블슈팅을 통합 관리  
> **최초 작성**: 2025-12-22  
> **최종 업데이트**: 2025-12-22

---

## 📋 목차

1. [현재 인프라 구조](#현재-인프라-구조)
2. [S3 미디어 저장소 구축](#s3-미디어-저장소-구축)
3. [CloudFront 설정](#cloudfront-설정)
4. [IAM 권한 설정](#iam-권한-설정)
5. [코드 구현](#코드-구현)
6. [배포 및 테스트](#배포-및-테스트)
7. [작업 히스토리](#작업-히스토리)
8. [트러블슈팅](#트러블슈팅)

---

## 🏗️ 현재 인프라 구조

### 기존 구조 (2025-12-22 기준)

```
┌─────────────────────────────────────────────────────────────┐
│                     CloudFront (CDN)                        │
│                   upnexx.ai (메인 도메인)                     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│   S3 버킷    │    │   EC2 서버       │    │   S3 버킷    │
│  upnexx.ai   │    │  /nexxii (3000)  │    │studio.upnexx │
│   (정적)     │    │  /nexad (3001)   │    │     .ai      │
└──────────────┘    └──────────────────┘    └──────────────┘
```

### 문제점
- **EC2 용량 제한**: 8GB (현재 거의 가득 차서 위험)
- **이미지 저장 방식**: Freepik API 임시 URL만 저장 → 시간 경과 시 403 에러 발생
- **미디어 파일**: EC2 로컬 디스크에 저장 → 확장성 없음, 백업 어려움

### 해결 방안
- **S3 영구 저장**: 모든 프로젝트 이미지/비디오를 S3에 영구 보관
- **CloudFront CDN**: 빠른 전송 속도 및 EC2 부하 감소
- **자동 백업**: S3 내구성 99.999999999% (11 nines)

**폴더 구조**:
```
nexxii-media-storage/
├── projects/              ← 영구 보관 (사용자 프로젝트)
│   └── {projectId}/
│       ├── images/
│       │   └── concept_{conceptId}_scene_{sceneNumber}.jpg
│       └── videos/
│           └── scene_{sceneNumber}.mp4
├── temp/                  ← 24시간 후 자동 삭제 (임시 파일)
│   └── {sessionId}/
└── nexad-recommendations/ ← 영구 보관 (추천 캐시)
    └── {keyword}/
```

---

## 🎯 S3 미디어 저장소 구축

### Phase 1: S3 버킷 생성 (AWS Console 완전 가이드)

#### 1-1. S3 버킷 생성 - 모든 파라미터 상세

**접속**: [AWS S3 Console](https://s3.console.aws.amazon.com/s3/home?region=ap-northeast-2)

**1단계: 버킷 만들기 클릭**

---

**2단계: 일반 구성**

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| **버킷 이름** | `nexxii-media-storage` | 전역적으로 고유해야 함 |
| **AWS 리전** | `아시아 태평양(서울) ap-northeast-2` | 드롭다운에서 선택 |
| **기존 버킷에서 설정 복사** | 선택 안 함 | 비워두기 |

---

**3단계: 객체 소유권**

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| **객체 소유권** | `ACL 비활성화됨(권장)` | 라디오 버튼 선택 |
| **버킷 소유자 적용** | 자동 체크됨 | 기본값 유지 |

---

**4단계: 이 버킷의 퍼블릭 액세스 차단 설정**

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| **모든 퍼블릭 액세스 차단** | ✅ **체크** | 최상위 체크박스 선택 |
| ↳ 새 ACL을 통해 부여된 버킷 및 객체에 대한 퍼블릭 액세스 차단 | ✅ 체크 | 자동 체크됨 |
| ↳ 임의의 ACL을 통해 부여된 버킷 및 객체에 대한 퍼블릭 액세스 차단 | ✅ 체크 | 자동 체크됨 |
| ↳ 새 퍼블릭 버킷 또는 액세스 지점 정책을 통해 부여된 버킷 및 객체에 대한 퍼블릭 액세스 차단 | ✅ 체크 | 자동 체크됨 |
| ↳ 임의의 퍼블릭 버킷 또는 액세스 지점 정책을 통한 버킷 및 객체에 대한 퍼블릭 및 교차 계정 액세스 차단 | ✅ 체크 | 자동 체크됨 |

> **중요**: CloudFront OAC를 통해서만 접근하므로 모두 차단

---

**5단계: 버킷 버전 관리**

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| **버전 관리** | ⬜ **비활성화** | 체크 안 함 (비용 절감) |

---

**6단계: 태그 - 선택 사항**

| 키 | 값 |
|-----|-----|
| `Project` | `nexxii` |
| `Environment` | `production` |
| `ManagedBy` | `terraform` (또는 `manual`) |

---

**7단계: 기본 암호화**

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| **암호화 유형** | `서버 측 암호화(Amazon S3 관리형 키(SSE-S3))` | 라디오 버튼 선택 |
| **버킷 키** | ✅ **활성화** | 체크 (비용 절감) |

> **참고**: SSE-S3는 무료, SSE-KMS는 유료

---

**8단계: 고급 설정**

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| **객체 잠금** | ⬜ **비활성화** | 체크 안 함 |

---

**9단계: 버킷 만들기 클릭**

✅ 생성 완료 후 버킷 목록에서 `nexxii-media-storage` 확인

---

#### 1-2. S3 버킷 CORS 설정

**경로**: S3 Console → `nexxii-media-storage` 버킷 클릭 → **권한** 탭

**스크롤 다운**: "CORS(Cross-Origin Resource Sharing)" 섹션 찾기

**편집 클릭** → 아래 JSON 붙여넣기:

```json
[
  {
    "AllowedHeaders": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedOrigins": [
      "https://upnexx.ai",
      "http://localhost:5173"
    ],
    "ExposeHeaders": [
      "ETag",
      "x-amz-meta-custom-header"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

**변경 사항 저장** 클릭

---

#### 1-3. S3 수명 주기 규칙 설정 (임시 파일 자동 삭제)

**경로**: S3 Console → `nexxii-media-storage` → **관리** 탭

**수명 주기 규칙 생성** 클릭

---

**규칙 구성**:

| 파라미터 | 값 |
|---------|-----|
| **수명 주기 규칙 이름** | `DeleteTempFilesAfter24Hours` |
| **규칙 범위 선택** | `하나 이상의 필터를 사용하여 이 규칙의 범위 제한` (라디오 버튼) |
| **접두사** | `temp/` |
| **객체 태그** | 비워두기 |
| **객체 크기** | 비워두기 |

**다음** 클릭

---

**수명 주기 규칙 작업**:

| 파라미터 | 값 |
|---------|-----|
| **현재 버전의 객체 만료** | ✅ **체크** |
| **객체의 현재 버전 만료** | `1` 일 |
| **이전 버전의 객체를 영구적으로 삭제** | ⬜ 체크 안 함 (버전 관리 비활성화됨) |
| **만료된 객체 삭제 마커 또는 불완전한 멀티파트 업로드 삭제** | ✅ **체크** |
| **불완전한 멀티파트 업로드 삭제** | `1` 일 |

**다음** 클릭 → **규칙 생성** 클릭

---

> **중요**: 이 규칙은 **temp/** 폴더만 해당됩니다.  
> **projects/** 폴더의 이미지/비디오는 영구 보관되며 자동 삭제되지 않습니다.  
> temp/ 폴더는 이미지 생성 중 임시 파일 저장용으로만 사용됩니다.

---

**폴더별 보관 정책**:

| 폴더 | 보관 기간 | 용도 |
|------|----------|------|
| `projects/` | **영구 보관** | 사용자 프로젝트 이미지/비디오 |
| `temp/` | 24시간 후 삭제 | 이미지 생성 중 임시 파일 |
| `nexad-recommendations/` | **영구 보관** | Nexad 추천 캐시 |

---

#### 1-4. 폴더 구조 생성 (선택사항)

S3는 실제 폴더가 없지만, 시각적 구조를 위해 빈 객체 생성 가능:

**경로**: S3 Console → `nexxii-media-storage` → **객체** 탭

**폴더 생성** 클릭:
- `projects/`
- `temp/`
- `nexad-recommendations/`

> **참고**: 코드에서 자동으로 경로 생성되므로 이 단계는 선택사항

---

### Phase 2: CloudFront 설정 (완전 가이드)

#### 2-1. CloudFront Distribution 확인

**접속**: [CloudFront Console](https://console.aws.amazon.com/cloudfront/v3/home)

**기존 Distribution 찾기**:
- 도메인: `upnexx.ai`에 해당하는 Distribution 클릭
- Distribution ID 복사 (예: `E1234567890ABC`)
- AWS 계정 ID 확인: 우측 상단 계정 드롭다운 → 12자리 숫자

---

#### 2-2. Origin Access Control (OAC) 생성

**경로**: CloudFront Console → 좌측 메뉴 **Origin access** → **Create control setting**

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| **Name** | `nexxii-media-oac` | 식별 가능한 이름 |
| **Description** | `OAC for nexxii media storage` | 선택사항 |
| **Signing behavior** | `Sign requests (recommended)` | 라디오 버튼 선택 |
| **Origin type** | `S3` | 라디오 버튼 선택 |

**Create** 클릭 → OAC ARN 복사 (나중에 S3 버킷 정책에 사용)

---

#### 2-3. CloudFront Origin 추가

**경로**: CloudFront Console → Distribution 선택 → **Origins** 탭 → **Create origin**

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| **Origin domain** | `nexxii-media-storage.s3.ap-northeast-2.amazonaws.com` | 드롭다운에서 선택 (자동 완성) |
| **Origin path** | 비워두기 | 공백 유지 |
| **Name** | `nexxii-s3-media` | 자동 생성됨, 수정 가능 |
| **Origin access** | `Origin access control settings (recommended)` | 라디오 버튼 선택 |
| **Origin access control** | `nexxii-media-oac` | 드롭다운에서 방금 생성한 OAC 선택 |
| **Enable Origin Shield** | `No` | 라디오 버튼 선택 (비용 절감) |
| **Additional settings** | 모두 기본값 | 펼치지 않음 |

**Create origin** 클릭

> ⚠️ **중요**: 생성 후 파란색 배너가 나타남: "The S3 bucket policy needs to be updated"  
> → **Copy policy** 클릭 → S3 버킷 정책에 붙여넣기 (다음 단계)

---

#### 2-4. S3 버킷 정책 업데이트 (OAC 권한 부여)

**경로**: S3 Console → `nexxii-media-storage` → **권한** 탭 → **버킷 정책** → **편집**

**CloudFront에서 복사한 정책 붙여넣기** (또는 아래 템플릿 사용):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipalReadOnly",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::nexxii-media-storage/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/YOUR_DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

**교체 필요**:
- `YOUR_ACCOUNT_ID`: 12자리 AWS 계정 ID
- `YOUR_DISTRIBUTION_ID`: CloudFront Distribution ID (예: `E1234567890ABC`)

**변경 사항 저장** 클릭

---

#### 2-5. CloudFront Behavior 추가

**경로**: CloudFront Console → Distribution 선택 → **Behaviors** 탭 → **Create behavior**

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| **Path pattern** | `/nexxii-storage/*` | 정확히 입력 |
| **Origin and origin groups** | `nexxii-s3-media` | 드롭다운에서 선택 |
| **Viewer protocol policy** | `Redirect HTTP to HTTPS` | 라디오 버튼 선택 |
| **Allowed HTTP methods** | `GET, HEAD, OPTIONS` | 라디오 버튼 선택 |
| **Restrict viewer access** | `No` | 라디오 버튼 선택 |
| **Cache key and origin requests** | | |
| ↳ **Cache policy** | `CachingOptimized` | 드롭다운에서 선택 |
| ↳ **Origin request policy** | `CORS-S3Origin` | 드롭다운에서 선택 |
| ↳ **Response headers policy** | `SimpleCORS` | 드롭다운에서 선택 |
| **Compress objects automatically** | `Yes` | 라디오 버튼 선택 (권장) |
| **Function associations** | 비워두기 | 설정 안 함 |

**Create behavior** 클릭

---

#### 2-6. Behavior 우선순위 조정 (중요!)

**경로**: CloudFront Console → Distribution → **Behaviors** 탭

**현재 순서 확인**:
```
Precedence | Path Pattern      | Origin
-----------|-------------------|------------------
0          | Default (*)       | S3 upnexx.ai
1          | /nexxii/*         | EC2 (기존)
2          | /nexad/*          | EC2 (기존)
3          | /nexxii-storage/* | S3 nexxii-media (새로 추가)
```

**목표 순서** (Path가 더 구체적일수록 우선):
```
Precedence | Path Pattern      | Origin
-----------|-------------------|------------------
0          | /nexxii-storage/* | S3 nexxii-media ✅
1          | /nexxii/*         | EC2
2          | /nexad/*          | EC2
3          | Default (*)       | S3 upnexx.ai
```

**조정 방법**:
1. `/nexxii-storage/*` Behavior 체크박스 선택
2. **Move up** 버튼 클릭 (또는 드래그)
3. Precedence 0이 될 때까지 반복

**변경 사항 저장** → Distribution 배포 대기 (5-10분)

---

#### 2-7. CloudFront Invalidation (캐시 초기화)

**경로**: CloudFront Console → Distribution → **Invalidations** 탭 → **Create invalidation**

| 파라미터 | 값 |
|---------|-----|
| **Object paths** | `/nexxii-storage/*` |

**Create invalidation** 클릭

> **참고**: 새 Behavior 추가 시 필수는 아니지만, 테스트 시 캐시 문제 방지

---

## 🔐 IAM 권한 설정 (완전 가이드)

### Phase 3: EC2 IAM Role 설정

#### 3-1. 현재 EC2 IAM Role 확인

**EC2에서 실행**:
```bash
# Role 이름 확인
curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/

# 출력 예: ec2-nexxii-role
```

**또는 AWS Console에서 확인**:
1. EC2 Console → **인스턴스** → Nexxii EC2 선택
2. **보안** 탭 → **IAM 역할** 확인

---

#### 3-2. IAM Policy 생성

**접속**: [IAM Console - Policies](https://console.aws.amazon.com/iam/home#/policies)

**Create policy** 클릭

---

**Policy editor 선택**: `JSON` 탭 클릭

**아래 JSON 붙여넣기**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "NexxiiProjectMediaAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject",
        "s3:GetObjectAcl",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::nexxii-media-storage/projects/*"
    },
    {
      "Sid": "NexxiiTempAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::nexxii-media-storage/temp/*"
    },
    {
      "Sid": "NexadRecommendationsAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::nexxii-media-storage/nexad-recommendations/*"
    },
    {
      "Sid": "ListBucketAccess",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::nexxii-media-storage",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "projects/*",
            "temp/*",
            "nexad-recommendations/*"
          ]
        }
      }
    }
  ]
}
```

**Next** 클릭

---

**Policy details**:

| 파라미터 | 값 |
|---------|-----|
| **Policy name** | `NexxiiS3MediaAccess` |
| **Description** | `Nexxii 프로젝트 미디어 파일 S3 접근 권한` |
| **Tags** (선택) | `Project: nexxii` |

**Create policy** 클릭

---

#### 3-3. EC2 IAM Role에 Policy 연결

**접속**: [IAM Console - Roles](https://console.aws.amazon.com/iam/home#/roles)

**EC2 Role 검색**: 3-1에서 확인한 Role 이름 입력 (예: `ec2-nexxii-role`)

**Role 클릭** → **Permissions** 탭

**Add permissions** 드롭다운 → **Attach policies** 선택

**검색창**: `NexxiiS3MediaAccess` 입력

**체크박스 선택** → **Add permissions** 클릭

---

#### 3-4. 권한 적용 확인

**EC2에서 테스트**:
```bash
# AWS CLI 설치 확인
aws --version

# S3 버킷 리스트 (ListBucket 권한 테스트)
aws s3 ls s3://nexxii-media-storage/

# 예상 출력:
# PRE projects/
# PRE temp/
# PRE nexad-recommendations/
```

**권한 오류 시**:
```bash
# EC2 재시작 (IAM Role 갱신)
sudo reboot
```

---

## 💻 코드 구현

### Phase 4: 백엔드 구현

#### 4-1. AWS SDK 설치

```bash
cd /home/ec2-user/projects/ai-ad-video-creator
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```

**package.json 업데이트**:
```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.700.0",
    "@aws-sdk/lib-storage": "^3.700.0"
  }
}
```

#### 4-2. S3 업로드 유틸리티 생성

**파일**: `server/utils/s3-uploader.js`

```javascript
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fetch from 'node-fetch';

const s3Client = new S3Client({
  region: 'ap-northeast-2',
  // EC2 IAM Role 사용 (자동 인증)
});

const BUCKET_NAME = 'nexxii-media-storage';
const CDN_BASE_URL = 'https://upnexx.ai/nexxii-storage';

/**
 * 외부 URL에서 이미지 다운로드 후 S3 업로드
 * @param {string} imageUrl - Freepik/SEEDREAM 임시 URL
 * @param {string} projectId - 프로젝트 ID
 * @param {number} conceptId - 컨셉 ID
 * @param {number} sceneNumber - 씬 번호
 * @returns {Promise<string>} S3 URL (CloudFront 경로)
 */
export async function uploadImageToS3(imageUrl, projectId, conceptId, sceneNumber) {
  try {
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
  } catch (error) {
    console.error(`[S3] ❌ 업로드 실패:`, error);
    throw error;
  }
}

/**
 * 비디오 파일 S3 업로드
 */
export async function uploadVideoToS3(videoUrl, projectId, conceptId, sceneNumber) {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`비디오 다운로드 실패: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const s3Key = `projects/${projectId}/videos/concept_${conceptId}_scene_${sceneNumber}.mp4`;
    
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: Buffer.from(buffer),
        ContentType: 'video/mp4',
        CacheControl: 'public, max-age=31536000',
      },
    });
    
    await upload.done();
    
    const cdnUrl = `${CDN_BASE_URL}/${s3Key}`;
    console.log(`[S3] ✅ 비디오 업로드 완료: ${cdnUrl}`);
    
    return cdnUrl;
  } catch (error) {
    console.error(`[S3] ❌ 비디오 업로드 실패:`, error);
    throw error;
  }
}

/**
 * S3 파일 삭제
 */
export async function deleteFromS3(s3Url) {
  try {
    // CloudFront URL에서 S3 키 추출
    const s3Key = s3Url.replace(`${CDN_BASE_URL}/`, '');
    
    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    }));
    
    console.log(`[S3] ✅ 삭제 완료: ${s3Key}`);
  } catch (error) {
    console.error(`[S3] ❌ 삭제 실패:`, error);
    throw error;
  }
}

export default {
  uploadImageToS3,
  uploadVideoToS3,
  deleteFromS3,
};
```

#### 4-3. storyboard-init.js 수정

**파일**: `api/storyboard-init.js`

**수정 위치**: 이미지 생성 후 S3 업로드 추가

```javascript
import { uploadImageToS3 } from '../server/utils/s3-uploader.js';

// ... 기존 코드 ...

// 이미지 생성 루프 (Line 700-800 근처)
for (let styleIdx = 0; styleIdx < styles.length; styleIdx++) {
  const style = styles[styleIdx];
  
  for (let imgIdx = 0; imgIdx < style.images.length; imgIdx++) {
    const img = style.images[imgIdx];
    
    // 1. Freepik API로 이미지 생성
    const freepikUrl = await generateImageWithFreepik(img.prompt);
    
    // 2. 🔥 S3에 업로드 (임시 URL → 영구 URL)
    try {
      const s3Url = await uploadImageToS3(
        freepikUrl,
        projectId,
        style.conceptId,
        img.sceneNumber
      );
      
      // 3. S3 URL 저장 (임시 URL 대신)
      img.imageUrl = s3Url;
      img.s3Uploaded = true;
      
      console.log(`[Storyboard] ✅ S3 업로드 완료: Scene ${img.sceneNumber}`);
    } catch (s3Error) {
      console.error(`[Storyboard] ⚠️ S3 업로드 실패, 임시 URL 사용:`, s3Error);
      // Fallback: 임시 URL 사용
      img.imageUrl = freepikUrl;
      img.s3Uploaded = false;
    }
  }
}
```

#### 4-4. Nexad 광고 추천 API (엑셀 파일 연동)

**파일**: `api/nexad-recommendations.js` (신규)

```javascript
import express from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'nexxii-media-storage';

// Nexad 엑셀 파일 경로 (EC2에 저장된 파일)
const NEXAD_EXCEL_PATH = '/home/ec2-user/nexad-data/ad-analysis.xlsx';

/**
 * POST /api/nexad-recommendations
 * Body: { 
 *   keywords: string[], 
 *   brandName: string,
 *   productCategory: string 
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { keywords, brandName, productCategory } = req.body;
    
    if (!keywords || keywords.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '키워드를 입력해주세요' 
      });
    }
    
    // 1. 캐시 확인 (S3)
    const cacheKey = `nexad-recommendations/${keywords.join('_')}_${brandName || 'default'}.json`;
    
    try {
      const cached = await s3Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: cacheKey,
      }));
      
      const cachedData = JSON.parse(await cached.Body.transformToString());
      console.log('[Nexad] 캐시 히트:', cacheKey);
      return res.json({ success: true, recommendations: cachedData, cached: true });
    } catch (cacheError) {
      console.log('[Nexad] 캐시 미스, 엑셀 파일 읽기 시작');
    }
    
    // 2. Nexad 엑셀 파일 읽기
    if (!fs.existsSync(NEXAD_EXCEL_PATH)) {
      throw new Error(`Nexad 엑셀 파일을 찾을 수 없습니다: ${NEXAD_EXCEL_PATH}`);
    }
    
    const workbook = XLSX.readFile(NEXAD_EXCEL_PATH);
    const sheetName = workbook.SheetNames[0]; // 첫 번째 시트
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`[Nexad] 엑셀 데이터 로드 완료: ${data.length}개 행`);
    
    // 3. 키워드 매칭 로직 (간단한 구현)
    const recommendations = data
      .filter(row => {
        // 키워드가 제목, 설명, 카테고리 중 하나라도 포함되면 매칭
        const searchText = `${row.title || ''} ${row.description || ''} ${row.category || ''}`.toLowerCase();
        return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
      })
      .map(row => ({
        videoId: row.video_id || row.videoId,
        title: row.title,
        thumbnail: row.thumbnail || `https://i.ytimg.com/vi/${row.video_id}/hqdefault.jpg`,
        url: row.url || `https://www.youtube.com/watch?v=${row.video_id}`,
        category: row.category,
        views: row.views,
        uploadDate: row.upload_date || row.uploadDate,
        relevance: calculateRelevance(row, keywords, brandName, productCategory)
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 10); // 상위 10개만
    
    console.log(`[Nexad] 매칭된 광고: ${recommendations.length}개`);
    
    // 4. S3에 캐시 저장
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: cacheKey,
        Body: JSON.stringify(recommendations),
        ContentType: 'application/json',
        CacheControl: 'max-age=86400', // 24시간
      }));
      console.log('[Nexad] S3 캐시 저장 완료');
    } catch (s3Error) {
      console.error('[Nexad] S3 캐시 저장 실패:', s3Error);
      // 캐시 실패해도 결과는 반환
    }
    
    res.json({ success: true, recommendations, cached: false });
  } catch (error) {
    console.error('[Nexad] 추천 실패:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 관련도 계산 (0-1 사이 값)
 */
function calculateRelevance(row, keywords, brandName, productCategory) {
  let score = 0;
  const searchText = `${row.title || ''} ${row.description || ''} ${row.category || ''}`.toLowerCase();
  
  // 키워드 매칭 (각 키워드당 0.3점)
  keywords.forEach(keyword => {
    if (searchText.includes(keyword.toLowerCase())) {
      score += 0.3;
    }
  });
  
  // 브랜드명 매칭 (0.2점)
  if (brandName && searchText.includes(brandName.toLowerCase())) {
    score += 0.2;
  }
  
  // 카테고리 매칭 (0.2점)
  if (productCategory && searchText.includes(productCategory.toLowerCase())) {
    score += 0.2;
  }
  
  // 조회수 보너스 (최대 0.3점)
  if (row.views) {
    const viewsScore = Math.min(row.views / 1000000, 1) * 0.3; // 100만 뷰 = 0.3점
    score += viewsScore;
  }
  
  return Math.min(score, 1); // 최대 1.0
}

export default router;
```

**server/index.js에 라우터 추가**:
```javascript
import nexadRecommendationsRouter from '../api/nexad-recommendations.js';
app.use('/api/nexad-recommendations', nexadRecommendationsRouter);
```

**package.json 의존성 추가**:
```json
{
  "dependencies": {
    "xlsx": "^0.18.5"
  }
}
```

**설치**:
```bash
npm install xlsx
```

---

#### 4-5. Nexad 엑셀 파일 구조 예시

**파일 위치**: `/home/ec2-user/nexad-data/ad-analysis.xlsx`

**필수 컬럼**:

| 컬럼명 | 설명 | 예시 |
|--------|------|------|
| `video_id` | YouTube 비디오 ID | `dQw4w9WgXcQ` |
| `title` | 광고 제목 | `삼성 갤럭시 S24 광고` |
| `description` | 광고 설명 | `혁신적인 AI 카메라...` |
| `category` | 카테고리 | `전자제품`, `스마트폰` |
| `url` | YouTube URL | `https://youtube.com/watch?v=...` |
| `thumbnail` | 썸네일 URL (선택) | `https://i.ytimg.com/...` |
| `views` | 조회수 | `1234567` |
| `upload_date` | 업로드 날짜 | `2024-01-15` |

**엑셀 파일 예시**:
```
| video_id     | title              | category  | views   | upload_date |
|--------------|--------------------|-----------|---------|-------------|
| abc123       | 삼성 갤럭시 광고    | 스마트폰  | 1500000 | 2024-01-10  |
| def456       | LG 냉장고 광고      | 가전제품  | 800000  | 2024-02-15  |
```

---

#### 4-6. Step3/4에서 Nexad 추천 호출

**Step3.jsx 수정** (컨셉 선택 후 추천 표시):

```javascript
const [recommendations, setRecommendations] = useState([]);

useEffect(() => {
  if (selectedConceptId && formData.brandName) {
    fetchRecommendations();
  }
}, [selectedConceptId]);

const fetchRecommendations = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/nexad-recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-username': user?.username || 'anonymous'
      },
      body: JSON.stringify({
        keywords: [
          formData.productServiceName,
          formData.industryCategory,
          formData.coreTarget
        ].filter(Boolean),
        brandName: formData.brandName,
        productCategory: formData.productServiceCategory
      })
    });
    
    const data = await response.json();
    if (data.success) {
      setRecommendations(data.recommendations);
      console.log('[Step3] 추천 광고:', data.recommendations.length);
    }
  } catch (error) {
    console.error('[Step3] 추천 로드 실패:', error);
  }
};
```

**UI 추가**:
```jsx
{recommendations.length > 0 && (
  <div className="mt-6 bg-gray-900/50 rounded-xl p-6 border border-gray-700">
    <h4 className="text-lg font-semibold text-white mb-4">
      📺 유사한 광고 영상 추천 (Nexad 분석)
    </h4>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {recommendations.slice(0, 6).map((rec, idx) => (
        <a
          key={idx}
          href={rec.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:opacity-80 transition"
        >
          <img
            src={rec.thumbnail}
            alt={rec.title}
            className="w-full aspect-video object-cover rounded-lg border border-gray-600"
          />
          <p className="text-xs text-gray-400 mt-2 line-clamp-2">
            {rec.title}
          </p>
          <p className="text-xs text-gray-500">
            관련도: {(rec.relevance * 100).toFixed(0)}%
          </p>
        </a>
      ))}
    </div>
  </div>
)}
```

---

## 🚀 배포 및 테스트

### Phase 5: EC2 배포

#### 5-1. 코드 배포

```bash
# 로컬에서
git add .
git commit -m "feat: S3 미디어 저장소 연동 및 YouTube 추천 API 추가"
git push origin main

# EC2에서
cd /home/ec2-user/projects/ai-ad-video-creator
git pull origin main
npm install
pm2 restart all
```

#### 5-2. 테스트

**1. S3 업로드 테스트**:
```bash
# EC2에서
node -e "
import('./server/utils/s3-uploader.js').then(async (module) => {
  const testUrl = 'https://via.placeholder.com/800x600.jpg';
  const result = await module.uploadImageToS3(testUrl, 'test_project', 1, 1);
  console.log('✅ 테스트 성공:', result);
});
"
```

**2. CloudFront 접근 테스트**:
```bash
curl -I https://upnexx.ai/nexxii-storage/projects/test_project/images/concept_1_scene_1.jpg
# 예상: HTTP/2 200
```

**3. 전체 플로우 테스트**:
1. 프로젝트 생성
2. Auto 모드 → 이미지 생성
3. 개발자 도구 → Network 탭
4. 이미지 URL 확인: `https://upnexx.ai/nexxii-storage/projects/...` 형식인지 확인

---

## 📚 작업 히스토리

### 2025-12-22: S3 미디어 저장소 초기 구축

#### 작업 내용
- [x] S3 버킷 생성 (`nexxii-media-storage`)
- [x] CloudFront Origin 및 Behavior 추가
- [x] IAM Policy 생성 및 EC2 Role 연결
- [x] `server/utils/s3-uploader.js` 구현
- [x] `api/storyboard-init.js` S3 업로드 로직 추가
- [x] `api/youtube-recommendations.js` 간단 구현
- [ ] 실제 YouTube Data API 연동 (추후)

#### 변경 파일
- `server/utils/s3-uploader.js` (신규)
- `api/youtube-recommendations.js` (신규)
- `api/storyboard-init.js` (수정)
- `server/index.js` (수정)
- `package.json` (수정)

#### 테스트 결과
- 대기 중

---

## 🔧 트러블슈팅

### 문제 1: S3 업로드 시 403 Forbidden

**증상**:
```
AccessDenied: User: arn:aws:sts::ACCOUNT:assumed-role/EC2-Role/i-xxxxx is not authorized to perform: s3:PutObject
```

**원인**: EC2 IAM Role에 S3 권한 없음

**해결**:
1. IAM Console → 역할 → EC2 Role 확인
2. `NexxiiS3MediaAccess` Policy 연결 확인
3. EC2 재시작 (Role 갱신)

---

### 문제 2: CloudFront에서 S3 접근 불가

**증상**: `https://upnexx.ai/nexxii-storage/...` 접근 시 403

**원인**: S3 버킷 정책에 CloudFront OAC 권한 없음

**해결**:
1. S3 버킷 정책에 CloudFront ARN 추가
2. CloudFront Invalidation 생성: `/*`

---

### 문제 3: CORS 에러

**증상**: 브라우저 콘솔에 CORS 에러

**원인**: S3 CORS 정책 미설정

**해결**:
1. S3 Console → 권한 → CORS 편집
2. `AllowedOrigins`에 `https://upnexx.ai` 추가

---

## 📊 비용 예상

### S3 저장 비용 (서울 리전)

| 항목 | 단가 | 예상 사용량 | 월 비용 |
|------|------|------------|---------|
| 저장 | $0.025/GB | 50GB (1000개 프로젝트) | $1.25 |
| PUT 요청 | $0.005/1000 | 10,000 요청 | $0.05 |
| GET 요청 | $0.0004/1000 | 100,000 요청 | $0.04 |
| **합계** | | | **$1.34/월** |

### CloudFront 비용

- 첫 10TB: $0.085/GB
- 예상 전송량: 100GB/월 = **$8.50/월**

**총 예상 비용**: **~$10/월** (매우 저렴)

---

## 🔗 참고 자료

- [AWS S3 공식 문서](https://docs.aws.amazon.com/s3/)
- [CloudFront OAC 설정](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/)
- [YouTube Data API v3](https://developers.google.com/youtube/v3)

---

**다음 작업**: YouTube Data API 키 발급 및 실제 추천 로직 구현

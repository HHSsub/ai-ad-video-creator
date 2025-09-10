// load-bgm-list.js
export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('BGM 목록 로딩 시작...');

    // Google Drive에서 BGM 파일들 검색
    let driveBGMs = [];
    
    try {
      driveBGMs = await searchGoogleDriveBGMs();
      console.log(`Google Drive에서 ${driveBGMs.length}개 BGM 발견`);
    } catch (error) {
      console.error('Google Drive BGM 검색 오류:', error);
      // Drive 접근 실패시 로그만 남기고 계속 진행
    }

    // 온라인 무료 BGM 목록 (백업용)
    const onlineBGMs = [
      {
        name: '밝고 경쾌한 코퍼레이트 BGM',
        url: 'https://www.soundjay.com/misc/sounds/corporate-1.mp3',
        type: 'online',
        duration: 120,
        genre: 'corporate',
        mood: 'upbeat',
        description: '비즈니스 프레젠테이션에 적합한 밝은 분위기의 BGM'
      },
      {
        name: '차분한 어쿠스틱 BGM',
        url: 'https://www.soundjay.com/misc/sounds/acoustic-1.mp3',
        type: 'online',
        duration: 180,
        genre: 'acoustic',
        mood: 'calm',
        description: '감성적이고 따뜻한 어쿠스틱 기타 연주곡'
      },
      {
        name: '모던 일렉트로닉 BGM',
        url: 'https://www.soundjay.com/misc/sounds/electronic-1.mp3',
        type: 'online',
        duration: 150,
        genre: 'electronic',
        mood: 'modern',
        description: '현대적이고 세련된 전자음악 스타일'
      },
      {
        name: '감성적인 피아노 BGM',
        url: 'https://www.soundjay.com/misc/sounds/piano-1.mp3',
        type: 'online',
        duration: 200,
        genre: 'piano',
        mood: 'emotional',
        description: '감동적인 피아노 솔로 연주곡'
      },
      {
        name: '역동적인 비트 BGM',
        url: 'https://www.soundjay.com/misc/sounds/energetic-1.mp3',
        type: 'online',
        duration: 90,
        genre: 'beat',
        mood: 'energetic',
        description: '활기찬 리듬감의 에너지 넘치는 BGM'
      },
      {
        name: '고급스러운 재즈 BGM',
        url: 'https://www.soundjay.com/misc/sounds/jazz-1.mp3',
        type: 'online',
        duration: 240,
        genre: 'jazz',
        mood: 'sophisticated',
        description: '세련되고 고급스러운 재즈 연주곡'
      }
    ];

    // Drive BGM과 온라인 BGM 합치기
    const allBGMs = [...driveBGMs, ...onlineBGMs];

    // 사용자 브랜드/업종에 맞는 BGM 추천 (선택적 기능)
    const recommendedBGMs = recommendBGMsForProject(allBGMs, req.query);

    const response = {
      success: true,
      bgmList: allBGMs,
      recommended: recommendedBGMs,
      statistics: {
        total: allBGMs.length,
        fromDrive: driveBGMs.length,
        fromOnline: onlineBGMs.length,
        genres: [...new Set(allBGMs.map(bgm => bgm.genre))],
        moods: [...new Set(allBGMs.map(bgm => bgm.mood))]
      },
      metadata: {
        loadedAt: new Date().toISOString(),
        driveStatus: driveBGMs.length > 0 ? 'connected' : 'unavailable'
      }
    };

    console.log('BGM 목록 로딩 완료:', {
      총개수: allBGMs.length,
      Drive: driveBGMs.length,
      온라인: onlineBGMs.length
    });

    res.status(200).json(response);

  } catch (error) {
    console.error('BGM 목록 로딩 중 전체 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Google Drive에서 BGM 파일들을 검색하는 함수
 */
async function searchGoogleDriveBGMs() {
  try {
    // Google Drive API 설정이 필요한 부분
    // 실제 구현시에는 Google Drive API 키와 OAuth 설정 필요
    
    console.log('Google Drive BGM 검색 시작...');

    // 임시로 빈 배열 반환 (실제 구현 필요)
    // 실제 구현 예시:
    /*
    const { google } = require('googleapis');
    const drive = google.drive({ version: 'v3', auth: authClient });
    
    const response = await drive.files.list({
      q: "mimeType contains 'audio/' and parents in 'DRIVE_FOLDER_ID'",
      fields: 'files(id, name, size, mimeType, webViewLink, webContentLink)',
      pageSize: 50
    });
    
    return response.data.files.map(file => ({
      name: file.name.replace(/\.[^/.]+$/, ""), // 확장자 제거
      url: file.webContentLink,
      type: 'drive',
      driveId: file.id,
      size: file.size,
      mimeType: file.mimeType,
      duration: null, // 메타데이터에서 추출 필요
      genre: detectGenreFromFileName(file.name),
      mood: detectMoodFromFileName(file.name),
      description: `Google Drive: ${file.name}`
    }));
    */

    // 현재는 빈 배열 반환
    return [];

  } catch (error) {
    console.error('Google Drive BGM 검색 실패:', error);
    return [];
  }
}

/**
 * 프로젝트 정보에 맞는 BGM 추천
 */
function recommendBGMsForProject(bgmList, projectQuery) {
  const { industry, tone, targetAge, brand } = projectQuery;

  if (!industry && !tone) {
    // 기본 추천: 처음 3개
    return bgmList.slice(0, 3);
  }

  // 업종별 BGM 매칭
  const industryMapping = {
    'IT/소프트웨어': ['electronic', 'modern', 'corporate'],
    '패션/뷰티': ['modern', 'sophisticated', 'emotional'],
    '식품/음료': ['acoustic', 'warm', 'natural'],
    '자동차': ['energetic', 'powerful', 'modern'],
    '금융': ['corporate', 'professional', 'calm'],
    '교육': ['calm', 'inspiring', 'acoustic'],
    '헬스케어': ['calm', 'gentle', 'piano'],
    '여행/레저': ['upbeat', 'adventurous', 'inspiring'],
    '스포츠': ['energetic', 'beat', 'powerful']
  };

  // 톤별 BGM 매칭
  const toneMapping = {
    '감성적': ['emotional', 'piano', 'acoustic'],
    '전문적': ['corporate', 'professional', 'modern'],
    '유머러스': ['upbeat', 'playful', 'energetic'],
    '고급스러운': ['sophisticated', 'jazz', 'elegant'],
    '친근한': ['warm', 'acoustic', 'gentle'],
    '역동적': ['energetic', 'beat', 'powerful']
  };

  const preferredGenres = [
    ...(industryMapping[industry] || []),
    ...(toneMapping[tone] || [])
  ];

  // 선호 장르에 맞는 BGM 필터링 및 점수 계산
  const scoredBGMs = bgmList.map(bgm => {
    let score = 0;
    
    if (preferredGenres.includes(bgm.genre)) score += 3;
    if (preferredGenres.includes(bgm.mood)) score += 2;
    if (bgm.type === 'drive') score += 1; // Drive BGM 약간 우선

    return { ...bgm, score };
  });

  // 점수순으로 정렬하여 상위 3개 추천
  return scoredBGMs
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * 파일명에서 장르 추론 (간단한 키워드 매칭)
 */
function detectGenreFromFileName(fileName) {
  const lower = fileName.toLowerCase();
  
  if (lower.includes('jazz')) return 'jazz';
  if (lower.includes('piano')) return 'piano';
  if (lower.includes('acoustic') || lower.includes('guitar')) return 'acoustic';
  if (lower.includes('electronic') || lower.includes('synth')) return 'electronic';
  if (lower.includes('corporate') || lower.includes('business')) return 'corporate';
  if (lower.includes('beat') || lower.includes('drum')) return 'beat';
  
  return 'unknown';
}

/**
 * 파일명에서 분위기 추론
 */
function detectMoodFromFileName(fileName) {
  const lower = fileName.toLowerCase();
  
  if (lower.includes('calm') || lower.includes('peaceful')) return 'calm';
  if (lower.includes('upbeat') || lower.includes('happy')) return 'upbeat';
  if (lower.includes('emotional') || lower.includes('sad')) return 'emotional';
  if (lower.includes('energetic') || lower.includes('dynamic')) return 'energetic';
  if (lower.includes('modern') || lower.includes('contemporary')) return 'modern';
  if (lower.includes('sophisticated') || lower.includes('elegant')) return 'sophisticated';
  
  return 'neutral';
}

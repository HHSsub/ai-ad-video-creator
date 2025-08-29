// 브랜드 패턴 및 스타일 정의
export const brandPatterns = {
  existing: {
    title: '기존 브랜드',
    description: '이미 알려진 브랜드로, 브랜드 인지도를 활용한 전략을 사용합니다.',
    strategies: [
      '브랜드 로고 및 시그니처 컬러 활용',
      '기존 브랜드 이미지와 일관성 유지',
      '브랜드 신뢰도를 바탕으로 한 메시지 전달',
      '타겟 고객층의 브랜드 친숙도 활용'
    ],
    visualStyle: 'professional',
    tone: 'authoritative'
  },
  new: {
    title: '신규 브랜드',
    description: '새로운 브랜드로, 브랜드 인지도 구축에 중점을 둔 전략을 사용합니다.',
    strategies: [
      '브랜드 정체성 명확한 표현',
      '독창적이고 기억에 남는 비주얼',
      '브랜드 스토리 및 가치 전달',
      '타겟 고객과의 감정적 연결 구축'
    ],
    visualStyle: 'creative',
    tone: 'engaging'
  }
};

// 업종별 키워드 매핑
export const industryKeywords = {
  '뷰티': ['아름다움', '스타일', '트렌드', '세련된', '개성', '자신감'],
  '푸드': ['맛있는', '건강한', '신선한', '프리미엄', '자연', '만족'],
  '게임': ['재미있는', '흥미진진한', '도전적', '몰입감', '성취', '즐거움'],
  '테크': ['혁신', '디지털', '스마트', '미래', '편리함', '진보'],
  '카페': ['편안한', '아늑한', '분위기', '휴식', '대화', '커피'],
  '패션': ['스타일', '트렌드', '아름다운', '세련된', '개성', '자신감'],
  '헬스': ['건강', '활력', '에너지', '웰빙', '자연', '건강한'],
  '교육': ['성장', '학습', '미래', '전문성', '성공', '지식'],
  '여행': ['모험', '자유', '새로운', '경험', '휴식', '특별한'],
  '금융': ['신뢰', '안전', '편리', '전문성', '미래', '성장']
};

// 연령대별 스타일 매핑
export const ageGroupStyles = {
  '10대': { pace: 'fast', music: 'energetic', visual: 'vibrant' },
  '20대': { pace: 'dynamic', music: 'trendy', visual: 'modern' },
  '30대': { pace: 'balanced', music: 'sophisticated', visual: 'professional' },
  '40대': { pace: 'steady', music: 'classic', visual: 'elegant' },
  '50대 이상': { pace: 'calm', music: 'warm', visual: 'traditional' }
};

// 광고 톤별 스타일
export const toneStyles = {
  '친근한': { emotion: 'warm', approach: 'conversational' },
  '전문적인': { emotion: 'confident', approach: 'authoritative' },
  '재미있는': { emotion: 'playful', approach: 'entertaining' },
  '감동적인': { emotion: 'emotional', approach: 'storytelling' },
  '혁신적인': { emotion: 'exciting', approach: 'futuristic' }
};
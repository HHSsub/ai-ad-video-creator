// 브랜드 데이터베이스 - 기존 브랜드 목록
export const existingBrands = [
  '삼성',
  '엘지',
  'LG',
  '현대',
  '기아',
  'SK',
  '네이버',
  '카카오',
  '배달의민족',
  '쿠팡',
  '토스',
  '우아한형제들',
  '라인',
  '넷플릭스',
  '애플',
  '구글',
  '마이크로소프트',
  '아마존'
];

// 브랜드 분류 함수
export const classifyBrand = (brandName) => {
  const normalizedBrand = brandName.trim().toLowerCase();
  const isExisting = existingBrands.some(brand => 
    brand.toLowerCase() === normalizedBrand
  );
  
  return {
    classification: isExisting ? 'existing' : 'new',
    isExisting
  };
};
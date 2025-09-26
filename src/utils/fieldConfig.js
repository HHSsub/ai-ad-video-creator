// Step1 필드 설정 관리
// localStorage에 저장되어 모든 사용자에게 공통 적용

// 기본 필드 설정
const DEFAULT_FIELD_CONFIG = {
  brandName: {
    key: 'brandName',
    label: '브랜드명',
    required: true,
    visible: true,
    type: 'text',
    placeholder: '예: 삼성, LG, 현대',
    defaultValue: '',
    randomValues: ['브랜드A', '브랜드B', '브랜드C', '혁신기업', '글로벌코퍼']
  },
  industryCategory: {
    key: 'industryCategory', 
    label: '산업 카테고리',
    required: true,
    visible: true,
    type: 'text',
    placeholder: '예: 전자제품, 자동차, 화장품',
    defaultValue: '',
    randomValues: ['IT/소프트웨어', '제조업', '서비스업', '유통업', '금융업', '의료/헬스케어', '교육', '엔터테인먼트']
  },
  productServiceCategory: {
    key: 'productServiceCategory',
    label: '제품/서비스 카테고리', 
    required: true,
    visible: true,
    type: 'text',
    placeholder: '예: 스마트폰, 세단, 스킨케어',
    defaultValue: '',
    randomValues: ['스마트폰', '노트북', '자동차', '화장품', '의류', '식품', '생활용품', '서비스']
  },
  productServiceName: {
    key: 'productServiceName',
    label: '제품명/서비스명',
    required: true, 
    visible: true,
    type: 'text',
    placeholder: '예: 갤럭시 S24, 아반떼, 후',
    defaultValue: '',
    randomValues: ['프리미엄 제품', '신제품', '베스트셀러', '혁신 서비스', '프로 에디션']
  },
  videoPurpose: {
    key: 'videoPurpose',
    label: '영상 목적',
    required: true,
    visible: true, 
    type: 'select',
    options: [
      { value: 'product', label: '제품' },
      { value: 'service', label: '서비스' }
    ],
    defaultValue: 'product',
    randomValues: ['product', 'service']
  },
  videoLength: {
    key: 'videoLength',
    label: '영상 길이',
    required: true,
    visible: true,
    type: 'select', 
    options: [
      { value: '10초', label: '10초' },
      { value: '20초', label: '20초' },
      { value: '30초', label: '30초' },
    ],
    defaultValue: '10초',
    randomValues: ['10초', '20초', '30초']
  },
  aspectRatioCode: {
    key: 'aspectRatioCode',
    label: '영상 비율',
    required: true,
    visible: true,
    type: 'select',
    options: [
      { value: 'widescreen_16_9', label: '가로형 (16:9)' },
      { value: 'square_1_1', label: '정사각형 (1:1)' }, 
      { value: 'vertical_9_16', label: '세로형 (9:16)' }
    ],
    defaultValue: 'widescreen_16_9',
    randomValues: ['widescreen_16_9']
  },
  coreTarget: {
    key: 'coreTarget',
    label: '핵심 타겟',
    required: true,
    visible: true,
    type: 'text',
    placeholder: '예: 20-30대 직장인, 40대 주부',
    defaultValue: '',
    randomValues: ['20-30대 직장인', '30-40대 직장여성', '40-50대 중장년층', '대학생', 'MZ세대', '시니어층']
  },
  coreDifferentiation: {
    key: 'coreDifferentiation', 
    label: '핵심 차별점',
    required: true,
    visible: true,
    type: 'text',
    placeholder: '예: 업계 최초 기술, 합리적 가격, 프리미엄 품질',
    defaultValue: '',
    randomValues: ['혁신적인 기술력', '합리적인 가격', '프리미엄 품질', '친환경', '편리함', '안전성', '디자인 우수성']
  },
  videoRequirements: {
    key: 'videoRequirements',
    label: '영상 요구사항',
    required: false,
    visible: true,
    type: 'textarea',
    placeholder: '추가 요구사항이 있으시면 입력해주세요 (선택사항)',
    defaultValue: '',
    randomValues: ['역동적인 분위기', '감성적인 톤앤매너', '전문적인 이미지', '트렌디한 스타일', '자연스러운 연출']
  },
  imageUpload: { 
    key: 'imageUpload', 
    type: 'image', 
    label: '이미지 업로드', 
    required: false, 
    visible: true 
  },
  imageUploadDesc: { 
    key: 'imageUploadDesc', 
    type: 'text', 
    label: '이미지 설명', 
    required: false, 
    visible: true, 
    placeholder: '이미지에 대한 설명을 입력하세요.' 
  },
};

// LocalStorage 키
const STORAGE_KEY = 'ai-ad-video-field-config';

/**
 * 필드 설정 로드
 */
export const loadFieldConfig = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 기본 설정과 병합 (새 필드가 추가된 경우 대비)
      return { ...DEFAULT_FIELD_CONFIG, ...parsed };
    }
  } catch (error) {
    console.error('필드 설정 로드 오류:', error);
  }
  return DEFAULT_FIELD_CONFIG;
};

/**
 * 필드 설정 저장
 */
export const saveFieldConfig = (config) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch (error) {
    console.error('필드 설정 저장 오류:', error);
    return false;
  }
};

/**
 * 필드 설정 초기화
 */
export const resetFieldConfig = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_FIELD_CONFIG;
  } catch (error) {
    console.error('필드 설정 초기화 오류:', error);
    return DEFAULT_FIELD_CONFIG;
  }
};

/**
 * 랜덤 값 생성
 */
export const getRandomValue = (field) => {
  const randomValues = field.randomValues;
  if (randomValues && randomValues.length > 0) {
    return randomValues[Math.floor(Math.random() * randomValues.length)];
  }
  return field.defaultValue;
};

/**
 * formData에 기본값/랜덤값 적용
 */
export const applyDefaultValues = (fieldConfig) => {
  const formData = {};
  
  Object.values(fieldConfig).forEach(field => {
    if (!field.visible) {
      // 숨겨진 필드는 기본값 또는 랜덤값 적용
      if (field.key === 'videoLength') {
        formData[field.key] = '10초';
      } else if (field.key === 'aspectRatioCode') {
        formData[field.key] = 'widescreen_16_9';
      } else {
        formData[field.key] = getRandomValue(field);
      }
    }
  });
  
  return formData;
};

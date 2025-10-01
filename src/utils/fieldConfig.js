// src/utils/fieldConfig.js - 영상비율 중복 완전 제거 + 모든 로직 정리

const DEFAULT_FIELD_CONFIG = {
  // 1. 브랜드 기본 정보
  brandName: {
    key: 'brandName',
    label: '브랜드명',
    required: true,
    visible: true,
    type: 'text',
    placeholder: '예: 삼성, LG, 현대',
    defaultValue: '',
    randomValues: ['삼성', 'LG', '현대', 'SK', 'KT', '네이버', '카카오', '쿠팡', '배달의민족', '토스']
  },
  
  // 2. 산업/제품 카테고리
  industryCategory: {
    key: 'industryCategory',
    label: '산업 카테고리',
    required: true,
    visible: true,
    type: 'text',
    placeholder: '예: 기술/IT, 금융/보험, 유통/소매',
    defaultValue: '',
    randomValues: ['기술/IT', '금융/보험', '유통/소매', '식품/음료', '패션/뷰티', '자동차', '헬스케어', '교육', '엔터테인먼트', '부동산', '여행/관광']
  },
  
  productServiceCategory: {
    key: 'productServiceCategory',
    label: '제품/서비스 카테고리',
    required: true,
    visible: true,
    type: 'text',
    placeholder: '예: 스마트폰, 세탁기, 자동차',
    defaultValue: '',
    randomValues: ['스마트폰', '세탁기', '자동차', '화장품', '음식배달', '금융서비스', '온라인쇼핑', '게임']
  },
  
  productServiceName: {
    key: 'productServiceName',
    label: '제품명/서비스명',
    required: true,
    visible: true,
    type: 'text',
    placeholder: '예: 갤럭시 S24, 그램 노트북, 아반떼',
    defaultValue: '',
    randomValues: ['갤럭시 S24', '그램 노트북', '아반떼', '카카오페이', '배달의민족', '네이버웹툰', '토스뱅크']
  },
  
  // 3. 영상 설정
  videoPurpose: {
    key: 'videoPurpose',
    label: '영상 목적',
    required: true,
    visible: true,
    type: 'select',
    options: [
      { value: 'product', label: '제품' },
      { value: 'service', label: '서비스' },
    ],
    defaultValue: '제품',
    randomValues: ['제품', '서비스']
  },
  
  // 영상길이 - 실제 프론트 옵션만 (10초, 20초, 30초)
  videoLength: {
    key: 'videoLength',
    label: '영상 길이',
    required: true,
    visible: true,
    type: 'select',
    options: [
      { value: '10초', label: '10초' },
      { value: '20초', label: '20초' },
      { value: '30초', label: '30초' }
    ],
    defaultValue: '10초',
    randomValues: ['10초', '20초', '30초']
  },
  
  // 🔥 영상비율 - aspectRatio 하나만 사용 (videoAspectRatio 완전 삭제)
  aspectRatio: {
    key: 'aspectRatio',
    label: '영상 비율',
    required: true,
    visible: true,
    type: 'select',
    options: [
      { value: 'widescreen_16_9', label: '가로 (16:9)' },
      { value: 'square_1_1', label: '정사각형 (1:1)' },
      { value: 'portrait_9_16', label: '세로 (9:16)' }
    ],
    defaultValue: 'widescreen_16_9',
    randomValues: ['가로 (16:9)', '정사각형 (1:1)', '세로 (9:16)']
  },
  
  // 4. 타겟팅 정보
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
  
  // 5. 추가 요구사항
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

  // 🔥 6. 맨 마지막: 이미지 업로드
  imageUpload: { 
    key: 'imageUpload', 
    type: 'image', 
    label: '이미지 업로드', 
    required: false, 
    visible: true,
    // Admin이 동적으로 수정 가능한 설명문구들
    descriptions: {
      product: '제품일 때엔 제품 이미지를, 서비스 홍보일 때엔 브랜드 로고 이미지를 올려주세요',
      service: '서비스 홍보용 브랜드 로고 이미지를 올려주세요',
      brand: '브랜드 인지도 향상을 위한 로고 이미지를 올려주세요',
      conversion: '구매 유도용 제품 이미지를 올려주세요',
      education: '사용법 안내용 제품 이미지를 올려주세요',
      default: '제품일 때엔 제품 이미지를, 서비스 홍보일 때엔 브랜드 로고 이미지를 올려주세요'
    }
  }
  // 🔥 영상설명, 이미지설명, videoAspectRatio 필드 모두 완전 삭제됨
};

// LocalStorage 키
const STORAGE_KEY = 'ai-ad-video-field-config';
const ADMIN_SETTINGS_KEY = 'ai-ad-video-admin-settings';

/**
 * 필드 설정 로드 - 동기 함수로 유지
 */
export const loadFieldConfig = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_FIELD_CONFIG, ...parsed };
    }
  } catch (error) {
    console.error('필드 설정 로드 오류:', error);
  }
  return DEFAULT_FIELD_CONFIG;
};



/**
 * 필드 설정 저장 - 동기 함수로 유지
 */
export const saveFieldConfig = (config) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    
    // 서버에도 동기적으로 전송 (background)
    fetch('/api/admin-field-config/field-config', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-username': localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).username : 'guest'
      },
      body: JSON.stringify(config)
    }).catch(err => console.error('서버 저장 실패:', err));
    
    return true;
  } catch (error) {
    console.error('필드 설정 저장 오류:', error);
    return false;
  }
};

/**
 * Admin 설정 로드
 */
export const loadAdminSettings = () => {
  try {
    const saved = localStorage.getItem(ADMIN_SETTINGS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    console.error('Admin 설정 로드 오류:', error);
    return {};
  }
};

/**
 * Admin 설정 저장
 */
export const saveAdminSettings = (settings) => {
  try {
    localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
    
    // BroadcastChannel로 실시간 알림
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const channel = new BroadcastChannel('admin-settings');
      channel.postMessage({ type: 'admin-settings-updated', settings });
    }
    
    return true;
  } catch (error) {
    console.error('Admin 설정 저장 오류:', error);
    return false;
  }
};

/**
 * 필드 표시/숨김 토글
 */
export const toggleFieldVisibility = (fieldKey) => {
  const config = loadFieldConfig();
  if (config[fieldKey]) {
    config[fieldKey].visible = !config[fieldKey].visible;
    saveFieldConfig(config);
  }
  return config;
};

/**
 * 필드 라벨 업데이트
 */
export const updateFieldLabel = (fieldKey, newLabel) => {
  const config = loadFieldConfig();
  if (config[fieldKey]) {
    config[fieldKey].label = newLabel;
    saveFieldConfig(config);
  }
  return config;
};

/**
 * 필드 플레이스홀더 업데이트
 */
export const updateFieldPlaceholder = (fieldKey, newPlaceholder) => {
  const config = loadFieldConfig();
  if (config[fieldKey]) {
    config[fieldKey].placeholder = newPlaceholder;
    saveFieldConfig(config);
  }
  return config;
};

/**
 * 🔥 영상 비율 검증 및 정리 함수
 */
export const normalizeAspectRatio = (formData) => {
  // videoAspectRatio가 있으면 aspectRatio로 이동
  if (formData.videoAspectRatio && !formData.aspectRatio) {
    formData.aspectRatio = formData.videoAspectRatio;
    delete formData.videoAspectRatio;
  }
  
  // 중복 제거
  if (formData.videoAspectRatio && formData.aspectRatio) {
    delete formData.videoAspectRatio; // aspectRatio만 유지
  }
  
  // 기본값 설정
  if (!formData.aspectRatio) {
    formData.aspectRatio = '가로 (16:9)';
  }
  
  return formData;
};

/**
 * 🔥 폼 데이터 검증 및 정리
 */
export const validateAndCleanFormData = (formData) => {
  const cleaned = { ...formData };
  
  // 영상 비율 정리
  normalizeAspectRatio(cleaned);
  
  // 불필요한 필드 제거
  delete cleaned.videoDescription;
  delete cleaned.imageUploadDesc;
  delete cleaned.videoAspectRatio; // 확실히 제거
  
  // 빈 값 검증
  const config = loadFieldConfig();
  Object.keys(config).forEach(key => {
    const field = config[key];
    if (field.required && field.visible && !cleaned[key]) {
      console.warn(`필수 필드 누락: ${field.label}`);
    }
  });
  
  return cleaned;
};

export default {
  loadFieldConfig,
  saveFieldConfig,
  loadAdminSettings,
  saveAdminSettings,
  toggleFieldVisibility,
  updateFieldLabel,
  updateFieldPlaceholder,
  normalizeAspectRatio,
  validateAndCleanFormData,
  DEFAULT_FIELD_CONFIG
};

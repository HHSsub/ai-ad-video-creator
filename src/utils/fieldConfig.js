const DEFAULT_FIELD_CONFIG = {
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
    visible: true,
    descriptions: {
      product: '제품일 때엔 제품 이미지를, 서비스 홍보일 때엔 브랜드 로고 이미지를 올려주세요',
      service: '서비스 홍보용 브랜드 로고 이미지를 올려주세요',
      brand: '브랜드 인지도 향상을 위한 로고 이미지를 올려주세요',
      conversion: '구매 유도용 제품 이미지를 올려주세요',
      education: '사용법 안내용 제품 이미지를 올려주세요',
      default: '제품일 때엔 제품 이미지를, 서비스 홍보일 때엔 브랜드 로고 이미지를 올려주세요'
    }
  }
};

const STORAGE_KEY = 'ai-ad-video-field-config';
const ADMIN_SETTINGS_KEY = 'ai-ad-video-admin-settings';

export const loadFieldConfig = async () => {
  try {
    const response = await fetch('/api/admin-field-config/field-config');
    const data = await response.json();
    
    if (data.success && data.config && Object.keys(data.config).length > 0) {
      const merged = { ...DEFAULT_FIELD_CONFIG, ...data.config };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (error) {
    console.error('서버 설정 로드 실패, 로컬 저장소 사용:', error);
  }
  
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_FIELD_CONFIG, ...parsed };
    }
  } catch (error) {
    console.error('로컬 저장소 로드 실패:', error);
  }
  
  return DEFAULT_FIELD_CONFIG;
};

export const saveFieldConfig = async (config) => {
  try {
    const user = localStorage.getItem('user');
    const username = user ? JSON.parse(user).username : 'guest';
    
    const response = await fetch('/api/admin-field-config/field-config', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-username': username
      },
      body: JSON.stringify(config)
    });
    
    if (response.ok) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      return true;
    }
  } catch (error) {
    console.error('서버 저장 실패:', error);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  return true;
};

export const loadAdminSettings = () => {
  try {
    const saved = localStorage.getItem(ADMIN_SETTINGS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    console.error('Admin 설정 로드 오류:', error);
    return {};
  }
};

export const saveAdminSettings = (settings) => {
  try {
    localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Admin 설정 저장 오류:', error);
    return false;
  }
};

export const toggleFieldVisibility = async (fieldKey) => {
  const config = await loadFieldConfig();
  if (config[fieldKey]) {
    config[fieldKey].visible = !config[fieldKey].visible;
    await saveFieldConfig(config);
  }
  return config;
};

export const updateFieldLabel = async (fieldKey, newLabel) => {
  const config = await loadFieldConfig();
  if (config[fieldKey]) {
    config[fieldKey].label = newLabel;
    await saveFieldConfig(config);
  }
  return config;
};

export const updateFieldPlaceholder = async (fieldKey, newPlaceholder) => {
  const config = await loadFieldConfig();
  if (config[fieldKey]) {
    config[fieldKey].placeholder = newPlaceholder;
    await saveFieldConfig(config);
  }
  return config;
};

export const normalizeAspectRatio = (formData) => {
  if (formData.videoAspectRatio && !formData.aspectRatio) {
    formData.aspectRatio = formData.videoAspectRatio;
    delete formData.videoAspectRatio;
  }
  
  if (formData.videoAspectRatio && formData.aspectRatio) {
    delete formData.videoAspectRatio;
  }
  
  if (!formData.aspectRatio) {
    formData.aspectRatio = 'widescreen_16_9';
  }
  
  return formData;
};

export const validateAndCleanFormData = async (formData) => {
  const cleaned = { ...formData };
  
  normalizeAspectRatio(cleaned);
  
  delete cleaned.videoDescription;
  delete cleaned.imageUploadDesc;
  delete cleaned.videoAspectRatio;
  
  const config = await loadFieldConfig();
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

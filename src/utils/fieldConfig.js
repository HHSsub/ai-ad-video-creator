// src/utils/fieldConfig.js - 필드 설정 관리

// 🔥 통합된 필드 설정 (브랜드 로고, 제품 이미지를 하나로 통합)
const DEFAULT_FIELD_CONFIG = {
  brandName: {
    key: 'brandName',
    label: '브랜드명',
    required: true,
    visible: true,
    type: 'text',
    placeholder: '예: 삼성, LG, 네이버',
    defaultValue: '',
    randomValues: ['TechCorp', 'InnovateLab', 'FutureVision', 'SmartSolutions', 'NextGen', 'ProActive']
  },
  industryCategory: {
    key: 'industryCategory',
    label: '산업 카테고리',
    required: true,
    visible: true,
    type: 'select',
    placeholder: '산업 카테고리를 선택하세요',
    options: [
      { value: 'technology', label: 'IT/기술' },
      { value: 'healthcare', label: '헬스케어/의료' },
      { value: 'finance', label: '금융' },
      { value: 'education', label: '교육' },
      { value: 'retail', label: '유통/소매' },
      { value: 'food', label: '식품/음료' },
      { value: 'fashion', label: '패션/뷰티' },
      { value: 'automotive', label: '자동차' },
      { value: 'real_estate', label: '부동산' },
      { value: 'entertainment', label: '엔터테인먼트' },
      { value: 'other', label: '기타' }
    ]
  },
  productServiceCategory: {
    key: 'productServiceCategory',
    label: '제품/서비스 카테고리',
    required: true,
    visible: true,
    type: 'select',
    placeholder: '제품/서비스 카테고리를 선택하세요',
    options: [
      { value: 'mobile_app', label: '모바일 앱' },
      { value: 'web_service', label: '웹 서비스' },
      { value: 'physical_product', label: '실물 제품' },
      { value: 'software', label: '소프트웨어' },
      { value: 'consulting', label: '컨설팅' },
      { value: 'education', label: '교육 서비스' },
      { value: 'subscription', label: '구독 서비스' },
      { value: 'marketplace', label: '마켓플레이스' },
      { value: 'other', label: '기타' }
    ]
  },
  productServiceName: {
    key: 'productServiceName',
    label: '제품명/서비스명',
    required: true,
    visible: true,
    type: 'text',
    placeholder: '예: iPhone 15, ChatGPT, 스타벅스 라떼',
    defaultValue: '',
    randomValues: ['SmartDevice Pro', 'AI Assistant Plus', 'Premium Service', 'Next Solution', 'Innovation Tool']
  },
  videoPurpose: {
    key: 'videoPurpose',
    label: '영상 목적',
    required: true,
    visible: true,
    type: 'select',
    placeholder: '영상 제작 목적을 선택하세요',
    options: [
      { value: 'product', label: '제품' },
      { value: 'service', label: '서비스' },
    ]
  },
  videoLength: {
    key: 'videoLength',
    label: '영상 길이',
    required: false,
    visible: true,
    type: 'select',
    placeholder: '영상 길이를 선택하세요',
    defaultValue: '10초',
    options: [
      { value: '10초', label: '10초 (표준)' },
      { value: '15초', label: '15초 (상세)' },
      { value: '30초', label: '30초 (긴 설명)' }
    ]
  },
  aspectRatioCode: {
    key: 'aspectRatioCode',
    label: '영상 비율',
    required: false,
    visible: true,
    type: 'select',
    placeholder: '영상 비율을 선택하세요',
    defaultValue: 'widescreen_16_9',
    options: [
      { value: 'widescreen_16_9', label: '가로 (16:9)' },
      { value: 'vertical_9_16', label: '세로 (9:16)' },
      { value: 'square_1_1', label: '정사각형 (1:1)' }
    ]
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

  // 🔥 통합된 이미지 업로드 필드 (브랜드 로고 + 제품 이미지 통합)
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
      default: '제품일 때엔 제품 이미지를, 서비스 홍보일 때엔 브랜드 로고 이미지를 올려주세요'
    }
  },
  
  // 🔥 이미지 설명 필드 (선택사항)
  // imageUploadDesc: { 
  //   key: 'imageUploadDesc', 
  //   type: 'text', 
  //   label: '이미지 설명', 
  //   required: false, 
  //   visible: false, // 기본적으로 숨김
  //   placeholder: '이미지에 대한 설명을 입력하세요.' 
  // }
};

// LocalStorage 키
const STORAGE_KEY = 'ai-ad-video-field-config';
const ADMIN_SETTINGS_KEY = 'ai-ad-video-admin-settings';

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
    
    // 🔥 Admin 설정 변경사항을 서버에도 알림 (실시간 반영을 위함)
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const channel = new BroadcastChannel('field-config-updates');
      channel.postMessage({
        type: 'FIELD_CONFIG_UPDATED',
        config: config,
        timestamp: Date.now()
      });
    }
    
    return true;
  } catch (error) {
    console.error('필드 설정 저장 오류:', error);
    return false;
  }
};

/**
 * 🔥 Admin 설정 로드 (라벨, 설명문구 등)
 */
export const loadAdminSettings = () => {
  try {
    const saved = localStorage.getItem(ADMIN_SETTINGS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('Admin 설정 로드 오류:', error);
  }
  return {};
};

/**
 * 🔥 Admin 설정 저장 (라벨, 설명문구 등)
 */
export const saveAdminSettings = (settings) => {
  try {
    localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
    
    // 🔥 실시간 반영을 위한 브로드캐스트
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const channel = new BroadcastChannel('admin-settings-updates');
      channel.postMessage({
        type: 'ADMIN_SETTINGS_UPDATED',
        settings: settings,
        timestamp: Date.now()
      });
    }
    
    return true;
  } catch (error) {
    console.error('Admin 설정 저장 오류:', error);
    return false;
  }
};

/**
 * 필드 설정 초기화
 */
export const resetFieldConfig = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ADMIN_SETTINGS_KEY);
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

/**
 * 🔥 BroadcastChannel을 이용한 실시간 설정 동기화
 */
export const setupFieldConfigSync = (onUpdate) => {
  if (typeof window !== 'undefined' && window.BroadcastChannel) {
    const configChannel = new BroadcastChannel('field-config-updates');
    const adminChannel = new BroadcastChannel('admin-settings-updates');
    
    configChannel.onmessage = (event) => {
      if (event.data.type === 'FIELD_CONFIG_UPDATED') {
        onUpdate('config', event.data.config);
      }
    };
    
    adminChannel.onmessage = (event) => {
      if (event.data.type === 'ADMIN_SETTINGS_UPDATED') {
        onUpdate('admin', event.data.settings);
      }
    };
    
    // 정리 함수 반환
    return () => {
      configChannel.close();
      adminChannel.close();
    };
  }
  
  return () => {}; // fallback
};

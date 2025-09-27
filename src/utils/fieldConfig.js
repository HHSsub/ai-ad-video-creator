// src/utils/fieldConfig.js - 영상설명 필드 완전 제거 + 예시값 관리자 편집 가능

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
    type: 'select',
    options: [
      { value: 'technology', label: '기술/IT' },
      { value: 'finance', label: '금융/보험' },
      { value: 'retail', label: '유통/소매' },
      { value: 'food', label: '식품/음료' },
      { value: 'fashion', label: '패션/뷰티' },
      { value: 'automotive', label: '자동차' },
      { value: 'healthcare', label: '헬스케어' },
      { value: 'education', label: '교육' },
      { value: 'entertainment', label: '엔터테인먼트' },
      { value: 'real-estate', label: '부동산' },
      { value: 'travel', label: '여행/관광' },
      { value: 'other', label: '기타' }
    ],
    defaultValue: '',
    randomValues: ['기술/IT', '금융/보험', '유통/소매', '식품/음료', '패션/뷰티']
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
      { value: 'brand', label: '브랜드 인지도 향상' },
      { value: 'product', label: '제품 홍보' },
      { value: 'service', label: '서비스 홍보' },
      { value: 'conversion', label: '구매 유도' },
      { value: 'education', label: '사용법 안내' }
    ],
    defaultValue: '',
    randomValues: ['브랜드 인지도 향상', '제품 홍보', '서비스 홍보', '구매 유도', '사용법 안내']
  },
  videoLength: {
    key: 'videoLength',
    label: '영상 길이',
    required: true,
    visible: true,
    type: 'select',
    options: [
      { value: '10초', label: '10초 (숏폼)' },
      { value: '15초', label: '15초 (인스타그램)' },
      { value: '30초', label: '30초 (유튜브 숏츠)' },
      { value: '60초', label: '60초 (긴 형태)' }
    ],
    defaultValue: '',
    randomValues: ['10초', '15초', '30초', '60초']
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
      { value: 'portrait_9_16', label: '세로 (9:16)' },
      { value: 'portrait_4_5', label: '세로 (4:5)' }
    ],
    defaultValue: '',
    randomValues: ['가로 (16:9)', '정사각형 (1:1)', '세로 (9:16)', '세로 (4:5)']
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
      brand: '브랜드 인지도 향상을 위한 로고 이미지를 올려주세요',
      conversion: '구매 유도용 제품 이미지를 올려주세요',
      education: '사용법 안내용 제품 이미지를 올려주세요',
      default: '제품일 때엔 제품 이미지를, 서비스 홍보일 때엔 브랜드 로고 이미지를 올려주세요'
    }
  }
  // 🔥 영상설명 필드 완전 제거됨 - videoDescription 삭제
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
 * 🔥 Admin 설정 로드 (라벨, 설명문구, 예시값 등)
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
 * 🔥 Admin 설정 저장 (라벨, 설명문구, 예시값 등)
 */
export const saveAdminSettings = (settings) => {
  try {
    localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
    
    // 🔥 실시간 동기화
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const channel = new BroadcastChannel('field-config-updates');
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
 * 🔥 숨겨진 필드들에 대한 기본값 적용
 */
export const applyDefaultValues = (config) => {
  const defaultValues = {};
  
  Object.values(config).forEach(field => {
    if (!field.visible && field.defaultValue !== undefined && field.defaultValue !== '') {
      defaultValues[field.key] = field.defaultValue;
    }
  });
  
  return defaultValues;
};

/**
 * 🔥 실시간 필드 설정 동기화 설정
 */
export const setupFieldConfigSync = (onUpdate) => {
  if (typeof window === 'undefined' || !window.BroadcastChannel) {
    return () => {}; // cleanup 함수
  }

  const channel = new BroadcastChannel('field-config-updates');
  
  const handleMessage = (event) => {
    const { type, config, settings } = event.data;
    
    if (type === 'FIELD_CONFIG_UPDATED' && config) {
      onUpdate('config', config);
    } else if (type === 'ADMIN_SETTINGS_UPDATED' && settings) {
      onUpdate('admin', settings);
    }
  };

  channel.addEventListener('message', handleMessage);

  // cleanup 함수 반환
  return () => {
    channel.removeEventListener('message', handleMessage);
    channel.close();
  };
};

/**
 * 🔥 예시값 업데이트 함수 (관리자용)
 */
export const updateFieldPlaceholder = async (fieldKey, newPlaceholder) => {
  const config = loadFieldConfig();
  
  if (config[fieldKey]) {
    config[fieldKey].placeholder = newPlaceholder;
    return saveFieldConfig(config);
  }
  
  return false;
};

/**
 * 🔥 랜덤값 업데이트 함수 (관리자용)
 */
export const updateFieldRandomValues = async (fieldKey, newRandomValues) => {
  const config = loadFieldConfig();
  
  if (config[fieldKey] && Array.isArray(newRandomValues)) {
    config[fieldKey].randomValues = newRandomValues;
    return saveFieldConfig(config);
  }
  
  return false;
};

// api/field-config.js - 필드 설정 관리 API

export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      // 현재 필드 설정 반환
      const fieldConfig = getFieldConfiguration();
      res.status(200).json({
        success: true,
        fieldConfig,
        timestamp: new Date().toISOString()
      });
    } 
    else if (req.method === 'PUT') {
      // 필드 설정 업데이트 (관리자만)
      const { updates } = req.body;
      
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({
          success: false,
          error: '업데이트할 설정이 필요합니다'
        });
      }

      // 환경변수 업데이트 시뮬레이션 (실제로는 .env 파일 수정 또는 런타임 설정)
      const updatedConfig = updateFieldConfiguration(updates);
      
      res.status(200).json({
        success: true,
        message: '필드 설정이 업데이트되었습니다',
        fieldConfig: updatedConfig,
        timestamp: new Date().toISOString()
      });
    }
    else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[field-config] 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// 현재 필드 설정 가져오기
function getFieldConfiguration() {
  return {
    fields: {
      brandName: {
        enabled: process.env.FIELD_BRAND_NAME_ENABLED !== 'false',
        label: process.env.FIELD_BRAND_NAME_LABEL || '브랜드명',
        required: false, // 삭제 가능
        defaultValue: process.env.DEFAULT_BRAND_NAME || '브랜드'
      },
      industryCategory: {
        enabled: true, // 항상 활성화 (삭제 불가)
        label: process.env.FIELD_INDUSTRY_CATEGORY_LABEL || '산업 카테고리',
        required: true,
        deletable: false
      },
      productServiceCategory: {
        enabled: true, // 항상 활성화 (삭제 불가)
        label: process.env.FIELD_PRODUCT_SERVICE_CATEGORY_LABEL || '제품/서비스 카테고리',
        required: true,
        deletable: false
      },
      productServiceName: {
        enabled: process.env.FIELD_PRODUCT_SERVICE_NAME_ENABLED !== 'false',
        label: process.env.FIELD_PRODUCT_SERVICE_NAME_LABEL || '제품명/서비스명',
        required: false
      },
      videoPurpose: {
        enabled: process.env.FIELD_VIDEO_PURPOSE_ENABLED !== 'false',
        label: process.env.FIELD_VIDEO_PURPOSE_LABEL || '영상 목적',
        required: false
      },
      videoLength: {
        enabled: process.env.FIELD_VIDEO_LENGTH_ENABLED !== 'false',
        label: process.env.FIELD_VIDEO_LENGTH_LABEL || '영상 길이',
        required: false,
        defaultValue: process.env.DEFAULT_VIDEO_LENGTH || '10초'
      },
      coreTarget: {
        enabled: process.env.FIELD_CORE_TARGET_ENABLED !== 'false',
        label: process.env.FIELD_CORE_TARGET_LABEL || '핵심 타겟',
        required: false
      },
      coreDifferentiation: {
        enabled: process.env.FIELD_CORE_DIFFERENTIATION_ENABLED !== 'false',
        label: process.env.FIELD_CORE_DIFFERENTIATION_LABEL || '핵심 차별점',
        required: false
      },
      videoRequirements: {
        enabled: process.env.FIELD_VIDEO_REQUIREMENTS_ENABLED !== 'false',
        label: process.env.FIELD_VIDEO_REQUIREMENTS_LABEL || '영상 요구 사항',
        required: false
      },
      brandLogo: {
        enabled: process.env.FIELD_BRAND_LOGO_ENABLED !== 'false',
        label: process.env.FIELD_BRAND_LOGO_LABEL || '브랜드 로고 업로드',
        required: false
      },
      productImage: {
        enabled: process.env.FIELD_PRODUCT_IMAGE_ENABLED !== 'false',
        label: process.env.FIELD_PRODUCT_IMAGE_LABEL || '제품 이미지 업로드',
        required: false
      }
    }
  };
}

// 필드 설정 업데이트 (런타임)
let runtimeConfig = {};

function updateFieldConfiguration(updates) {
  // 런타임에서 설정 오버라이드
  Object.keys(updates).forEach(key => {
    runtimeConfig[key] = updates[key];
  });

  // 업데이트된 설정으로 다시 가져오기
  return getFieldConfigurationWithOverrides();
}

function getFieldConfigurationWithOverrides() {
  const baseConfig = getFieldConfiguration();
  
  // 런타임 설정으로 오버라이드
  Object.keys(runtimeConfig).forEach(key => {
    if (baseConfig.fields[key]) {
      baseConfig.fields[key] = { ...baseConfig.fields[key], ...runtimeConfig[key] };
    }
  });
  
  return baseConfig;
}

// 런타임 설정을 고려한 필드 설정 가져오기 (다른 모듈에서 사용)
export function getActiveFieldConfiguration() {
  return getFieldConfigurationWithOverrides();
}

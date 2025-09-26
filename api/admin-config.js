import fs from 'fs';
import path from 'path';

// 🔥 실시간 설정 파일 경로 (서버 메모리와 파일 시스템 동기화)
const CONFIG_FILE_PATH = path.join(process.cwd(), 'config', 'runtime-admin-settings.json');
const FIELD_CONFIG_FILE_PATH = path.join(process.cwd(), 'config', 'runtime-field-config.json');

// 메모리 캐시
let runtimeAdminSettings = {};
let runtimeFieldConfig = {};

// 초기화
initializeConfig();

function initializeConfig() {
  try {
    // 디렉토리 생성
    const configDir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Admin 설정 로드
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
      runtimeAdminSettings = JSON.parse(data);
    }

    // 필드 설정 로드
    if (fs.existsSync(FIELD_CONFIG_FILE_PATH)) {
      const data = fs.readFileSync(FIELD_CONFIG_FILE_PATH, 'utf8');
      runtimeFieldConfig = JSON.parse(data);
    }

    console.log('[admin-config] 설정 초기화 완료');
  } catch (error) {
    console.error('[admin-config] 초기화 오류:', error);
  }
}

export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 관리자 권한 확인 (간단한 체크 - 실제로는 JWT 토큰 등 사용)
    const isAdmin = req.headers.authorization === 'Admin' || req.body?.isAdmin || req.query?.isAdmin;

    if (req.method === 'GET') {
      // 현재 설정 반환
      res.status(200).json({
        success: true,
        adminSettings: runtimeAdminSettings,
        fieldConfig: runtimeFieldConfig,
        isAdmin: isAdmin,
        timestamp: new Date().toISOString()
      });
    }
    else if (req.method === 'PUT' || req.method === 'POST') {
      // 설정 업데이트 (관리자만)
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: '관리자 권한이 필요합니다'
        });
      }

      const { type, updates } = req.body;

      if (type === 'admin-settings') {
        // Admin 설정 업데이트
        runtimeAdminSettings = { ...runtimeAdminSettings, ...updates };
        
        // 파일에 저장
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(runtimeAdminSettings, null, 2));
        
        console.log('[admin-config] Admin 설정 업데이트:', updates);

        res.status(200).json({
          success: true,
          message: 'Admin 설정이 업데이트되었습니다',
          adminSettings: runtimeAdminSettings,
          timestamp: new Date().toISOString()
        });
      }
      else if (type === 'field-config') {
        // 필드 설정 업데이트
        runtimeFieldConfig = { ...runtimeFieldConfig, ...updates };
        
        // 파일에 저장
        fs.writeFileSync(FIELD_CONFIG_FILE_PATH, JSON.stringify(runtimeFieldConfig, null, 2));
        
        console.log('[admin-config] 필드 설정 업데이트:', Object.keys(updates));

        res.status(200).json({
          success: true,
          message: '필드 설정이 업데이트되었습니다',
          fieldConfig: runtimeFieldConfig,
          timestamp: new Date().toISOString()
        });
      }
      else if (type === 'image-upload-labels') {
        // 🔥 이미지 업로드 라벨과 설명문구 업데이트
        const { label, descriptions } = updates;
        
        if (!runtimeAdminSettings.imageUpload) {
          runtimeAdminSettings.imageUpload = {};
        }
        
        if (label) {
          runtimeAdminSettings.imageUpload.label = label;
        }
        
        if (descriptions) {
          runtimeAdminSettings.imageUpload.descriptions = {
            ...runtimeAdminSettings.imageUpload.descriptions,
            ...descriptions
          };
        }

        // 파일에 저장
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(runtimeAdminSettings, null, 2));
        
        console.log('[admin-config] 이미지 업로드 라벨 업데이트:', { label, descriptions });

        res.status(200).json({
          success: true,
          message: '이미지 업로드 설정이 업데이트되었습니다',
          adminSettings: runtimeAdminSettings,
          timestamp: new Date().toISOString()
        });
      }
      else {
        res.status(400).json({
          success: false,
          error: '올바른 업데이트 타입을 지정해주세요 (admin-settings, field-config, image-upload-labels)'
        });
      }
    }
    else if (req.method === 'DELETE') {
      // 설정 초기화 (관리자만)
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: '관리자 권한이 필요합니다'
        });
      }

      runtimeAdminSettings = {};
      runtimeFieldConfig = {};

      // 파일 삭제
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        fs.unlinkSync(CONFIG_FILE_PATH);
      }
      if (fs.existsSync(FIELD_CONFIG_FILE_PATH)) {
        fs.unlinkSync(FIELD_CONFIG_FILE_PATH);
      }

      res.status(200).json({
        success: true,
        message: '모든 설정이 초기화되었습니다',
        timestamp: new Date().toISOString()
      });
    }
    else {
      res.status(405).json({
        success: false,
        error: 'Method not allowed'
      });
    }
  } catch (error) {
    console.error('[admin-config] API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// 🔥 다른 API에서 사용할 수 있는 설정 getter 함수들
export function getRuntimeAdminSettings() {
  return runtimeAdminSettings;
}

export function getRuntimeFieldConfig() {
  return runtimeFieldConfig;
}

// 🔥 이미지 업로드 라벨과 설명 가져오기
export function getImageUploadConfig(videoPurpose = 'default') {
  const imageUploadConfig = runtimeAdminSettings.imageUpload || {};
  
  const label = imageUploadConfig.label || '이미지 업로드';
  
  const descriptions = imageUploadConfig.descriptions || {
    product: '제품일 때엔 제품 이미지를, 서비스 홍보일 때엔 브랜드 로고 이미지를 올려주세요',
    service: '서비스 홍보용 브랜드 로고 이미지를 올려주세요',
    brand: '브랜드 인지도 향상을 위한 로고 이미지를 올려주세요',
    conversion: '구매 유도용 제품 이미지를 올려주세요',
    education: '사용법 안내용 제품 이미지를 올려주세요',
    default: '제품일 때엔 제품 이미지를, 서비스 홍보일 때엔 브랜드 로고 이미지를 올려주세요'
  };
  
  const description = descriptions[videoPurpose] || descriptions.default;
  
  return {
    label,
    description
  };
}

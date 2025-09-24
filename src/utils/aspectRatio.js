// src/utils/aspectRatio.js
// 🔥 Seedream v4 API 파라미터에 맞는 영상 비율 매핑

/**
 * 사용자 입력 영상 비율을 Seedream v4 API 파라미터로 변환
 */
export function mapUserAspectRatio(value) {
  if (!value || typeof value !== 'string') {
    console.log('[mapUserAspectRatio] 기본값 사용: widescreen_16_9');
    return 'widescreen_16_9';
  }
  
  const normalized = value.toLowerCase().trim();
  
  console.log(`[mapUserAspectRatio] 입력: "${value}" → 정규화: "${normalized}"`);
  
  // 🔥 정확한 매핑 (Seedream v4 공식 파라미터)
  if (normalized.includes('16:9') || normalized.includes('가로')) {
    console.log('[mapUserAspectRatio] → widescreen_16_9');
    return 'widescreen_16_9';
  }
  
  if (normalized.includes('9:16') || normalized.includes('세로') || normalized.includes('vertical')) {
    console.log('[mapUserAspectRatio] → vertical_9_16'); 
    return 'vertical_9_16';
  }
  
  if (normalized.includes('1:1') || normalized.includes('정사각형') || normalized.includes('square')) {
    console.log('[mapUserAspectRatio] → square_1_1');
    return 'square_1_1';
  }
  
  if (normalized.includes('4:5') || normalized.includes('portrait')) {
    console.log('[mapUserAspectRatio] → portrait_4_5');
    return 'portrait_4_5';
  }
  
  // 기본값 (가로 16:9)
  console.log('[mapUserAspectRatio] 매칭 실패, 기본값 사용: widescreen_16_9');
  return 'widescreen_16_9';
}

/**
 * 비율 코드를 디스플레이용 텍스트로 변환
 */
export function getAspectRatioDisplayName(code) {
  const displayMap = {
    'widescreen_16_9': '가로 (16:9)',
    'vertical_9_16': '세로 (9:16)', 
    'square_1_1': '정사각형 (1:1)',
    'portrait_4_5': '세로 (4:5)'
  };
  
  return displayMap[code] || code;
}

/**
 * 🔥 Seedream v4 지원 비율 목록
 */
export const SUPPORTED_ASPECT_RATIOS = [
  { code: 'widescreen_16_9', display: '가로 (16:9)', width: 16, height: 9 },
  { code: 'vertical_9_16', display: '세로 (9:16)', width: 9, height: 16 },
  { code: 'square_1_1', display: '정사각형 (1:1)', width: 1, height: 1 },
  { code: 'portrait_4_5', display: '세로 (4:5)', width: 4, height: 5 }
];

/**
 * 🔥 formData의 비디오 비율을 Seedream v4 파라미터로 변환
 */
export function getAspectRatioFromFormData(formData) {
  const videoAspectRatio = formData?.videoAspectRatio || 
                          formData?.aspectRatio || 
                          formData?.video_aspect_ratio ||
                          '가로 (16:9)'; // 기본값
  
  const mappedRatio = mapUserAspectRatio(videoAspectRatio);
  
  console.log(`[getAspectRatioFromFormData] formData 비율: "${videoAspectRatio}" → API 파라미터: "${mappedRatio}"`);
  
  return mappedRatio;
}

export default {
  mapUserAspectRatio,
  getAspectRatioDisplayName, 
  getAspectRatioFromFormData,
  SUPPORTED_ASPECT_RATIOS
};

// api/debug.js - 환경변수 및 API 연결 상태 확인용

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const envInfo = {
      nodeEnv: process.env.NODE_ENV,
      hasFreepikKey: !!process.env.FREEPIK_API_KEY,
      hasViteFreepikKey: !!process.env.VITE_FREEPIK_API_KEY,
      hasReactFreepikKey: !!process.env.REACT_APP_FREEPIK_API_KEY,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      hasViteGeminiKey: !!process.env.VITE_GEMINI_API_KEY,
      hasReactGeminiKey: !!process.env.REACT_APP_GEMINI_API_KEY,
      geminiModel: process.env.GEMINI_MODEL || 'not set',
      fallbackModel: process.env.FALLBACK_GEMINI_MODEL || 'not set'
    };

// api/debug.js - 환경변수 및 API 연결 상태 확인용

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 환경변수 확인
    const envInfo = {
      nodeEnv: process.env.NODE_ENV,
      
      // Freepik API 키들
      hasFreepikKey: !!process.env.FREEPIK_API_KEY,
      hasViteFreepikKey: !!process.env.VITE_FREEPIK_API_KEY,
      hasReactFreepikKey: !!process.env.REACT_APP_FREEPIK_API_KEY,
      
      // Gemini API 키들
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      hasViteGeminiKey: !!process.env.VITE_GEMINI_API_KEY,
      hasReactGeminiKey: !!process.env.REACT_APP_GEMINI_API_KEY,
      
      // 모델 설정
      geminiModel: process.env.GEMINI_MODEL || 'not set',
      fallbackModel: process.env.FALLBACK_GEMINI_MODEL || 'not set',
      
      // Google Drive
      hasGoogleServiceKey: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      hasGoogleProjectId: !!process.env.GOOGLE_PROJECT_ID,
      googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || 'not set'
    };

    // API 키 부분적 표시 (보안상 앞 8자만)
    const keyInfo = {};
    
    if (process.env.FREEPIK_API_KEY) {
      keyInfo.freepikKey = process.env.FREEPIK_API_KEY.substring(0, 8) + '...';
    }
    if (process.env.VITE_FREEPIK_API_KEY) {
      keyInfo.viteFreepikKey = process.env.VITE_FREEPIK_API_KEY.substring(0, 8) + '...';
    }
    if (process.env.GEMINI_API_KEY) {
      keyInfo.geminiKey = process.env.GEMINI_API_KEY.substring(0, 8) + '...';
    }

    // 실제 API 연결 테스트 (선택적)
    let apiTests = {};
    
    if (req.query.test === 'true') {
      console.log('[debug] API 연결 테스트 시작...');
      
      // Freepik API 테스트
      if (process.env.FREEPIK_API_KEY) {
        try {
          const freepikTest = await fetch('https://api.freepik.com/v1/ai/text-to-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-freepik-api-key': process.env.FREEPIK_API_KEY
            },
            body: JSON.stringify({
              prompt: 'test image',
              num_images: 1,
              image: { size: "widescreen_16_9" },
              styling: { style: "photo" }
            })
          });
          
          apiTests.freepik = {
            status: freepikTest.status,
            ok: freepikTest.ok,
            message: freepikTest.ok ? 'API 연결 성공' : 'API 호출 실패'
          };
        } catch (error) {
          apiTests.freepik = {
            status: 'error',
            message: error.message
          };
        }
      }
      
      // Gemini API 테스트
      if (process.env.GEMINI_API_KEY) {
        try {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
          
          const result = await model.generateContent('테스트');
          const response = result.response;
          
          apiTests.gemini = {
            status: 'success',
            message: 'Gemini 2.5 Flash 연결 성공',
            responseLength: response.text().length
          };
        } catch (error) {
          apiTests.gemini = {
            status: 'error',
            message: error.message
          };
        }
      }
    }

    // 시스템 정보
    const systemInfo = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };

    res.status(200).json({
      success: true,
      environment: envInfo,
      keys: keyInfo,
      system: systemInfo,
      apiTests: apiTests,
      recommendations: [
        envInfo.hasFreepikKey ? '✅ Freepik API 키 설정됨' : '❌ FREEPIK_API_KEY 설정 필요',
        envInfo.hasGeminiKey ? '✅ Gemini API 키 설정됨' : '❌ GEMINI_API_KEY 설정 필요',
        envInfo.geminiModel.includes('2.5') ? '✅ Gemini 2.5 모델 사용' : '⚠️ Gemini 2.5 모델 권장',
        envInfo.nodeEnv === 'production' ? '✅ 프로덕션 모드' : '⚠️ 개발 모드'
      ],
      usage: '이 엔드포인트는 /api/debug?test=true 로 API 연결 테스트 가능'
    });

  } catch (error) {
    console.error('[debug] 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

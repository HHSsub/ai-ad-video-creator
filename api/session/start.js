// api/session/start.js
const sessions = new Map();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { sessionId, formData, timestamp } = req.body;
    const username = req.headers['x-username'] || 'anonymous';

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    sessions.set(sessionId, {
      sessionId,
      username,
      formData,
      progress: 0,
      message: '세션 시작됨',
      completed: false,
      storyboard: null,
      createdAt: timestamp || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    console.log(`[session/start] 세션 생성: ${sessionId} (사용자: ${username})`);

    return res.status(200).json({
      success: true,
      sessionId,
      message: '세션이 생성되었습니다'
    });

  } catch (error) {
    console.error('[session/start] 오류:', error);
    return res.status(500).json({
      success: false,
      error: '세션 생성 중 오류가 발생했습니다'
    });
  }
}

export { sessions };

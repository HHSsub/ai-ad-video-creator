// api/session/clear.js

import { sessions } from './start.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

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
    const username = req.headers['x-username'] || 'anonymous';

    const userSessions = Array.from(sessions.entries()).filter(
      ([_, session]) => session.username === username
    );

    userSessions.forEach(([sessionId, _]) => {
      sessions.delete(sessionId);
    });

    console.log(`[session/clear] 사용자 세션 삭제: ${username} (${userSessions.length}개)`);

    return res.status(200).json({
      success: true,
      message: '세션이 삭제되었습니다',
      deletedCount: userSessions.length
    });

  } catch (error) {
    console.error('[session/clear] 오류:', error);
    return res.status(500).json({
      success: false,
      error: '세션 삭제 중 오류가 발생했습니다'
    });
  }
}

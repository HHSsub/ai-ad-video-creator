/**
 * API: 세션 삭제 (사용자 세션 초기화)
 * POST /api/session/clear
 */

import sessionStore from '../../server/utils/sessionStore.js';

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

    const allSessions = sessionStore.getAllSessions();
    const userSessions = allSessions.filter(s => s.username === username);

    let deletedCount = 0;
    userSessions.forEach(session => {
      sessionStore.deleteSession(session.id);
      deletedCount++;
    });

    console.log(`[session/clear] 사용자 세션 삭제: ${username} (${deletedCount}개)`);

    return res.status(200).json({
      success: true,
      message: '세션이 삭제되었습니다',
      deletedCount: deletedCount
    });

  } catch (error) {
    console.error('[session/clear] 오류:', error);
    return res.status(500).json({
      success: false,
      error: '세션 삭제 중 오류가 발생했습니다'
    });
  }
}

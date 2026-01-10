/**
 * API: 세션 확인 (진행 중인 세션 존재 여부)
 * GET /api/session/check
 */

import sessionStore from '../utils/sessionStore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const username = req.headers['x-username'] || 'anonymous';

    const allSessions = sessionStore.getAllSessions();
    const userSessions = allSessions.filter(
      s => s.username === username && s.status !== 'completed' && s.status !== 'error'
    );

    if (userSessions.length > 0) {
      return res.status(200).json({
        hasOngoingSession: true,
        session: userSessions[0]
      });
    }

    return res.status(200).json({
      hasOngoingSession: false,
      session: null
    });

  } catch (error) {
    console.error('[session/check] 오류:', error);
    return res.status(500).json({
      success: false,
      error: '세션 확인 중 오류가 발생했습니다'
    });
  }
}

/**
 * API: 세션 상태 조회
 * GET /api/session/status/:sessionId
 */

import sessionStore from '../utils/sessionStore.js';

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET 요청만 허용
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only GET requests are accepted'
    });
  }

  try {
    const { sessionId } = req.query;

    // 세션 ID 검증
    if (!sessionId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'sessionId is required'
      });
    }

    // 세션 조회
    const session = sessionStore.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Not found',
        message: `Session not found: ${sessionId}`
      });
    }

    // 세션 정보 반환
    return res.status(200).json({
      success: true,
      session: {
        id: session.id,
        progress: session.progress,
        status: session.status,
        error: session.error,
        result: session.result,
        createdAt: session.createdAt,
        lastUpdated: session.lastUpdated
      }
    });

  } catch (err) {
    console.error('[API] Error fetching session:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  }
}

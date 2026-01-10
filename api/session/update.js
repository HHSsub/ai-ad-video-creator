/**
 * API: 세션 진행률 업데이트
 * POST /api/session/update
 */

import sessionStore from '../utils/sessionStore.js';

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are accepted'
    });
  }

  try {
    const { sessionId, progress, status, result, error } = req.body;

    // 필수 파라미터 검증
    if (!sessionId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'sessionId is required'
      });
    }

    // 세션이 존재하지 않으면 생성
    let session = sessionStore.getSession(sessionId);
    if (!session) {
      console.log(`[API] Creating new session: ${sessionId}`);
      session = sessionStore.createSession(sessionId);
    }

    // 진행률 업데이트
    if (progress) {
      session = sessionStore.updateProgress(sessionId, progress);
    }

    // 상태 업데이트
    if (status) {
      session = sessionStore.updateStatus(sessionId, status, result, error);
    }

    // 업데이트된 세션 반환
    return res.status(200).json({
      success: true,
      session: {
        id: session.id,
        progress: session.progress,
        status: session.status,
        lastUpdated: session.lastUpdated
      }
    });

  } catch (err) {
    console.error('[API] Error updating session:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  }
}

/**
 * API: 세션 시작 (프론트엔드에서 sessionId 등록)
 * POST /api/session/start
 */

import sessionStore from '../../src/utils/sessionStore.js';

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId, formData, timestamp } = req.body;
    const username = req.headers['x-username'] || 'anonymous';

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // 🔥 세션 생성 (초기 진행률 0%)
    sessionStore.createSession(sessionId, {
      username: username,
      formData: formData,
      startedAt: timestamp || new Date().toISOString()
    });

    // 🔥 초기 진행률 설정
    sessionStore.updateProgress(sessionId, {
      phase: 'INIT',
      percentage: 0,
      currentStep: '광고 영상 생성 준비 중...'
    });

    console.log(`[session/start] ✅ 세션 생성: ${sessionId}`);

    return res.status(200).json({
      success: true,
      sessionId: sessionId,
      message: '세션이 생성되었습니다'
    });

  } catch (error) {
    console.error('[session/start] ❌ 오류:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

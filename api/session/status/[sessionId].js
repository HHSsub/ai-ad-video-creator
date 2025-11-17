// api/session/status/[sessionId].js

import { sessions } from '../start.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { sessionId } = req.query;

    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: '세션을 찾을 수 없습니다'
      });
    }

    return res.status(200).json({
      success: true,
      progress: session.progress,
      message: session.message,
      completed: session.completed,
      storyboard: session.storyboard,
      updatedAt: session.updatedAt
    });

  } catch (error) {
    console.error('[session/status] 오류:', error);
    return res.status(500).json({
      success: false,
      error: '세션 상태 확인 중 오류가 발생했습니다'
    });
  }
}

// api/session/update.js

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
    const { sessionId, progress, message, completed, storyboard } = req.body;

    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: '세션을 찾을 수 없습니다'
      });
    }

    session.progress = progress || session.progress;
    session.message = message || session.message;
    session.completed = completed || session.completed;
    session.storyboard = storyboard || session.storyboard;
    session.updatedAt = new Date().toISOString();

    sessions.set(sessionId, session);

    console.log(`[session/update] 세션 업데이트: ${sessionId}, 진행률: ${progress}%`);

    return res.status(200).json({
      success: true,
      session
    });

  } catch (error) {
    console.error('[session/update] 오류:', error);
    return res.status(500).json({
      success: false,
      error: '세션 업데이트 중 오류가 발생했습니다'
    });
  }
}

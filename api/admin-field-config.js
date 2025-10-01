import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const CONFIG_FILE = path.join(process.cwd(), 'config', 'field-settings.json');

// 🔥 WebSocket 브로드캐스트 함수 참조
let broadcastToAllClients = null;

// 브로드캐스트 함수 동적 로딩
async function initBroadcast() {
  try {
    const { broadcastToAllClients: broadcast } = await import('../server/index.js');
    broadcastToAllClients = broadcast;
    console.log('[admin-field-config] WebSocket 브로드캐스트 함수 로드 완료');
  } catch (error) {
    console.warn('[admin-field-config] WebSocket 브로드캐스트 함수 로드 실패:', error.message);
  }
}

// 초기화
setTimeout(initBroadcast, 1000);

// 🔥 설정 변경을 모든 클라이언트에 브로드캐스트
function broadcastFieldConfigUpdate(config) {
  if (broadcastToAllClients) {
    broadcastToAllClients({
      type: 'CONFIG_SYNC_UPDATE',
      fieldConfig: config,
      timestamp: Date.now()
    });
    console.log('[admin-field-config] 필드 설정 변경을 모든 클라이언트에 브로드캐스트 완료');
  } else {
    console.warn('[admin-field-config] 브로드캐스트 함수가 준비되지 않음');
  }
}

// 설정 로드
router.get('/field-config', (req, res) => {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return res.json({ success: true, config: {} });
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    res.json({ success: true, config });
  } catch (error) {
    console.error('[admin-field-config] 설정 로드 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 설정 저장 (admin 전용)
router.post('/field-config', (req, res) => {
  try {
    const username = req.headers['x-username'];
    const USERS_FILE = path.join(process.cwd(), 'config', 'users.json');
    
    // 사용자 권한 확인
    if (!fs.existsSync(USERS_FILE)) {
      return res.status(500).json({ success: false, error: '사용자 설정 파일이 없습니다' });
    }
    
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    
    if (!username || !users[username] || users[username].role !== 'admin') {
      return res.status(403).json({ success: false, error: '관리자 권한이 필요합니다' });
    }

    // 설정 디렉토리 생성
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 설정 저장
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(req.body, null, 2));
    
    // 🔥 모든 클라이언트에 브로드캐스트
    broadcastFieldConfigUpdate(req.body);
    
    console.log('[admin-field-config] 필드 설정 저장 완료:', Object.keys(req.body));
    
    res.json({ 
      success: true, 
      message: '필드 설정이 저장되었습니다',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[admin-field-config] 설정 저장 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 설정 초기화 (admin 전용)
router.delete('/field-config', (req, res) => {
  try {
    const username = req.headers['x-username'];
    const USERS_FILE = path.join(process.cwd(), 'config', 'users.json');
    
    // 사용자 권한 확인
    if (!fs.existsSync(USERS_FILE)) {
      return res.status(500).json({ success: false, error: '사용자 설정 파일이 없습니다' });
    }
    
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    
    if (!username || !users[username] || users[username].role !== 'admin') {
      return res.status(403).json({ success: false, error: '관리자 권한이 필요합니다' });
    }

    // 설정 파일 삭제
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    
    // 🔥 모든 클라이언트에 브로드캐스트
    broadcastFieldConfigUpdate({});
    
    console.log('[admin-field-config] 필드 설정 초기화 완료');
    
    res.json({ 
      success: true, 
      message: '필드 설정이 초기화되었습니다',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[admin-field-config] 설정 초기화 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

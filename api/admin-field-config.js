import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const CONFIG_FILE = path.join(process.cwd(), 'config', 'field-settings.json');

// 설정 로드
router.get('/field-config', (req, res) => {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return res.json({ success: true, config: {} });
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 설정 저장 (admin 전용)
router.post('/field-config', (req, res) => {
  try {
    const username = req.headers['x-username'];
    const users = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'users.json'), 'utf8'));
    
    if (!users[username] || users[username].role !== 'admin') {
      return res.status(403).json({ success: false, error: '관리자 권한 필요' });
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

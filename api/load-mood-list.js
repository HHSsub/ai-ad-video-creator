import fs from 'fs';
import path from 'path';

const BGM_DIR = path.isAbsolute('BGM') ? 'BGM' : path.join(process.cwd(), 'BGM');

function getMoodList() {
  let moods = new Set();
  try {
    const folders = fs.readdirSync(BGM_DIR, {withFileTypes: true})
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    folders.forEach(folder => {
      const parts = folder.split('.');
      if (parts.length === 2 && parts[1]) {
        moods.add(parts[1]);
      }
    });
  } catch (e) {
    // 폴더 없거나 권한 문제 등
    return [];
  }
  return Array.from(moods);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET/POST 모두 지원
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', method: req.method });
  }

  const moods = getMoodList();
  if (!moods.length) {
    return res.status(404).json({ error: 'BGM 폴더 또는 mood 없음', path: BGM_DIR });
  }
  res.status(200).json({ moods });
}

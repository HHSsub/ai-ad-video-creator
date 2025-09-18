import fs from 'fs';
import path from 'path';

const BGM_DIR = path.join(process.cwd(), 'BGM');

// GET /api/bgm-stream?mood=따듯한
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Range');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });

  const { mood } = req.query || {};
  if (!mood) return res.status(400).json({ error: 'mood query required' });

  // mood에 해당하는 모든 폴더
  const folders = fs.readdirSync(BGM_DIR).filter(name => {
    const fullPath = path.join(BGM_DIR, name);
    return fs.statSync(fullPath).isDirectory() && name.split('.')[1] === mood;
  });

  // 모든 mp3파일을 합친 리스트
  const allFiles = [];
  folders.forEach(folder => {
    const files = fs.readdirSync(path.join(BGM_DIR, folder)).filter(file => file.endsWith('.mp3'));
    files.forEach(file => allFiles.push({folder, file}));
  });

  if (!allFiles.length) return res.status(404).json({ error: '해당 mood의 BGM 없음' });

  // 랜덤 하나 선택
  const chosen = allFiles[Math.floor(Math.random() * allFiles.length)];
  const filePath = path.join(BGM_DIR, chosen.folder, chosen.file);

  const stat = fs.statSync(filePath);
  const size = stat.size;

  res.setHeader('Content-Type', 'video/mp3');
  res.setHeader('Content-Length', size);
  res.setHeader('Accept-Ranges', 'bytes');

  const stream = fs.createReadStream(filePath);
  stream.on('error', err => {
    console.error('Stream error:', err.message);
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
}

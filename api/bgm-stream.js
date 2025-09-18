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

  // 모든 style에서 해당 mood mp3 찾기
  const files = fs.readdirSync(BGM_DIR).filter(file => {
    // file: style.mood_number.mp3
    const match = file.match(/^([^.]+)\.([^.]+)_\d+\.mp3$/);
    return match && match[2] === mood;
  });
  if (!files.length) return res.status(404).json({ error: '해당 mood의 BGM 없음' });

  // 랜덤 하나 선택
  const chosen = files[Math.floor(Math.random() * files.length)];
  const filePath = path.join(BGM_DIR, chosen);

  const stat = fs.statSync(filePath);
  const size = stat.size;

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', size);
  res.setHeader('Accept-Ranges', 'bytes');

  const stream = fs.createReadStream(filePath);
  stream.on('error', err => {
    console.error('Stream error:', err.message);
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
}

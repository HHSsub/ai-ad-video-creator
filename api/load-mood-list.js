import fs from 'fs';
import path from 'path';

const BGM_DIR = path.join(process.cwd(), 'BGM');

// GET /api/load-mood-list
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });

  // 모든 mood 추출 (중복제거)
  const files = fs.readdirSync(BGM_DIR);
  const moods = new Set();
  files.forEach(file => {
    const match = file.match(/^([^.]+)\.([^.]+)_\d+\.mp3$/);
    if (match) moods.add(match[2]);
  });

  res.status(200).json({ moods: Array.from(moods) });
}

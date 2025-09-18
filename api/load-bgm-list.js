import fs from 'fs';
import path from 'path';

const BGM_DIR = path.join(process.cwd(), 'BGM');

// GET /api/load-bgm-list?mood=따듯한
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });

  const { mood } = req.query || {};
  if (!mood) return res.status(400).json({ error: 'mood query required' });

  // 모든 style에서 해당 mood mp3 찾기
  const files = fs.readdirSync(BGM_DIR).filter(file => {
    const match = file.match(/^([^.]+)\.([^.]+)_\d+\.mp3$/);
    return match && match[2] === mood;
  });

  // 목록: [{ style, mood, number, filename }]
  const list = files.map(file => {
    const match = file.match(/^([^.]+)\.([^.]+)_(\d+)\.mp3$/);
    return match ? {
      style: match[1],
      mood: match[2],
      number: match[3],
      filename: file,
    } : null;
  }).filter(Boolean);

  res.status(200).json({ list });
}

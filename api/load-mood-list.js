import fs from 'fs';
import path from 'path';

const BGM_DIR = path.join(process.cwd(), 'BGM');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });

  // 폴더명: style.mood
  const folders = fs.readdirSync(BGM_DIR).filter(name => {
    const fullPath = path.join(BGM_DIR, name);
    return fs.statSync(fullPath).isDirectory();
  });

  // mood만 추출 (폴더명에서 . 뒤 부분)
  const moods = new Set();
  folders.forEach(folder => {
    const parts = folder.split('.');
    if (parts.length === 2) moods.add(parts[1]);
  });

  res.status(200).json({ moods: Array.from(moods) });
}

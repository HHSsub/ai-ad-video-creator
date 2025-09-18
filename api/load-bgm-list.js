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

  // 모든 style.mood 폴더 중 mood가 맞는 폴더만 검색
  const folders = fs.readdirSync(BGM_DIR).filter(name => {
    const fullPath = path.join(BGM_DIR, name);
    return fs.statSync(fullPath).isDirectory() && name.split('.')[1] === mood;
  });

  // 각 폴더 내부 mp4 파일 목록
  const list = [];
  folders.forEach(folder => {
    const files = fs.readdirSync(path.join(BGM_DIR, folder)).filter(file => file.endsWith('.mp3'));
    files.forEach(file => {
      const match = file.match(/^([^.]+)\.([^.]+)_(\d+)\.mp3$/);
      if (match) {
        list.push({
          style: match[1],
          mood: match[2],
          number: match[3],
          filename: file,
          folder: folder
        });
      }
    });
  });

  res.status(200).json({ list });
}

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

  // BGM 폴더의 하위 폴더 이름을 모두 읽어서
  // 폴더명이 style.mood 형태일 때 "mood"만 추출 (중복제거)
  let moods = new Set();
  const folders = fs.readdirSync(BGM_DIR, {withFileTypes: true})
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  folders.forEach(folder => {
    const parts = folder.split('.');
    if (parts.length === 2 && parts[1]) {
      moods.add(parts[1]);
    }
  });

  res.status(200).json({ moods: Array.from(moods) });
}

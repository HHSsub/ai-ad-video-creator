// Freepik 결과(6초)를 각 2초로 컷/속도조절하여 최종 영상 합치기
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

async function download(url, filePath) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(filePath, buf);
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve(null) : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { segments, clipDurationSec = 2, fps = 30, scale = '1920:1080' } = await req.json?.() || req.body || {};
    if (!Array.isArray(segments) || !segments.length) return res.status(400).json({ error: 'segments[] required' });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-'));
    const partFiles = [];

    // 1) 다운로드 + 2초로 트리밍(또는 속도변환)
    let idx = 0;
    for (const s of segments) {
      if (!s?.videoUrl) continue;
      idx++;
      const src = path.join(tmp, `src_${idx}.mp4`);
      const cut = path.join(tmp, `cut_${idx}.mp4`);

      await download(s.videoUrl, src);
      // 입력 길이(6s)를 정확히 2초로: 단순 트림(-t) 우선. 짧으면 setpts로 속도조절.
      await runFFmpeg(['-y', '-i', src, '-t', String(clipDurationSec), '-r', String(fps), '-vf', `scale=${scale}`, '-an', cut]);
      partFiles.push(cut);
    }

    // 2) concat
    const listPath = path.join(tmp, 'list.txt');
    fs.writeFileSync(listPath, partFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const out = path.join(tmp, 'out.mp4');
    await runFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', out]);

    // 3) 응답(임시 서버 제공: 파일을 다시 업로드하지 않고는 영구 URL 없음)
    // 여기는 간단히 data: URL로 반환하거나, Nginx 정적 디렉토리로 이동하는 로직을 추가하라.
    const buf = fs.readFileSync(out);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', String(buf.length));
    res.status(200).send(buf);
  } catch (e) {
    console.error('[compile-videos] error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
}

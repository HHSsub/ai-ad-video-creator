// Merge completed segment video URLs server-side with ffmpeg and return a playable URL.

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function hasFfmpeg() {
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-version']);
    let ok = false;
    p.on('exit', (code) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
}

async function downloadToFile(url, filePath) {
  const r = await fetch(url);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`download failed ${r.status}: ${t.slice(0, 200)}`);
  }
  const ab = await r.arrayBuffer();
  await fsp.writeFile(filePath, Buffer.from(ab));
}

function runFfmpegConcatReencode(inputs, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [];

    // Input files
    inputs.forEach((file) => {
      args.push('-i', file);
    });

    // Build concat filter (video-only, we will add BGM later)
    const vInputs = inputs.map((_, i) => `[${i}:v]`).join('');
    const filter = `${vInputs}concat=n=${inputs.length}:v=1:a=0[outv]`;

    args.push(
      '-filter_complex',
      filter,
      '-map',
      '[outv]',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-movflags',
      '+faststart',
      '-y',
      outputPath
    );

    const proc = spawn('ffmpeg', args);
    proc.stderr.on('data', (d) => process.stderr.write(d)); // progress logs
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const ok = await hasFfmpeg();
    if (!ok) {
      return res.status(500).json({
        success: false,
        error: 'ffmpeg not available on server. Install ffmpeg and retry.',
      });
    }

    const { segments, outputName } = req.body || {};
    if (!Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: 'segments array is required' });
    }

    // Keep only completed segments with videoUrl
    const completed = segments
      .filter((s) => s && s.videoUrl)
      .map((s, i) => ({
        idx: i,
        url: s.videoUrl,
        sceneNumber: s.sceneNumber ?? i + 1,
        title: s.title || `Segment ${i + 1}`,
      }));

    if (completed.length === 0) {
      return res.status(400).json({ error: 'No completed segments with videoUrl' });
    }

    // Prepare storage dir
    const root = process.cwd();
    const storeDir = path.join(root, 'storage', 'compiled');
    await fsp.mkdir(storeDir, { recursive: true });

    const id = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const workDir = path.join(storeDir, id);
    await fsp.mkdir(workDir, { recursive: true });

    // Download each segment
    const localFiles = [];
    for (let i = 0; i < completed.length; i++) {
      const local = path.join(workDir, `segment_${i + 1}.mp4`);
      console.log(`[compile-videos] downloading ${completed[i].url} -> ${local}`);
      await downloadToFile(completed[i].url, local);
      localFiles.push(local);
    }

    // Concat with re-encode (video-only)
    const outFile = path.join(workDir, `${(outputName || 'final_video').replace(/[^a-zA-Z0-9_\-]/g, '') || 'final_video'}.mp4`);
    console.log(`[compile-videos] merging ${localFiles.length} segments -> ${outFile}`);
    await runFfmpegConcatReencode(localFiles, outFile);

    // Build URLs
    const relative = `/api/compiled-video?id=${encodeURIComponent(id)}&file=${encodeURIComponent(path.basename(outFile))}`;
    const proto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] || 'http';
    const host = req.headers.host;
    const absolute = `${proto}://${host}${relative}`;

    return res.status(200).json({
      success: true,
      compiled: {
        id,
        count: localFiles.length,
        relativeUrl: relative,     // 프론트에서 바로 <video src>로 사용 가능
        url: absolute,             // 절대 URL도 제공
        fileName: path.basename(outFile),
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[compile-videos] error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// Stream a compiled video by id (and optional file name) with HTTP Range support.

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id, file } = req.query || {};
    if (!id) return res.status(400).json({ error: 'id is required' });

    const root = process.cwd();
    const baseDir = path.join(root, 'storage', 'compiled', String(id));
    const filePath = path.join(baseDir, file ? String(file) : 'final_video.mp4');

    // Security: prevent path traversal
    if (!filePath.startsWith(baseDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    await fsp.access(filePath, fs.constants.R_OK).catch(() => {
      throw new Error('File not found');
    });

    const stat = await fsp.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) {
        res.statusCode = 416; // Range Not Satisfiable
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', end - start + 1);

      const readStream = fs.createReadStream(filePath, { start, end });
      return readStream.pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize);
      const readStream = fs.createReadStream(filePath);
      return readStream.pipe(res);
    }
  } catch (error) {
    console.error('[compiled-video] error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

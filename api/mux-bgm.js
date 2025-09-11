import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { muxBgm } from './_ffmpeg.js';

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  try {
    const { mergedVideoUrl, bgmUrl } = req.body || {};
    if (!mergedVideoUrl || !bgmUrl) return res.status(400).json({error:'mergedVideoUrl & bgmUrl required'});

    const tmpDir = process.env.VIDEO_TMP_DIR || path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir,{recursive:true});

    // 단순히 로컬 경로라고 가정(필요시 다운로드)
    const videoFile = mergedVideoUrl.startsWith('/') ?
      path.resolve(process.cwd(), mergedVideoUrl.replace(/^\//,'')) :
      path.resolve(process.cwd(), mergedVideoUrl);

    const audioFile = bgmUrl.startsWith('/') ?
      path.resolve(process.cwd(), bgmUrl.replace(/^\//,'')) :
      path.resolve(process.cwd(), bgmUrl);

    const outFile = path.join(tmpDir, `final_${crypto.randomBytes(6).toString('hex')}.mp4`);
    await muxBgm(videoFile, audioFile, outFile, {fadeIn:1, fadeOut:1, volume:0.95, bgmVolume:0.35});

    res.status(200).json({
      success:true,
      finalVideoUrl: outFile.replace(process.cwd(), '')
    });
  } catch(e) {
    console.error('[mux-bgm] 오류:', e);
    res.status(500).json({error:e.message});
  }
}

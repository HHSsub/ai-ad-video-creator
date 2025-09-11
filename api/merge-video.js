import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { concatVideos } from './_ffmpeg.js';

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  try {
    const { segments } = req.body || {};
    if (!Array.isArray(segments) || segments.length===0)
      return res.status(400).json({error:'segments required (ordered array of {videoUrl})'});

    const tmpDir = process.env.VIDEO_TMP_DIR || path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir,{recursive:true});

    // 가정: videoUrl이 이미 로컬 접근 가능한 경로이거나 사전에 다운로드 되어 있음.
    // 필요 시 여기에서 URL -> 다운로드 추가.
    const files = segments.map(s=> s.videoUrl.startsWith('/') ?
      path.resolve(process.cwd(), s.videoUrl.replace(/^\//,'')) :
      path.resolve(process.cwd(), s.videoUrl)
    );

    const outFile = path.join(tmpDir, `merged_${crypto.randomBytes(6).toString('hex')}.mp4`);
    await concatVideos(files, outFile);

    res.status(200).json({
      success:true,
      mergedVideoUrl: outFile.replace(process.cwd(), '') // 상대경로 형태
    });
  } catch(e) {
    console.error('[merge-video] 오류:', e);
    res.status(500).json({error:e.message});
  }
}

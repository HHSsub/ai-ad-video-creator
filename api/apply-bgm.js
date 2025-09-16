import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { randomUUID } from 'crypto';

const UNIVERSAL_NAME = '범용';

function getDrive() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Missing Google credentials');
  const jwt = new google.auth.JWT(email, null, key, ['https://www.googleapis.com/auth/drive.readonly']);
  return google.drive({ version: 'v3', auth: jwt });
}

async function listFolders(drive, parentId) {
  const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id,name)'
  });
  return res.data.files || [];
}

async function listAudioFiles(drive, folderId) {
  const exts = ['mp3','wav','m4a','ogg'];
  const mimeFilter = exts.map(e => `name contains '.${e}'`).join(' or ');
  const q = `'${folderId}' in parents and trashed=false and (${mimeFilter})`;
  const res = await drive.files.list({
    q,
    fields: 'files(id,name,mimeType,size)'
  });
  return (res.data.files || []).map(f => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size
  }));
}

async function pickRandomBgm(mood) {
  const root = process.env.BGM_DRIVE_ROOT_ID;
  if (!root) throw new Error('BGM_DRIVE_ROOT_ID not set');
  console.log(`[pickRandomBgm] rootId: ${root}, mood: ${mood}`);

  const drive = getDrive();
  const folders = await listFolders(drive, root);

  const targetMood = (mood === '자동') ? UNIVERSAL_NAME : mood;
  const targetFolder = folders.find(f => f.name === targetMood);
  console.log(`[pickRandomBgm] targetMood: ${targetMood}, found folder: ${targetFolder ? targetFolder.name : 'NONE'}`);

  if (!targetFolder) throw new Error(`Mood folder not found: ${targetMood}`);

  const tracks = await listAudioFiles(drive, targetFolder.id);
  console.log(`[pickRandomBgm] Tracks in "${targetMood}": ${tracks.map(t=>t.name).join(', ')}`);

  if (!tracks.length) throw new Error(`No tracks in folder: ${targetMood}`);

  const chosen = tracks[Math.floor(Math.random() * tracks.length)];
  console.log(`[pickRandomBgm] Chosen track: ${chosen.name} (${chosen.id})`);
  return { folderName: targetFolder.name, ...chosen };
}

async function downloadDriveFile(fileId, outPath) {
  const drive = getDrive();
  const dest = fs.createWriteStream(outPath);
  return new Promise((resolve,reject)=>{
    drive.files.get({ fileId, alt:'media' }, { responseType:'stream' })
      .then(resp=>{
        resp.data
          .on('error', reject)
          .on('end', ()=> resolve(outPath))
          .pipe(dest);
      }).catch(reject);
  });
}

async function hasAudioStream(videoPath) {
  try {
    await exec(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`);
    return true;
  } catch {
    return false;
  }
}

async function mergeBgm(videoPath, bgmPath, options = {}) {
  const volume = parseFloat(process.env.BGM_VOLUME_DEFAULT || '0.9');
  const fadeSec = parseFloat(process.env.BGM_FADE_SECONDS || '1.5');
  const outDir = path.join(process.cwd(), 'tmp', 'bgm');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `merged-${Date.now()}-${randomUUID()}.mp4`);

  const audioPresent = await hasAudioStream(videoPath);
  let filterComplex;
  if (audioPresent) {
    filterComplex = `[1:a]volume=${volume},afade=t=in:st=0:d=${fadeSec},afade=t=out:st=5:d=${fadeSec}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
    await exec(`ffmpeg -y -i "${videoPath}" -i "${bgmPath}" -filter_complex "${filterComplex}" -map 0:v -map "[aout]" -c:v copy -c:a aac -shortest "${outFile}"`);
  } else {
    filterComplex = `volume=${volume},afade=t=in:st=0:d=${fadeSec}`;
    await exec(`ffmpeg -y -i "${videoPath}" -i "${bgmPath}" -filter:a "${filterComplex}" -c:v copy -c:a aac -shortest "${outFile}"`);
  }
  return outFile;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { videoPath, mood } = req.body;
    console.log(`[apply-bgm] request body:`, req.body);

    if (!videoPath || typeof videoPath !== 'string' || videoPath.trim().length < 5) {
      return res.status(400).json({ error: 'videoPath required (서버 로컬 경로 또는 마운트)' });
    }

    const bgmInfo = await pickRandomBgm(mood);
    const tmpBgmPath = path.join(process.cwd(), 'tmp', 'bgm', `${bgmInfo.name}-${Date.now()}.mp3`);
    await downloadDriveFile(bgmInfo.id, tmpBgmPath);

    const mergedVideoPath = await mergeBgm(videoPath, tmpBgmPath);
    console.log(`[apply-bgm] merged video path: ${mergedVideoPath}`);

    res.status(200).json({
      success: true,
      mergedVideoPath,
      bgm: bgmInfo,
    });
  } catch (error) {
    console.error('[apply-bgm] error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

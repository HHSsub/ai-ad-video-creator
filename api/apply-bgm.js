import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { exec as execCb } from 'child_process';
import { randomUUID } from 'crypto';

const exec = (cmd) => new Promise((resolve,reject)=>{
  execCb(cmd,(err,stdout,stderr)=>{
    if (err) return reject(new Error(stderr || err.message));
    resolve({ stdout, stderr });
  });
});

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const UNIVERSAL_NAME = '범용';

function getDrive() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g,'\n');
  if (!email || !key) throw new Error('Missing Google credentials');
  const jwt = new google.auth.JWT(email, null, key, SCOPES);
  return google.drive({ version: 'v3', auth: jwt });
}

async function listFolders(drive, parentId) {
  const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({ q, fields:'files(id,name)' });
  return res.data.files || [];
}

async function listAudioFiles(drive, folderId) {
  const exts = ['mp3','wav','m4a','ogg'];
  const extOr = exts.map(e=>`name contains '.${e}'`).join(' or ');
  const q = `'${folderId}' in parents and trashed=false and (${extOr})`;
  const res = await drive.files.list({ q, fields:'files(id,name,mimeType,size)' });
  return (res.data.files || []).map(f=>({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size
  }));
}

async function pickRandomBgm(mood) {
  const root = process.env.BGM_DRIVE_ROOT_ID;
  if (!root) throw new Error('BGM_DRIVE_ROOT_ID not set');

  const drive = getDrive();
  const folders = await listFolders(drive, root);

  // mood = "자동" → "범용"
  const targetMood = (mood === '자동') ? UNIVERSAL_NAME : mood;
  const targetFolder = folders.find(f => f.name === targetMood);
  if (!targetFolder) throw new Error(`Mood folder not found: ${targetMood}`);

  const tracks = await listAudioFiles(drive, targetFolder.id);
  if (!tracks.length) throw new Error(`No tracks in folder: ${targetMood}`);

  // 랜덤
  const chosen = tracks[Math.floor(Math.random() * tracks.length)];
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
  // 간단 판별: ffprobe (있으면 0, 없으면 !=0)
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
    // 기존 오디오 + BGM 믹스 (BGM 페이드 인/아웃)
    // 페이드 인/아웃 길이 추정 위해 BGM 길이를 ffprobe 로 가져오면 좋지만 단순화
    filterComplex = `[1:a]volume=${volume},afade=t=in:st=0:d=${fadeSec},afade=t=out:st=5:d=${fadeSec}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
    await exec(`ffmpeg -y -i "${videoPath}" -i "${bgmPath}" -filter_complex "${filterComplex}" -map 0:v -map "[aout]" -c:v copy -c:a aac -shortest "${outFile}"`);
  } else {
    // 오리지널 오디오 없음 → BGM만
    filterComplex = `volume=${volume},afade=t=in:st=0:d=${fadeSec}`;
    await exec(`ffmpeg -y -i "${bgmPath}" -filter_complex "${filterComplex}" -c:a aac -vn "${outFile}"`);
  }
  return outFile;
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  try {
    const { videoPath, mood } = req.body || {};
    if (!videoPath) return res.status(400).json({ error:'videoPath required (서버 로컬 경로 또는 마운트)' });
    if (!mood) return res.status(400).json({ error:'mood required' });

    if (!fs.existsSync(videoPath)) {
      return res.status(400).json({ error:`video not found: ${videoPath}` });
    }

    const track = await pickRandomBgm(mood);
    console.log('[apply-bgm] 선택된 트랙:', track);

    // 다운로드
    const tmpDir = path.join(process.cwd(), 'tmp', 'bgm_dl');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const ext = path.extname(track.name) || '.mp3';
    const localBgm = path.join(tmpDir, `${track.id}${ext}`);

    await downloadDriveFile(track.id, localBgm);

    const mergedVideo = await mergeBgm(videoPath, localBgm);
    res.status(200).json({
      success: true,
      moodSelected: mood,
      resolvedMoodFolder: track.folderName,
      chosenTrack: {
        id: track.id,
        name: track.name
      },
      outputVideo: mergedVideo
    });

  } catch (e) {
    console.error('[apply-bgm] error:', e);
    res.status(500).json({ success:false, error: e.message });
  }
}

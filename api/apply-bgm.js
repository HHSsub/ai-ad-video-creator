import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { randomUUID } from 'crypto';

const BGM_DIR = path.join(process.cwd(), 'BGM');

// 드롭다운 mood 목록 추출 (style.mood_number.mp3에서 mood만 뽑음)
function getMoodList() {
  const files = fs.readdirSync(BGM_DIR);
  const moods = new Set();
  files.forEach(file => {
    const match = file.match(/^([^.]+)\.([^.]+)_\d+\.mp3$/);
    if (match) moods.add(match[2]);
  });
  return Array.from(moods);
}

// 특정 mood에 해당하는 모든 파일 반환 (style 관계없이)
function listBgmFilesForMood(mood) {
  const files = fs.readdirSync(BGM_DIR);
  return files.filter(file => {
    const match = file.match(/^([^.]+)\.([^.]+)_\d+\.mp3$/);
    return match && match[2] === mood;
  });
}

// mood에 맞는 파일 중 하나 랜덤 선택
function pickRandomBgm(mood) {
  const bgmFiles = listBgmFilesForMood(mood);
  if (!bgmFiles.length) throw new Error(`해당 mood의 BGM이 없습니다: ${mood}`);
  const chosen = bgmFiles[Math.floor(Math.random() * bgmFiles.length)];
  return {
    name: chosen,
    path: path.join(BGM_DIR, chosen),
    mood: mood,
  };
}

function hasAudioStream(videoPath) {
  return new Promise((resolve) => {
    exec(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`, 
      (error, stdout) => {
        resolve(!error && stdout.trim().length > 0);
      });
  });
}

function mergeBgm(videoPath, bgmPath, options = {}) {
  return new Promise(async (resolve, reject) => {
    const volume = parseFloat(process.env.BGM_VOLUME_DEFAULT || '0.9');
    const fadeSec = parseFloat(process.env.BGM_FADE_SECONDS || '1.5');
    const outDir = path.join(process.cwd(), 'tmp', 'bgm');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `merged-${Date.now()}-${randomUUID()}.mp4`);

    const audioPresent = await hasAudioStream(videoPath);
    let filterComplex;
    let cmd;
    if (audioPresent) {
      filterComplex = `[1:a]volume=${volume},afade=t=in:st=0:d=${fadeSec},afade=t=out:st=5:d=${fadeSec}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
      cmd = `ffmpeg -y -i "${videoPath}" -i "${bgmPath}" -filter_complex "${filterComplex}" -map 0:v -map "[aout]" -c:v copy -c:a aac -shortest "${outFile}"`;
    } else {
      filterComplex = `volume=${volume},afade=t=in:st=0:d=${fadeSec}`;
      cmd = `ffmpeg -y -i "${videoPath}" -i "${bgmPath}" -filter:a "${filterComplex}" -c:v copy -c:a aac -shortest "${outFile}"`;
    }
    exec(cmd, (error) => {
      if (error) return reject(error);
      resolve(outFile);
    });
  });
}

// 드롭다운용 mood 목록 제공 API (GET)
export async function get(req, res) {
  const moods = getMoodList();
  res.status(200).json({ moods });
}

// main apply-bgm API (POST)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return await get(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { videoPath, mood } = req.body;
    if (!videoPath || typeof videoPath !== 'string' || videoPath.trim().length < 5) {
      return res.status(400).json({ error: 'videoPath required (서버 로컬 경로 또는 마운트)' });
    }

    const bgmInfo = pickRandomBgm(mood);
    const mergedVideoPath = await mergeBgm(videoPath, bgmInfo.path);

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

// api/apply-bgm.js - 권한 문제 해결 + 에러 핸들링 강화

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { randomUUID } from 'crypto';

const BGM_DIR = path.join(process.cwd(), 'BGM');

// 🔥 수정: 안전한 파일 시스템 접근
function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch (error) {
    console.error(`[apply-bgm] 디렉토리 읽기 실패: ${dirPath}`, error.message);
    return [];
  }
}

function safeStatSync(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    console.error(`[apply-bgm] 파일 정보 확인 실패: ${filePath}`, error.message);
    return null;
  }
}

// 모든 style.mood 폴더명 반환 (에러 핸들링 추가)
function getStyleMoodFolders() {
  if (!fs.existsSync(BGM_DIR)) {
    console.error(`[apply-bgm] BGM 디렉토리가 존재하지 않음: ${BGM_DIR}`);
    return [];
  }

  return safeReadDir(BGM_DIR).filter(name => {
    const fullPath = path.join(BGM_DIR, name);
    const stat = safeStatSync(fullPath);
    return stat && stat.isDirectory();
  });
}

// mood 목록 추출 (폴더명에서 . 뒤 부분)
function getMoodList() {
  const folders = getStyleMoodFolders();
  const moods = new Set();

  folders.forEach(folder => {
    const parts = folder.split('.');
    if (parts.length === 2) {
      moods.add(parts[1]);
    }
  });

  console.log(`[apply-bgm] 발견된 mood 목록:`, Array.from(moods));
  return Array.from(moods);
}

// 특정 mood에 해당하는 모든 .mp3 파일 경로 리스트
function listBgmFilesForMood(mood) {
  const folders = getStyleMoodFolders().filter(name => name.split('.')[1] === mood);
  let files = [];

  folders.forEach(folder => {
    const dirPath = path.join(BGM_DIR, folder);

    // 🔥 수정: 안전한 디렉토리 접근
    const mp3Files = safeReadDir(dirPath).filter(file => file.endsWith('.mp3'));

    mp3Files.forEach(file => {
      const filePath = path.join(dirPath, file);

      // 파일 접근 가능성 확인
      if (fs.existsSync(filePath)) {
        const match = file.match(/^([^.]+)\.([^.]+)_(\d+)\.mp3$/);
        if (match && match[2] === mood) {
          files.push({
            style: match[1],
            mood: match[2],
            number: match[3],
            name: file,
            path: filePath
          });
        }
      } else {
        console.warn(`[apply-bgm] 파일에 접근할 수 없음: ${filePath}`);
      }
    });
  });

  console.log(`[apply-bgm] mood "${mood}"에 대해 ${files.length}개 BGM 파일 발견`);
  return files;
}

// mood에 맞는 파일 중 하나 랜덤 선택
function pickRandomBgm(mood) {
  const bgmFiles = listBgmFilesForMood(mood);
  if (!bgmFiles.length) {
    throw new Error(`해당 mood의 BGM이 없습니다: ${mood}`);
  }
  const chosen = bgmFiles[Math.floor(Math.random() * bgmFiles.length)];
  console.log(`[apply-bgm] 선택된 BGM:`, chosen);
  return chosen;
}

// Helper to download video to tmp
async function downloadVideoToTmp(videoUrl) {
  // If it's already a local path, return it
  if (!videoUrl.startsWith('http')) return videoUrl;

  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const fileName = `download-${Date.now()}-${randomUUID()}.mp4`;
  const destPath = path.join(tmpDir, fileName);

  console.log(`[apply-bgm] Downloading video: ${videoUrl} -> ${destPath}`);

  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to download video: ${res.statusText}`);

  const buffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
  return destPath;
}

// 🔥 수정된 비디오 길이 확인 함수 (Local File Only)
function getVideoDuration(localPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(localPath)) {
      console.error(`[apply-bgm] File not found: ${localPath}`);
      return resolve(10);
    }
    exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${localPath}"`,
      (error, stdout) => {
        if (error) {
          console.warn(`[apply-bgm] Length probe failed: ${error.message}`);
          resolve(10);
        } else {
          const duration = parseFloat(stdout.trim()) || 10;
          console.log(`[apply-bgm] Video Duration: ${duration}s`);
          resolve(duration);
        }
      });
  });
}

function hasAudioStream(localPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(localPath)) return resolve(false);
    exec(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${localPath}"`,
      (error, stdout) => {
        resolve(!error && stdout.trim().length > 0);
      });
  });
}

// 🔥 수정된 BGM 합성 함수
function mergeBgm(videoUrlOrPath, bgmPath, options = {}) {
  return new Promise(async (resolve, reject) => {
    const volume = parseFloat(process.env.BGM_VOLUME_DEFAULT || '0.3');
    const fadeSec = parseFloat(process.env.BGM_FADE_SECONDS || '1.0');

    // Output Directory
    const outDir = path.join(process.cwd(), 'tmp', 'bgm');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    let localVideoPath = null;

    try {
      // 1. Download Video if Remote
      localVideoPath = await downloadVideoToTmp(videoUrlOrPath);

      // 2. Check Existence
      if (!fs.existsSync(localVideoPath)) throw new Error('Video file missing');
      if (!fs.existsSync(bgmPath)) throw new Error('BGM file missing');

      const outFile = path.join(outDir, `merged-${Date.now()}-${randomUUID()}.mp4`);

      // 3. Get Info
      const videoDuration = await getVideoDuration(localVideoPath);
      const audioPresent = await hasAudioStream(localVideoPath);

      console.log(`[apply-bgm] Processing: ${localVideoPath} (${videoDuration}s) + ${bgmPath}`);

      let cmd;
      // Use -stream_loop -1 for infinite BGM loop
      // Use -t videoDuration to cut exactly at video end
      if (audioPresent) {
        cmd = `ffmpeg -y -i "${localVideoPath}" -stream_loop -1 -i "${bgmPath}" ` +
          `-filter_complex "[1:a]volume=${volume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]" ` +
          `-map 0:v -map "[aout]" -c:v copy -c:a aac -t ${videoDuration} "${outFile}"`;
      } else {
        cmd = `ffmpeg -y -i "${localVideoPath}" -stream_loop -1 -i "${bgmPath}" ` +
          `-filter_complex "[1:a]volume=${volume}[bgm]" ` +
          `-map 0:v -map "[bgm]" -c:v copy -c:a aac -t ${videoDuration} "${outFile}"`;
      }

      exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[apply-bgm] FFmpeg Error: ${error.message}`);
          console.error(stderr);
          reject(error);
        } else {
          resolve(outFile);
        }
      });

    } catch (err) {
      console.error(`[apply-bgm] Internal Error:`, err);
      reject(err);
    }
  });
}


// 드롭다운용 mood 목록 제공 API (GET)
export async function get(req, res) {
  try {
    console.log('[apply-bgm] GET 요청 - mood 목록 조회');
    const moods = getMoodList();

    res.status(200).json({
      success: true,
      moods: moods,
      total: moods.length,
      bgmDirectory: BGM_DIR,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[apply-bgm] GET 요청 처리 중 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      moods: [],
      bgmDirectory: BGM_DIR
    });
  }
}

// 🔥 비디오 경로 해결 함수 (Missing Function Fix)
function resolveVideoPath(videoPath) {
  if (!videoPath) return '';
  if (videoPath.startsWith('http')) return videoPath;
  if (path.isAbsolute(videoPath)) return videoPath;
  return path.resolve(process.cwd(), videoPath);
}

// main apply-bgm API (POST)
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return await get(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();

  try {
    console.log('[apply-bgm] POST 요청 수신:', req.body);

    const { videoPath, mood } = req.body;

    // 🔥 입력 검증 강화
    if (!videoPath || typeof videoPath !== 'string' || videoPath.trim().length < 5) {
      console.error('[apply-bgm] 잘못된 videoPath:', videoPath);
      return res.status(400).json({
        success: false,
        error: 'videoPath required (서버 로컬 경로 또는 마운트)',
        received: { videoPath, mood }
      });
    }

    if (!mood || typeof mood !== 'string') {
      console.error('[apply-bgm] 잘못된 mood:', mood);
      return res.status(400).json({
        success: false,
        error: 'mood required',
        availableMoods: getMoodList(),
        received: { videoPath, mood }
      });
    }

    // BGM 디렉토리 존재 확인
    if (!fs.existsSync(BGM_DIR)) {
      console.error(`[apply-bgm] BGM 디렉토리가 존재하지 않음: ${BGM_DIR}`);
      return res.status(500).json({
        success: false,
        error: 'BGM 디렉토리가 존재하지 않습니다',
        bgmDirectory: BGM_DIR
      });
    }

    // 🔥 비디오 파일 존재 확인 (URL이면 스킵)
    const resolvedVideoPath = resolveVideoPath(videoPath);
    if (!resolvedVideoPath.startsWith('http') && !fs.existsSync(resolvedVideoPath)) {
      console.error(`[apply-bgm] 비디오 파일이 존재하지 않음: ${resolvedVideoPath}`);
      return res.status(400).json({
        success: false,
        error: '비디오 파일이 존재하지 않습니다',
        originalPath: videoPath,
        resolvedPath: resolvedVideoPath
      });
    }

    // BGM 파일 선택
    let bgmInfo;
    try {
      bgmInfo = pickRandomBgm(mood);
    } catch (bgmError) {
      console.error(`[apply-bgm] BGM 선택 실패:`, bgmError.message);
      return res.status(400).json({
        success: false,
        error: bgmError.message,
        availableMoods: getMoodList(),
        requestedMood: mood
      });
    }

    // BGM 합성 실행
    let mergedVideoPath;
    try {
      mergedVideoPath = await mergeBgm(videoPath, bgmInfo.path);
    } catch (mergeError) {
      console.error(`[apply-bgm] BGM 합성 실패:`, mergeError.message);
      return res.status(500).json({
        success: false,
        error: `BGM 합성 실패: ${mergeError.message}`,
        bgmInfo: bgmInfo,
        videoPath: resolvedVideoPath
      });
    }

    const processingTime = Date.now() - startTime;

    // 🔥 성공 응답에 상세 정보 포함
    const response = {
      success: true,
      mergedVideoPath: mergedVideoPath,
      bgm: {
        ...bgmInfo,
        mood: mood,
        selectedFrom: `${bgmInfo.style}.${bgmInfo.mood}_${bgmInfo.number}.mp3`
      },
      processing: {
        originalVideoPath: videoPath,
        resolvedVideoPath: resolvedVideoPath,
        processingTime: processingTime + 'ms',
        timestamp: new Date().toISOString()
      },
      fileInfo: {
        outputExists: fs.existsSync(mergedVideoPath),
        outputSize: fs.existsSync(mergedVideoPath) ? fs.statSync(mergedVideoPath).size : 0
      }
    };

    console.log('[apply-bgm] ✅ BGM 적용 완료:', {
      mood: mood,
      bgmFile: bgmInfo.name,
      processingTime: processingTime + 'ms',
      outputSize: response.fileInfo.outputSize + ' bytes'
    });

    res.status(200).json(response);

  } catch (error) {
    const processingTime = Date.now() - startTime;

    console.error('[apply-bgm] ❌ 전체 오류:', error);
    console.error('[apply-bgm] 스택 트레이스:', error.stack);

    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error occurred',
      details: {
        errorType: error.constructor.name,
        processingTime: processingTime + 'ms',
        timestamp: new Date().toISOString(),
        bgmDirectory: BGM_DIR,
        bgmDirectoryExists: fs.existsSync(BGM_DIR),
        availableMoods: getMoodList(),
        // 개발 환경에서만 스택 트레이스 포함
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      }
    });
  }
}

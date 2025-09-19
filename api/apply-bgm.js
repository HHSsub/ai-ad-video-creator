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

// 🔥 수정: 비디오 파일 경로 처리 개선
function resolveVideoPath(videoPath) {
  // URL인 경우 그대로 반환 (이미 public에 있는 파일)
  if (videoPath.startsWith('http')) {
    return videoPath;
  }
  
  // /tmp/compiled로 시작하는 경우 프로젝트 루트 기준으로 처리
  if (videoPath.startsWith('/tmp/')) {
    return path.join(process.cwd(), videoPath.substring(1));
  }
  
  // 절대 경로인 경우 그대로 사용
  if (path.isAbsolute(videoPath)) {
    return videoPath;
  }
  
  // 상대 경로인 경우 프로젝트 루트 기준
  return path.join(process.cwd(), videoPath);
}

function hasAudioStream(videoPath) {
  return new Promise((resolve) => {
    const resolvedPath = resolveVideoPath(videoPath);
    
    if (!fs.existsSync(resolvedPath)) {
      console.error(`[apply-bgm] 비디오 파일이 존재하지 않음: ${resolvedPath}`);
      resolve(false);
      return;
    }

    exec(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${resolvedPath}"`, 
      (error, stdout) => {
        if (error) {
          console.warn(`[apply-bgm] 오디오 스트림 확인 실패: ${error.message}`);
        }
        resolve(!error && stdout.trim().length > 0);
      });
  });
}

// 🔥 수정된 비디오 길이 확인 함수
function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    const resolvedPath = resolveVideoPath(videoPath);
    
    if (!fs.existsSync(resolvedPath)) {
      console.error(`[apply-bgm] 비디오 파일이 존재하지 않음: ${resolvedPath}`);
      resolve(10); // 기본값 10초
      return;
    }

    exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${resolvedPath}"`, 
      (error, stdout) => {
        if (error) {
          console.warn(`[apply-bgm] 비디오 길이 확인 실패: ${error.message}`);
          resolve(10); // 기본값 10초
        } else {
          const duration = parseFloat(stdout.trim()) || 10;
          console.log(`[apply-bgm] 비디오 길이: ${duration}초`);
          resolve(duration);
        }
      });
  });
}

// 🔥 수정된 BGM 합성 함수
function mergeBgm(videoPath, bgmPath, options = {}) {
  return new Promise(async (resolve, reject) => {
    const volume = parseFloat(process.env.BGM_VOLUME_DEFAULT || '0.3'); // 볼륨 낮춤
    const fadeSec = parseFloat(process.env.BGM_FADE_SECONDS || '1.0');
    
    // 출력 디렉토리 생성
    const outDir = path.join(process.cwd(), 'tmp', 'bgm');
    
    try {
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
        console.log(`[apply-bgm] 출력 디렉토리 생성: ${outDir}`);
      }
    } catch (error) {
      console.error(`[apply-bgm] 출력 디렉토리 생성 실패: ${error.message}`);
      return reject(error);
    }

    const outFile = path.join(outDir, `merged-${Date.now()}-${randomUUID()}.mp4`);
    const resolvedVideoPath = resolveVideoPath(videoPath);

    // 입력 파일들 존재 확인
    if (!fs.existsSync(resolvedVideoPath)) {
      return reject(new Error(`비디오 파일이 존재하지 않습니다: ${resolvedVideoPath}`));
    }
    
    if (!fs.existsSync(bgmPath)) {
      return reject(new Error(`BGM 파일이 존재하지 않습니다: ${bgmPath}`));
    }

    console.log(`[apply-bgm] BGM 합성 시작:`, {
      videoPath: resolvedVideoPath,
      bgmPath: bgmPath,
      outputPath: outFile,
      volume: volume,
      fadeSec: fadeSec
    });

    try {
      // 🔥 비디오 길이 확인
      const videoDuration = await getVideoDuration(resolvedVideoPath);
      const audioPresent = await hasAudioStream(resolvedVideoPath);
      
      let cmd;
      
      if (audioPresent) {
        // 기존 오디오가 있는 경우 - 믹싱
        cmd = `ffmpeg -y -i "${resolvedVideoPath}" -i "${bgmPath}" ` +
              `-filter_complex "[1:a]volume=${volume},aloop=loop=-1:size=2e+09[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]" ` +
              `-map 0:v -map "[aout]" -c:v copy -c:a aac -t ${videoDuration} "${outFile}"`;
      } else {
        // 기존 오디오가 없는 경우 - BGM만 추가
        cmd = `ffmpeg -y -i "${resolvedVideoPath}" -i "${bgmPath}" ` +
              `-filter_complex "[1:a]volume=${volume},aloop=loop=-1:size=2e+09[bgm]" ` +
              `-map 0:v -map "[bgm]" -c:v copy -c:a aac -t ${videoDuration} "${outFile}"`;
      }

      console.log(`[apply-bgm] FFmpeg 명령어 실행`);
      console.log(`[apply-bgm] 비디오 길이: ${videoDuration}초, 기존 오디오: ${audioPresent ? '있음' : '없음'}`);
      
      exec(cmd, {timeout: 120000}, (error, stdout, stderr) => {
        if (error) {
          console.error(`[apply-bgm] FFmpeg 실행 실패:`, error.message);
          console.error(`[apply-bgm] stderr:`, stderr);
          return reject(error);
        }
        
        // 🔥 결과 파일 검증
        if (!fs.existsSync(outFile)) {
          return reject(new Error(`출력 파일이 생성되지 않았습니다: ${outFile}`));
        }
        
        const outputStats = fs.statSync(outFile);
        if (outputStats.size === 0) {
          return reject(new Error(`출력 파일이 비어있습니다: ${outFile}`));
        }
        
        console.log(`[apply-bgm] BGM 합성 완료: ${outFile} (${(outputStats.size / 1024 / 1024).toFixed(2)} MB)`);
        
        // 🔥 public URL로 변환
        const publicFileName = path.basename(outFile);
        const publicUrl = `/tmp/bgm/${publicFileName}`;
        
        resolve(publicUrl);
      });
      
    } catch (audioCheckError) {
      console.error(`[apply-bgm] 비디오 분석 중 오류:`, audioCheckError.message);
      reject(audioCheckError);
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

    // 🔥 비디오 파일 존재 확인
    const resolvedVideoPath = resolveVideoPath(videoPath);
    if (!fs.existsSync(resolvedVideoPath)) {
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

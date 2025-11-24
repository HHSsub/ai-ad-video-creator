// api/compile-videos.js - 🔥 영상 저장 경로 수정 (/tmp → /public/videos 또는 /dist/videos)
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import sessionStore from '../src/utils/sessionStore.js';

const MAX_DOWNLOAD_RETRIES = 3;
const DOWNLOAD_TIMEOUT = 30000;
const FFMPEG_TIMEOUT = 120000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 🔥 영상 저장 경로 결정 (nginx에서 접근 가능한 경로)
function getPublicVideoDir() {
  const projectRoot = process.cwd();
  
  // 우선순위 1: /public/videos/ (개발/빌드 환경 공통)
  const publicVideosDir = path.resolve(projectRoot, 'public', 'videos', 'compiled');
  
  // 우선순위 2: /dist/videos/ (프로덕션 빌드)
  const distVideosDir = path.resolve(projectRoot, 'dist', 'videos', 'compiled');
  
  // public 폴더가 있으면 사용, 없으면 dist 사용
  if (fs.existsSync(path.resolve(projectRoot, 'public'))) {
    if (!fs.existsSync(publicVideosDir)) {
      fs.mkdirSync(publicVideosDir, { recursive: true });
      console.log('[compile-videos] 📁 생성: public/videos/compiled/');
    }
    return { dir: publicVideosDir, urlPrefix: '/videos/compiled' };
  } else {
    if (!fs.existsSync(distVideosDir)) {
      fs.mkdirSync(distVideosDir, { recursive: true });
      console.log('[compile-videos] 📁 생성: dist/videos/compiled/');
    }
    return { dir: distVideosDir, urlPrefix: '/videos/compiled' };
  }
}

// 안전한 파일 다운로드
async function downloadWithRetry(url, filePath, maxRetries = MAX_DOWNLOAD_RETRIES) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[download] 시도 ${attempt}/${maxRetries}: ${url.substring(0, 50)}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'AI-Ad-Creator/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      
      const fileSize = buffer.length;
      console.log(`[download] 성공: ${filePath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
      
      return fileSize;
      
    } catch (error) {
      lastError = error;
      console.error(`[download] 시도 ${attempt} 실패:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = 1000 * attempt;
        console.log(`[download] ${delay}ms 후 재시도...`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError || new Error('다운로드 최대 재시도 초과');
}

// FFmpeg 실행
function runFFmpeg(args, label = 'ffmpeg', workingDir = null) {
  return new Promise((resolve, reject) => {
    console.log(`[${label}] 실행: ffmpeg ${args.join(' ')}`);
    
    const options = workingDir ? { cwd: workingDir, stdio: ['pipe', 'pipe', 'pipe'] } : { stdio: ['pipe', 'pipe', 'pipe'] };
    const process = spawn('ffmpeg', args, options);
    
    let stdout = '';
    let stderr = '';
    let isTimeout = false;
    let lastProgressTime = Date.now();
    
    if (process.stdin) {
      process.stdin.end();
    }
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
      lastProgressTime = Date.now();
    });
    
    process.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      lastProgressTime = Date.now();
      
      if (output.includes('time=')) {
        console.log(`[${label}] 진행 중...`);
      }
    });
    
    const timeout = setTimeout(() => {
      console.error(`[${label}] ❌ 타임아웃 (${FFMPEG_TIMEOUT}ms) - 프로세스 강제 종료`);
      isTimeout = true;
      process.kill('SIGKILL');
      reject(new Error(`FFmpeg timeout after ${FFMPEG_TIMEOUT}ms`));
    }, FFMPEG_TIMEOUT);
    
    const progressCheck = setInterval(() => {
      if (Date.now() - lastProgressTime > 30000) {
        console.error(`[${label}] ❌ 30초 동안 진행 없음 - 프로세스 강제 종료`);
        clearInterval(progressCheck);
        clearTimeout(timeout);
        process.kill('SIGKILL');
        reject(new Error(`FFmpeg stuck - no progress for 30 seconds`));
      }
    }, 5000);
    
    process.on('close', (code) => {
      clearTimeout(timeout);
      clearInterval(progressCheck);
      
      if (isTimeout) return;
      
      console.log(`[${label}] 종료 코드: ${code}`);
      
      if (code === 0) {
        console.log(`[${label}] ✅ 성공`);
        resolve({ success: true, stdout, stderr });
      } else {
        console.error(`[${label}] ❌ 실패, 코드: ${code}`);
        console.error(`[${label}] stderr:`, stderr.slice(-500));
        reject(new Error(`FFmpeg failed with code ${code}`));
      }
    });
    
    process.on('error', (error) => {
      clearTimeout(timeout);
      clearInterval(progressCheck);
      console.error(`[${label}] 프로세스 오류:`, error);
      reject(error);
    });
  });
}

// 비디오 길이 조정
async function trimVideo(inputPath, outputPath, targetDuration = 2) {
  const args = [
    '-y',
    '-i', path.basename(inputPath),
    '-t', targetDuration.toString(),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-c:a', 'aac',
    '-ac', '1',
    '-movflags', '+faststart',
    path.basename(outputPath)
  ];
  
  await runFFmpeg(args, `trim-${targetDuration}s`, path.dirname(inputPath));
}

// 사용자 선택 영상 길이 정확히 파싱
function parseUserVideoLength(videoLength) {
  if (typeof videoLength === 'number') {
    return videoLength;
  }
  
  if (typeof videoLength === 'string') {
    const match = videoLength.match(/(\d+)/);
    if (match) {
      const seconds = parseInt(match[1], 10);
      if ([10, 20, 30].includes(seconds)) {
        return seconds;
      }
    }
  }
  
  console.warn(`[parseUserVideoLength] 잘못된 영상 길이: ${videoLength}, 기본값 10초 사용`);
  return 10;
}

// 필요한 클립 개수 계산
function calculateRequiredClips(userVideoLengthSeconds) {
  const clipDuration = 2;
  return Math.floor(userVideoLengthSeconds / clipDuration);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();
  let tempDir = null;

  try {
    let body;
    if (req.body) {
      body = req.body;
    } else if (typeof req.json === 'function') {
      body = await req.json();
    } else {
      body = {};
    }

    const {
      sessionId,
      concept,
      segments,
      fps = 24,
      scale = '1280:720',
      jsonMode = false,
      targetDuration = null,
      videoLength,
      formData = {}
    } = body;

    if (!Array.isArray(segments) || !segments.length) {
      return res.status(400).json({ error: 'segments[] required' });
    }

    // 사용자가 선택한 영상 길이를 정확히 파싱
    let userSelectedVideoLengthSeconds = 10;
    
    const videoLengthSource = videoLength || formData.videoLength || targetDuration;
    
    if (videoLengthSource) {
      userSelectedVideoLengthSeconds = parseUserVideoLength(videoLengthSource);
    }
    
    console.log(`[compile-videos] 🔥 사용자 선택 영상 길이: ${userSelectedVideoLengthSeconds}초 (원본: ${videoLengthSource})`);

    const requiredClipCount = calculateRequiredClips(userSelectedVideoLengthSeconds);
    const clipDurationSeconds = 2;
    
    console.log('[compile-videos] 🚀 정확한 길이 반영 시작:', {
      sessionId: sessionId || 'N/A',
      concept: concept || 'N/A',
      사용자선택길이: `${userSelectedVideoLengthSeconds}초`,
      필요클립개수: requiredClipCount,
      클립당길이: `${clipDurationSeconds}초`,
      총세그먼트: segments.length,
      예상최종길이: `${requiredClipCount * clipDurationSeconds}초`,
      정확일치여부: (requiredClipCount * clipDurationSeconds) === userSelectedVideoLengthSeconds ? '✅' : '❌'
    });

    if (sessionId) {
      try {
        sessionStore.updateProgress(sessionId, {
          phase: 'COMPOSE',
          currentStep: `${concept} - 클립 다운로드 시작...`,
          percentage: 75,
        });
      } catch (err) {
        console.warn('[compile-videos] 진행률 업데이트 실패:', err.message);
      }
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-videos-'));
    console.log('[compile-videos] 임시 디렉토리:', tempDir);

    let totalOriginalDuration = 0;
    const segmentsToUse = segments.slice(0, requiredClipCount);

    // 🔥 videoUrl 없는 세그먼트 필터링 (imageUrl만 있는 경우 제외)
    const validSegments = segmentsToUse.filter((seg, i) => {
      if (!seg.videoUrl || seg.videoUrl.trim() === '') {
        console.warn(`[compile-videos] ⚠️ 세그먼트 ${i + 1} videoUrl 누락 - 스킵`);
        return false;
      }
      return true;
    });

    if (validSegments.length === 0) {
      throw new Error('유효한 videoUrl을 가진 세그먼트가 없습니다. 모든 씬의 비디오 생성이 완료되었는지 확인하세요.');
    }

    console.log(`[compile-videos] 유효한 세그먼트: ${validSegments.length}/${segmentsToUse.length}개`);

    const processedClips = [];

    // 1단계: 개별 클립 다운로드 및 처리
    console.log('[compile-videos] 1단계: 개별 클립 다운로드 및 처리');
    
    for (let i = 0; i < validSegments.length; i++) {
      try {
        const segment = validSegments[i];
        const videoUrl = segment.videoUrl;

        if (!videoUrl || !videoUrl.startsWith('http')) {
          console.error(`[compile-videos] 잘못된 videoUrl: ${videoUrl}`);
          continue;
        }

        const originalFileName = `original_${i + 1}_${crypto.randomBytes(4).toString('hex')}.mp4`;
        const originalPath = path.join(tempDir, originalFileName);

        await downloadWithRetry(videoUrl, originalPath);

        const trimmedFileName = `trimmed_${i + 1}_${crypto.randomBytes(4).toString('hex')}.mp4`;
        const trimmedPath = path.join(tempDir, trimmedFileName);

        await trimVideo(originalPath, trimmedPath, clipDurationSeconds);

        const finalFileName = `processed_${i + 1}_${crypto.randomBytes(4).toString('hex')}.mp4`;
        const finalPath = path.join(tempDir, finalFileName);

        await runFFmpeg([
          '-y',
          '-i', path.basename(trimmedPath),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-vf', `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,fps=${fps}`,
          '-c:a', 'aac',
          '-ar', '44100',
          '-ac', '1',
          '-b:a', '64k',
          '-movflags', '+faststart',
          finalFileName
        ], `process-${i + 1}`, tempDir);

        processedClips.push(finalPath);
        
        try {
          fs.unlinkSync(originalPath);
          fs.unlinkSync(trimmedPath);
        } catch (e) {
          console.warn('[compile-videos] 임시 파일 정리 실패:', e.message);
        }

        console.log(`[compile-videos] ✅ 세그먼트 ${i + 1} 처리 완료 (${clipDurationSeconds}초)`);

        if (sessionId && (i + 1) % 2 === 0) {
          const clipProgress = Math.round(82 + ((i + 1) / validSegments.length) * 8);
          try {
            sessionStore.updateProgress(sessionId, {
              phase: 'COMPOSE',
              currentStep: `${concept} - 클립 처리 중 (${i + 1}/${validSegments.length})`,
              percentage: clipProgress,
            });
          } catch (err) {
            console.warn('[compile-videos] 진행률 업데이트 실패:', err.message);
          }
        }

      } catch (error) {
        console.error(`[compile-videos] 세그먼트 ${i + 1} 처리 실패:`, error.message);
      }
    }

    if (!processedClips.length) {
      throw new Error('처리된 비디오 클립이 없습니다');
    }

    console.log(`[compile-videos] 클립 처리 완료: ${processedClips.length}개 (각 ${clipDurationSeconds}초)`);

    // 2단계: 비디오 합치기
    console.log('[compile-videos] 2단계: 비디오 합치기 (정확한 길이 반영)');
    
    if (sessionId) {
      try {
        sessionStore.updateProgress(sessionId, {
          phase: 'COMPOSE',
          currentStep: `${concept} - FFmpeg 합성 중...`,
          percentage: 90,
        });
      } catch (err) {
        console.warn('[compile-videos] 진행률 업데이트 실패:', err.message);
      }
    }
    
    const listContent = processedClips.map(clipPath => 
      `file '${path.basename(clipPath)}'`
    ).join('\n');
    
    const listFilePath = path.join(tempDir, 'concat_list.txt');
    fs.writeFileSync(listFilePath, listContent);
    
    console.log('[compile-videos] Concat 리스트 생성:', processedClips.length, '개 파일');

    const outputFileName = `compiled_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp4`;
    const outputPath = path.join(tempDir, outputFileName);

    await runFFmpeg([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat_list.txt',
      '-c', 'copy',
      '-movflags', '+faststart',
      outputFileName
    ], 'concat', tempDir);

    console.log('[compile-videos] 합치기 완료:', outputFileName);

    // 3단계: 결과 검증 및 처리
    const processingTime = Date.now() - startTime;
    const actualCompiledDuration = processedClips.length * clipDurationSeconds;
    const isLengthCorrect = actualCompiledDuration === userSelectedVideoLengthSeconds;
    
    console.log('[compile-videos] 🎉 최종 결과 검증:', {
      사용자선택길이: `${userSelectedVideoLengthSeconds}초`,
      실제생성길이: `${actualCompiledDuration}초`,
      클립개수: processedClips.length,
      클립당길이: `${clipDurationSeconds}초`,
      길이정확성: isLengthCorrect ? '✅ 정확함' : '❌ 불일치',
      처리시간: `${processingTime}ms`
    });
    
    if (jsonMode) {
      // 🔥 수정: 영상 저장 경로 변경 (/tmp → /public/videos 또는 /dist/videos)
      const { dir: publicDir, urlPrefix } = getPublicVideoDir();
      
      const publicFileName = outputFileName;
      const publicPath = path.join(publicDir, publicFileName);
      
      fs.copyFileSync(outputPath, publicPath);
      console.log('[compile-videos] ✅ 파일 복사 완료:', outputPath, '→', publicPath);
      
      try {
        fs.chmodSync(publicPath, 0o644);
      } catch (e) {
        console.warn('[compile-videos] 권한 설정 실패:', e.message);
      }
      
      // 🔥 수정: URL 경로 변경
      const publicUrl = `${urlPrefix}/${publicFileName}`;
      
      const fileExists = fs.existsSync(publicPath);
      const fileSize = fileExists ? fs.statSync(publicPath).size : 0;
      
      console.log('[compile-videos] ✅ JSON 모드 완료:', {
        publicUrl,
        fileExists,
        fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
        duration: actualCompiledDuration,
        lengthCorrect: isLengthCorrect,
        처리시간: processingTime + 'ms',
        저장경로: publicPath
      });

      if (sessionId) {
        try {
          sessionStore.updateProgress(sessionId, {
            phase: 'COMPOSE',
            currentStep: `${concept} 컨셉 합성 완료`,
            percentage: 95,
          });
          console.log(`[compile-videos] 진행률 업데이트: ${concept} 합성 완료 (95%)`);
        } catch (err) {
          console.warn('[compile-videos] 진행률 업데이트 실패:', err.message);
        }
      }
      
      const response = {
        success: true,
        compiledVideoUrl: publicUrl,
        metadata: {
          userSelectedVideoLength: userSelectedVideoLengthSeconds,
          actualCompiledDuration: actualCompiledDuration,
          segmentsUsed: processedClips.length,
          segmentsTotal: segments.length,
          clipDurationSec: clipDurationSeconds,
          lengthMatch: isLengthCorrect,
          lengthAccuracy: isLengthCorrect ? 'PERFECT' : 'MISMATCH',
          originalDuration: totalOriginalDuration,
          processingTime,
          scale,
          fps,
          videoLengthSource: videoLengthSource,
          concept: concept || 'N/A',
          debug: {
            publicPath,
            fileExists,
            fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
            publicDir,
            outputFileName,
            publicFileName,
            requiredClipCount,
            clipDurationSeconds,
            urlPrefix
          }
        }
      };
      
      if (!isLengthCorrect) {
        console.warn('[compile-videos] ⚠️ 길이 불일치 감지!', {
          예상: userSelectedVideoLengthSeconds,
          실제: actualCompiledDuration,
          차이: Math.abs(userSelectedVideoLengthSeconds - actualCompiledDuration)
        });
      }
      
      // 5초 후 임시 디렉토리 정리
      setTimeout(() => {
        try {
          console.log('[compile-videos] 지연된 임시 디렉토리 정리:', tempDir);
          const files = fs.readdirSync(tempDir);
          for (const file of files) {
            fs.unlinkSync(path.join(tempDir, file));
          }
          fs.rmdirSync(tempDir);
        } catch (error) {
          console.error('[compile-videos] 지연된 정리 실패:', error.message);
        }
      }, 5000);
      
      return res.status(200).json(response);
      
    } else {
      // 바이너리 모드
      const buffer = fs.readFileSync(outputPath);
      
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', buffer.length.toString());
      res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);
      
      console.log('[compile-videos] 바이너리 모드 완료:', {
        fileSize: (buffer.length / 1024 / 1024).toFixed(2) + 'MB',
        duration: actualCompiledDuration,
        lengthCorrect: isLengthCorrect,
        처리시간: processingTime + 'ms'
      });
      
      res.status(200).send(buffer);
    }

  } catch (error) {
    console.error('[compile-videos] ❌ 전체 오류:', error);
    
    if (req.body?.sessionId) {
      try {
        sessionStore.updateStatus(req.body.sessionId, 'error', null, `compile-videos 실패: ${error.message}`);
      } catch (err) {
        console.warn('[compile-videos] 에러 상태 업데이트 실패:', err.message);
      }
    }
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime,
        tempDir: tempDir || 'N/A'
      });
    }
  } finally {
    if (tempDir && !req.body?.jsonMode) {
      try {
        console.log('[compile-videos] 즉시 정리:', tempDir);
        const files = fs.readdirSync(tempDir).catch(() => []);
        for (const file of files) {
          try { fs.unlinkSync(path.join(tempDir, file)); } catch {}
        }
        try { fs.rmdirSync(tempDir); } catch {}
      } catch (error) {
        console.error('[compile-videos] 정리 실패:', error.message);
      }
    }
  }
}

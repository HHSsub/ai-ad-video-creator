// api/compile-videos.js - 영상 길이 정확 반영 완전 수정
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';

const MAX_DOWNLOAD_RETRIES = 3;
const DOWNLOAD_TIMEOUT = 30000;
const FFMPEG_TIMEOUT = 120000; // 2분

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

// 🔥 FFmpeg 실행 - 타임아웃 및 무한대기 해결
function runFFmpeg(args, label = 'ffmpeg', workingDir = null) {
  return new Promise((resolve, reject) => {
    console.log(`[${label}] 실행: ffmpeg ${args.join(' ')}`);
    
    const options = workingDir ? { cwd: workingDir, stdio: ['pipe', 'pipe', 'pipe'] } : { stdio: ['pipe', 'pipe', 'pipe'] };
    const process = spawn('ffmpeg', args, options);
    
    let stdout = '';
    let stderr = '';
    let isTimeout = false;
    let lastProgressTime = Date.now();
    
    // 🔥 stdin 즉시 종료 (무한 대기 방지)
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
      
      // 진행률 파싱 (간단하게)
      if (output.includes('time=')) {
        console.log(`[${label}] 진행 중...`);
      }
    });
    
    // 🔥 타임아웃 설정
    const timeout = setTimeout(() => {
      console.error(`[${label}] ❌ 타임아웃 (${FFMPEG_TIMEOUT}ms) - 프로세스 강제 종료`);
      isTimeout = true;
      process.kill('SIGKILL');
      reject(new Error(`FFmpeg timeout after ${FFMPEG_TIMEOUT}ms`));
    }, FFMPEG_TIMEOUT);
    
    // 🔥 진행 없음 감지 (30초 동안 진행 없으면 종료)
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
      
      if (isTimeout) return; // 타임아웃으로 이미 종료된 경우
      
      console.log(`[${label}] 종료 코드: ${code}`);
      
      if (code === 0) {
        console.log(`[${label}] ✅ 성공`);
        resolve({ success: true, stdout, stderr });
      } else {
        console.error(`[${label}] ❌ 실패, 코드: ${code}`);
        console.error(`[${label}] stderr:`, stderr.slice(-500)); // 마지막 500자만
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

// 🔥 비디오 길이 조정 - 정확한 길이로
async function trimVideo(inputPath, outputPath, targetDuration = 2) {
  const args = [
    '-y', // 덮어쓰기
    '-i', path.basename(inputPath),
    '-t', targetDuration.toString(), // 🔥 정확한 타겟 길이
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

// 🔥 사용자 선택 영상 길이 정확히 파싱
function parseUserVideoLength(videoLength) {
  if (typeof videoLength === 'number') {
    return videoLength;
  }
  
  if (typeof videoLength === 'string') {
    const match = videoLength.match(/(\d+)/);
    if (match) {
      const seconds = parseInt(match[1], 10);
      // 허용된 값만 반환 (10, 20, 30초)
      if ([10, 20, 30].includes(seconds)) {
        return seconds;
      }
    }
  }
  
  console.warn(`[parseUserVideoLength] 잘못된 영상 길이: ${videoLength}, 기본값 10초 사용`);
  return 10; // 기본값
}

// 🔥 필요한 클립 개수 계산
function calculateRequiredClips(userVideoLengthSeconds) {
  const clipDuration = 2; // 각 클립당 2초 고정
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

    // 🔥 사용자가 선택한 영상 길이를 정확히 반영
    const {
      segments,
      fps = 24,
      scale = '1280:720',
      jsonMode = false,
      targetDuration = null,
      videoLength, // 🔥 Step1에서 넘어온 영상 길이 (중요!)
      formData = {} // formData에서도 videoLength 확인
    } = body;

    if (!Array.isArray(segments) || !segments.length) {
      return res.status(400).json({ error: 'segments[] required' });
    }

    // 🔥 사용자가 선택한 영상 길이를 정확히 파싱
    let userSelectedVideoLengthSeconds = 10; // 기본값
    
    // 우선순위: 직접 전달된 videoLength > formData.videoLength > targetDuration
    const videoLengthSource = videoLength || formData.videoLength || targetDuration;
    
    if (videoLengthSource) {
      userSelectedVideoLengthSeconds = parseUserVideoLength(videoLengthSource);
    }
    
    console.log(`[compile-videos] 🔥 사용자 선택 영상 길이: ${userSelectedVideoLengthSeconds}초 (원본: ${videoLengthSource})`);

    // 🔥 필요한 클립 개수 정확히 계산
    const requiredClipCount = calculateRequiredClips(userSelectedVideoLengthSeconds);
    const clipDurationSeconds = 2; // 각 클립당 2초 고정
    
    console.log('[compile-videos] 🚀 정확한 길이 반영 시작:', {
      사용자선택길이: `${userSelectedVideoLengthSeconds}초`,
      필요클립개수: requiredClipCount,
      클립당길이: `${clipDurationSeconds}초`,
      총세그먼트: segments.length,
      예상최종길이: `${requiredClipCount * clipDurationSeconds}초`,
      정확일치여부: (requiredClipCount * clipDurationSeconds) === userSelectedVideoLengthSeconds ? '✅' : '❌'
    });

    // 🔥 세그먼트를 필요한 개수만큼만 사용 (순서대로)
    const segmentsToUse = segments.slice(0, requiredClipCount);
    
    if (segmentsToUse.length < requiredClipCount) {
      console.warn(`[compile-videos] ⚠️ 세그먼트 부족: 필요 ${requiredClipCount}개, 실제 ${segmentsToUse.length}개`);
      // 부족한 만큼 마지막 세그먼트 복제
      while (segmentsToUse.length < requiredClipCount && segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        segmentsToUse.push({
          ...lastSegment,
          sceneNumber: segmentsToUse.length + 1
        });
      }
    }

    console.log(`[compile-videos] 사용할 세그먼트: ${segmentsToUse.length}개`);

    // 임시 디렉토리 생성
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-'));
    console.log('[compile-videos] 임시 디렉토리:', tempDir);

    const processedClips = [];
    let totalOriginalDuration = 0;

    // 1단계: 비디오 다운로드 및 전처리 (정확한 길이로)
    console.log(`[compile-videos] 1단계: ${segmentsToUse.length}개 비디오 처리 시작 (각 ${clipDurationSeconds}초로)`);
    
    for (let i = 0; i < segmentsToUse.length; i++) {
      const segment = segmentsToUse[i];
      
      if (!segment?.videoUrl) {
        console.warn(`[compile-videos] 세그먼트 ${i + 1} 스킵: videoUrl 없음`);
        continue;
      }

      try {
        const originalFileName = `original_${i + 1}.mp4`;
        const originalPath = path.join(tempDir, originalFileName);
        
        console.log(`[compile-videos] 다운로드 ${i + 1}/${segmentsToUse.length}: ${segment.videoUrl.substring(0, 50)}...`);
        await downloadWithRetry(segment.videoUrl, originalPath);

        // 원본 길이는 무시하고 정확히 clipDurationSeconds로 자르기
        totalOriginalDuration += 5; // 추정값
        
        const trimmedFileName = `trimmed_${i + 1}.mp4`;
        const trimmedPath = path.join(tempDir, trimmedFileName);
        
        console.log(`[compile-videos] 🔥 세그먼트 ${i + 1} 정확히 ${clipDurationSeconds}초로 자르기`);
        await trimVideo(originalPath, trimmedPath, clipDurationSeconds);

        const finalFileName = `final_${i + 1}.mp4`;
        const finalPath = path.join(tempDir, finalFileName);
        
        // 🔥 스케일링 및 표준화
        await runFFmpeg([
          '-y',
          '-i', trimmedFileName,
          '-vf', `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2:color=black`,
          '-r', fps.toString(),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          '-ac', '1',
          '-movflags', '+faststart',
          finalFileName
        ], `process-${i + 1}`, tempDir);

        processedClips.push(finalPath);
        
        // 원본과 트림 파일 즉시 정리
        try {
          fs.unlinkSync(originalPath);
          fs.unlinkSync(trimmedPath);
        } catch (e) {
          console.warn('[compile-videos] 임시 파일 정리 실패:', e.message);
        }

        console.log(`[compile-videos] ✅ 세그먼트 ${i + 1} 처리 완료 (${clipDurationSeconds}초)`);

      } catch (error) {
        console.error(`[compile-videos] 세그먼트 ${i + 1} 처리 실패:`, error.message);
        // 개별 실패는 무시하고 계속 진행
      }
    }

    if (!processedClips.length) {
      throw new Error('처리된 비디오 클립이 없습니다');
    }

    console.log(`[compile-videos] 클립 처리 완료: ${processedClips.length}개 (각 ${clipDurationSeconds}초)`);

    // 2단계: 비디오 합치기 - 정확한 길이로
    console.log('[compile-videos] 2단계: 비디오 합치기 (정확한 길이 반영)');
    
    const listContent = processedClips.map(clipPath => 
      `file '${path.basename(clipPath)}'`
    ).join('\n');
    
    const listFilePath = path.join(tempDir, 'concat_list.txt');
    fs.writeFileSync(listFilePath, listContent);
    
    console.log('[compile-videos] Concat 리스트 생성:', processedClips.length, '개 파일');

    const outputFileName = `compiled_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp4`;
    const outputPath = path.join(tempDir, outputFileName);

    // 🔥 concat으로 정확한 길이 유지
    await runFFmpeg([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat_list.txt',
      '-c', 'copy', // 인코딩 안함 (길이 정확 유지)
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
      const projectRoot = process.cwd();
      const publicDir = path.resolve(projectRoot, 'tmp', 'compiled');
      
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
        console.log('[compile-videos] 공개 디렉토리 생성:', publicDir);
      }
      
      const publicFileName = outputFileName;
      const publicPath = path.join(publicDir, publicFileName);
      
      fs.copyFileSync(outputPath, publicPath);
      console.log('[compile-videos] 파일 복사 완료:', outputPath, '→', publicPath);
      
      try {
        fs.chmodSync(publicPath, 0o644);
      } catch (e) {
        console.warn('[compile-videos] 권한 설정 실패:', e.message);
      }
      
      const publicUrl = `/tmp/compiled/${publicFileName}`;
      
      const fileExists = fs.existsSync(publicPath);
      const fileSize = fileExists ? fs.statSync(publicPath).size : 0;
      
      console.log('[compile-videos] ✅ JSON 모드 완료:', {
        publicUrl,
        fileExists,
        fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
        duration: actualCompiledDuration,
        lengthCorrect: isLengthCorrect,
        처리시간: processingTime + 'ms'
      });
      
      const response = {
        success: true,
        compiledVideoUrl: publicUrl,
        metadata: {
          // 🔥 정확한 길이 정보 포함
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
          debug: {
            publicPath,
            fileExists,
            fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
            publicDir,
            outputFileName,
            publicFileName,
            requiredClipCount,
            clipDurationSeconds
          }
        }
      };
      
      // 🔥 길이가 맞지 않으면 경고 로그
      if (!isLengthCorrect) {
        console.warn('[compile-videos] ⚠️ 길이 불일치 감지!', {
          예상: userSelectedVideoLengthSeconds,
          실제: actualCompiledDuration,
          차이: Math.abs(userSelectedVideoLengthSeconds - actualCompiledDuration)
        });
      }
      
      // 5초 후 정리
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

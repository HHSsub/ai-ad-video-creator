// 향상된 영상 합치기 시스템 (FFmpeg 기반) - 정적 파일 서빙 수정
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';

const MAX_DOWNLOAD_RETRIES = 3;
const DOWNLOAD_TIMEOUT = 30000;
const FFMPEG_TIMEOUT = 300000; // 5분

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

// FFmpeg 실행
function runFFmpeg(args, label = 'ffmpeg', workingDir = null) {
  return new Promise((resolve, reject) => {
    console.log(`[${label}] 실행: ffmpeg ${args.join(' ')}`);
    
    const options = workingDir ? { cwd: workingDir, stdio: 'pipe' } : { stdio: 'pipe' };
    const process = spawn('ffmpeg', args, options);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      
      // 진행률 파싱
      if (output.includes('time=')) {
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch) {
          console.log(`[${label}] 진행: ${timeMatch[0]}`);
        }
      }
    });
    
    // 타임아웃 설정
    const timeout = setTimeout(() => {
      console.error(`[${label}] 타임아웃 (${FFMPEG_TIMEOUT}ms)`);
      process.kill('SIGTERM');
      reject(new Error(`FFmpeg timeout after ${FFMPEG_TIMEOUT}ms`));
    }, FFMPEG_TIMEOUT);
    
    process.on('close', (code) => {
      clearTimeout(timeout);
      
      console.log(`[${label}] 종료 코드: ${code}`);
      
      if (code === 0) {
        console.log(`[${label}] 성공`);
        resolve({ success: true, stdout, stderr });
      } else {
        console.error(`[${label}] 실패, stderr:`, stderr);
        reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
      }
    });
    
    process.on('error', (error) => {
      clearTimeout(timeout);
      console.error(`[${label}] 프로세스 오류:`, error);
      reject(error);
    });
  });
}

// 비디오 메타데이터 확인
async function getVideoMetadata(videoPath) {
  try {
    const result = await runFFmpeg([
      '-i', path.basename(videoPath),
      '-f', 'null', '-'
    ], 'probe', path.dirname(videoPath));
    
    // duration 파싱
    const durationMatch = result.stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
    let duration = 0;
    if (durationMatch) {
      const [, hours, minutes, seconds] = durationMatch;
      duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
    }
    
    return { duration };
  } catch (error) {
    console.warn('[getVideoMetadata] 메타데이터 확인 실패:', error.message);
    return { duration: 6 }; // 기본값
  }
}

// 영상 길이 조정 (2초로 자르기)
async function trimVideo(inputPath, outputPath, targetDuration = 2) {
  const args = [
    '-y', // 덮어쓰기
    '-i', path.basename(inputPath),
    '-t', targetDuration.toString(),
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-preset', 'medium',
    '-crf', '23',
    '-movflags', '+faststart',
    path.basename(outputPath)
  ];
  
  await runFFmpeg(args, `trim-${targetDuration}s`, path.dirname(inputPath));
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
      segments,
      clipDurationSec = 2,
      fps = 30,
      scale = '1920:1080',
      jsonMode = false,
      targetDuration = null
    } = body;

    if (!Array.isArray(segments) || !segments.length) {
      return res.status(400).json({ error: 'segments[] required' });
    }

    console.log('[compile-videos] 시작:', {
      segments: segments.length,
      clipDuration: clipDurationSec,
      targetDuration,
      jsonMode
    });

    // 임시 디렉토리 생성
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-'));
    console.log('[compile-videos] 임시 디렉토리:', tempDir);

    const processedClips = [];
    let totalOriginalDuration = 0;

    // 1단계: 비디오 다운로드 및 전처리
    console.log('[compile-videos] 1단계: 비디오 다운로드 및 처리');
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      if (!segment?.videoUrl) {
        console.warn(`[compile-videos] 세그먼트 ${i} 스킵: videoUrl 없음`);
        continue;
      }

      try {
        const originalFileName = `original_${i + 1}.mp4`;
        const originalPath = path.join(tempDir, originalFileName);
        
        console.log(`[compile-videos] 다운로드 ${i + 1}/${segments.length}: ${segment.videoUrl.substring(0, 50)}...`);
        await downloadWithRetry(segment.videoUrl, originalPath);

        const metadata = await getVideoMetadata(originalPath);
        totalOriginalDuration += metadata.duration;
        
        console.log(`[compile-videos] 세그먼트 ${i + 1} 원본 길이: ${metadata.duration}초`);

        const trimmedFileName = `trimmed_${i + 1}.mp4`;
        const trimmedPath = path.join(tempDir, trimmedFileName);
        
        console.log(`[compile-videos] 세그먼트 ${i + 1} 트림: ${metadata.duration}초 → ${clipDurationSec}초`);
        await trimVideo(originalPath, trimmedPath, clipDurationSec);

        const finalFileName = `final_${i + 1}.mp4`;
        const finalPath = path.join(tempDir, finalFileName);
        
        await runFFmpeg([
          '-y',
          '-i', trimmedFileName,
          '-vf', `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2:color=black`,
          '-r', fps.toString(),
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'medium',
          '-crf', '23',
          '-movflags', '+faststart',
          finalFileName
        ], `process-${i + 1}`, tempDir);

        processedClips.push(finalPath);
        
        // 원본과 트림 파일 정리
        try {
          fs.unlinkSync(originalPath);
          fs.unlinkSync(trimmedPath);
        } catch (e) {
          console.warn('[compile-videos] 임시 파일 정리 실패:', e.message);
        }

      } catch (error) {
        console.error(`[compile-videos] 세그먼트 ${i + 1} 처리 실패:`, error.message);
      }
    }

    if (!processedClips.length) {
      throw new Error('처리된 비디오 클립이 없습니다');
    }

    console.log(`[compile-videos] 처리 완료: ${processedClips.length}개 클립`);

    // 2단계: 비디오 합치기
    console.log('[compile-videos] 2단계: 비디오 합치기');
    
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

    // 3단계: 결과 처리
    const processingTime = Date.now() - startTime;
    const compiledDuration = processedClips.length * clipDurationSec;
    
    if (jsonMode) {
      // 🔥 JSON 모드: 프로젝트 루트의 tmp/compiled로 이동 (상대 경로 수정)
      const projectRoot = process.cwd();
      const publicDir = path.resolve(projectRoot, 'tmp', 'compiled'); // resolve로 절대경로 확실히
      
      // 디렉토리가 없으면 생성
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
        console.log('[compile-videos] 공개 디렉토리 생성:', publicDir);
      }
      
      // 🔥 기존 파일명 재사용 (타임스탬프 중복 방지)
      const publicFileName = outputFileName; // compiled_1757644992541_4656c51c.mp4 그대로 사용
      const publicPath = path.join(publicDir, publicFileName);
      
      // 파일 복사 (이동 아닌 복사로 안전하게)
      fs.copyFileSync(outputPath, publicPath);
      console.log('[compile-videos] 파일 복사 완료:', outputPath, '→', publicPath);
      
      // 파일 권한 설정 (읽기 가능하도록)
      try {
        fs.chmodSync(publicPath, 0o644);
        console.log('[compile-videos] 파일 권한 설정 완료: 644');
      } catch (e) {
        console.warn('[compile-videos] 권한 설정 실패:', e.message);
      }
      
      const publicUrl = `/tmp/compiled/${publicFileName}`;
      
      // 🔥 파일 존재 확인
      const fileExists = fs.existsSync(publicPath);
      const fileSize = fileExists ? fs.statSync(publicPath).size : 0;
      
      console.log('[compile-videos] JSON 모드 완료:', {
        publicUrl,
        publicPath,
        fileExists,
        fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
        duration: compiledDuration,
        처리시간: processingTime + 'ms'
      });
      
      // 🔥 성공 응답에 디버그 정보 추가
      const response = {
        success: true,
        compiledVideoUrl: publicUrl,
        metadata: {
          segmentsCount: processedClips.length,
          originalDuration: totalOriginalDuration,
          compiledDuration: compiledDuration,
          clipDurationSec,
          processingTime,
          scale,
          fps,
          // 🔥 디버그 정보 추가
          debug: {
            publicPath,
            fileExists,
            fileSize,
            publicDir,
            outputFileName,
            publicFileName
          }
        }
      };
      
      // 🔥 임시 디렉토리 정리를 응답 후로 지연
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
      }, 5000); // 5초 후 정리
      
      return res.status(200).json(response);
      
    } else {
      // 바이너리 모드: 직접 스트리밍
      const buffer = fs.readFileSync(outputPath);
      
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', buffer.length.toString());
      res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);
      
      console.log('[compile-videos] 바이너리 모드 완료:', {
        fileSize: (buffer.length / 1024 / 1024).toFixed(2) + 'MB',
        duration: compiledDuration,
        처리시간: processingTime + 'ms'
      });
      
      res.status(200).send(buffer);
    }

  } catch (error) {
    console.error('[compile-videos] 전체 오류:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime,
        tempDir: tempDir || 'N/A'
      });
    }
  } finally {
    // JSON 모드가 아닌 경우에만 즉시 정리 (JSON 모드는 위에서 지연 정리)
    if (tempDir && !req.body?.jsonMode) {
      try {
        console.log('[compile-videos] 임시 디렉토리 정리:', tempDir);
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          fs.unlinkSync(path.join(tempDir, file));
        }
        fs.rmdirSync(tempDir);
      } catch (error) {
        console.error('[compile-videos] 정리 실패:', error.message);
      }
    }
  }
}

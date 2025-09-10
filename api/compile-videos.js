// compile-videos.js FFmpeg 영상합치기
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { videoSegments, targetDuration, projectInfo } = req.body;

    if (!videoSegments || videoSegments.length === 0) {
      return res.status(400).json({ 
        error: 'Video segments are required' 
      });
    }

    console.log('영상 합치기 시작:', {
      segmentCount: videoSegments.length,
      targetDuration: targetDuration,
      brandName: projectInfo?.brandName
    });

    // 임시 디렉토리 생성
    const tempDir = `/tmp/video-compile-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // 1. 비디오 세그먼트들을 로컬에 다운로드
      const downloadedFiles = [];
      for (let i = 0; i < videoSegments.length; i++) {
        const segment = videoSegments[i];
        const fileName = `segment_${i + 1}.mp4`;
        const filePath = path.join(tempDir, fileName);

        console.log(`세그먼트 ${i + 1} 다운로드 중: ${segment.videoUrl}`);

        // 비디오 파일 다운로드
        const response = await fetch(segment.videoUrl);
        if (!response.ok) {
          throw new Error(`세그먼트 ${i + 1} 다운로드 실패: ${response.status}`);
        }

        const buffer = await response.buffer();
        await fs.writeFile(filePath, buffer);
        
        downloadedFiles.push({
          path: filePath,
          fileName: fileName,
          duration: segment.duration || 5
        });

        console.log(`세그먼트 ${i + 1} 다운로드 완료: ${filePath}`);
      }

      // 2. FFmpeg 입력 파일 리스트 생성
      const fileListPath = path.join(tempDir, 'filelist.txt');
      const fileListContent = downloadedFiles
        .map(file => `file '${file.fileName}'`)
        .join('\n');
      
      await fs.writeFile(fileListPath, fileListContent);
      console.log('파일 리스트 생성 완료:', fileListContent);

      // 3. FFmpeg로 비디오 합치기
      const outputFileName = `${projectInfo?.brandName || 'brand'}_compiled_${Date.now()}.mp4`;
      const outputPath = path.join(tempDir, outputFileName);

      console.log('FFmpeg 실행 시작...');
      
      const ffmpegResult = await runFFmpeg(tempDir, fileListPath, outputPath, targetDuration);
      
      if (!ffmpegResult.success) {
        throw new Error(`FFmpeg 실행 실패: ${ffmpegResult.error}`);
      }

      console.log('FFmpeg 실행 완료:', outputPath);

      // 4. 합쳐진 비디오를 클라우드 스토리지에 업로드 (여기서는 임시로 로컬 URL 반환)
      // 실제 환경에서는 AWS S3, Google Cloud Storage 등에 업로드
      const compiledVideoUrl = await uploadCompiledVideo(outputPath, outputFileName);

      // 5. 임시 파일들 정리
      await cleanupTempFiles(tempDir);

      const response = {
        success: true,
        compiledVideo: {
          url: compiledVideoUrl,
          fileName: outputFileName,
          duration: targetDuration,
          resolution: '1920x1080',
          format: 'mp4',
          size: await getFileSize(outputPath),
          segmentCount: videoSegments.length,
          createdAt: new Date().toISOString()
        },
        ffmpegCommand: ffmpegResult.command,
        metadata: {
          originalSegments: videoSegments.length,
          targetDuration: targetDuration,
          actualDuration: ffmpegResult.actualDuration,
          projectInfo: projectInfo
        }
      };

      console.log('영상 합치기 완료:', {
        파일명: outputFileName,
        세그먼트수: videoSegments.length,
        최종길이: targetDuration
      });

      res.status(200).json(response);

    } catch (error) {
      // 오류 발생시 임시 파일 정리
      await cleanupTempFiles(tempDir).catch(console.error);
      throw error;
    }

  } catch (error) {
    console.error('영상 합치기 중 전체 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * FFmpeg를 실행하여 비디오들을 합치는 함수
 */
async function runFFmpeg(workingDir, fileListPath, outputPath, targetDuration) {
  return new Promise((resolve) => {
    console.log('FFmpeg 명령어 실행 시작...');

    // FFmpeg 명령어 구성
    const ffmpegArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', 'filelist.txt',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'medium',
      '-crf', '23',
      '-movflags', '+faststart', // 웹 스트리밍 최적화
      '-y', // 기존 파일 덮어쓰기
      path.basename(outputPath)
    ];

    // 목표 길이가 지정된 경우 시간 제한 추가
    if (targetDuration) {
      const seconds = parseInt(targetDuration);
      ffmpegArgs.splice(-1, 0, '-t', seconds.toString());
    }

    const command = `ffmpeg ${ffmpegArgs.join(' ')}`;
    console.log('실행할 FFmpeg 명령어:', command);

    // FFmpeg 프로세스 실행
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    ffmpeg.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      
      // 진행률 파싱 (선택적)
      if (output.includes('time=')) {
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch) {
          const [, hours, minutes, seconds] = timeMatch;
          const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
          console.log(`FFmpeg 진행: ${currentTime}초 처리됨`);
        }
      }
    });

    ffmpeg.on('close', (code) => {
      console.log(`FFmpeg 프로세스 종료, 코드: ${code}`);
      
      if (code === 0) {
        console.log('FFmpeg 실행 성공');
        resolve({
          success: true,
          command: command,
          stdout: stdout,
          stderr: stderr,
          actualDuration: extractDurationFromOutput(stderr)
        });
      } else {
        console.error('FFmpeg 실행 실패:', stderr);
        resolve({
          success: false,
          error: `FFmpeg failed with code ${code}`,
          stderr: stderr,
          command: command
        });
      }
    });

    ffmpeg.on('error', (error) => {
      console.error('FFmpeg 프로세스 오류:', error);
      resolve({
        success: false,
        error: error.message,
        command: command
      });
    });

    // 30분 타임아웃 설정
    setTimeout(() => {
      if (!ffmpeg.killed) {
        console.log('FFmpeg 타임아웃, 프로세스 종료');
        ffmpeg.kill('SIGTERM');
        resolve({
          success: false,
          error: 'FFmpeg process timeout (30 minutes)',
          command: command
        });
      }
    }, 30 * 60 * 1000);
  });
}

/**
 * FFmpeg 출력에서 실제 영상 길이 추출
 */
function extractDurationFromOutput(stderr) {
  const durationMatch = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
  if (durationMatch) {
    const [, hours, minutes, seconds] = durationMatch;
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
  }
  return null;
}

/**
 * 합쳐진 비디오를 클라우드 스토리지에 업로드
 * 실제 구현에서는 AWS S3, Google Cloud Storage 등 사용
 */
async function uploadCompiledVideo(filePath, fileName) {
  try {
    // 임시로 로컬 파일 URL 반환
    // 실제로는 클라우드 스토리지 업로드 후 공개 URL 반환
    
    console.log('클라우드 스토리지 업로드 시뮬레이션:', fileName);
    
    // 파일이 존재하는지 확인
    await fs.access(filePath);
    
    // 실제 구현 예시 (AWS S3)
    /*
    const AWS = require('aws-sdk');
    const s3 = new AWS.S3();
    
    const fileContent = await fs.readFile(filePath);
    const uploadParams = {
      Bucket: 'your-video-bucket',
      Key: `compiled-videos/${fileName}`,
      Body: fileContent,
      ContentType: 'video/mp4',
      ACL: 'public-read'
    };
    
    const result = await s3.upload(uploadParams).promise();
    return result.Location;
    */
    
    // 현재는 임시 URL 반환
    return `https://your-domain.com/api/download-video/${fileName}`;
    
  } catch (error) {
    console.error('비디오 업로드 오류:', error);
    throw new Error(`비디오 업로드 실패: ${error.message}`);
  }
}

/**
 * 파일 크기 가져오기
 */
async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    console.error('파일 크기 확인 오류:', error);
    return 0;
  }
}

/**
 * 임시 파일들 정리
 */
async function cleanupTempFiles(tempDir) {
  try {
    console.log('임시 파일 정리 시작:', tempDir);
    
    // 디렉토리 내 모든 파일 삭제
    const files = await fs.readdir(tempDir);
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      await fs.unlink(filePath);
      console.log('삭제됨:', filePath);
    }
    
    // 디렉토리 삭제
    await fs.rmdir(tempDir);
    console.log('임시 디렉토리 삭제 완료:', tempDir);
    
  } catch (error) {
    console.error('임시 파일 정리 오류:', error);
    // 정리 실패해도 메인 프로세스는 계속 진행
  }
}

/**
 * FFmpeg 설치 확인 및 버전 체크
 */
export async function checkFFmpegAvailability() {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);
    
    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });
    
    ffmpeg.on('error', () => {
      resolve(false);
    });
  });
}

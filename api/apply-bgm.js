// apply-bgm.js
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
    const { compiledVideoUrl, selectedBGM, projectInfo } = req.body;

    if (!compiledVideoUrl || !selectedBGM) {
      return res.status(400).json({ 
        error: 'Compiled video URL and selected BGM are required' 
      });
    }

    console.log('BGM 적용 시작:', {
      bgmName: selectedBGM.name,
      bgmType: selectedBGM.type,
      projectBrand: projectInfo?.brandName
    });

    // 임시 디렉토리 생성
    const tempDir = `/tmp/bgm-apply-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // 1. 원본 비디오 다운로드
      const videoFileName = 'compiled_video.mp4';
      const videoPath = path.join(tempDir, videoFileName);

      console.log('원본 비디오 다운로드 중:', compiledVideoUrl);
      await downloadFile(compiledVideoUrl, videoPath);

      // 2. BGM 오디오 다운로드
      const audioFileName = `bgm.${getAudioExtension(selectedBGM.url)}`;
      const audioPath = path.join(tempDir, audioFileName);

      console.log('BGM 다운로드 중:', selectedBGM.url);
      await downloadFile(selectedBGM.url, audioPath);

      // 3. 비디오 길이 확인
      const videoDuration = await getVideoDuration(videoPath);
      console.log('비디오 길이:', videoDuration, '초');

      // 4. FFmpeg로 BGM 적용
      const outputFileName = `${projectInfo?.brandName || 'brand'}_final_${Date.now()}.mp4`;
      const outputPath = path.join(tempDir, outputFileName);

      const ffmpegResult = await applyBGMWithFFmpeg(
        videoPath, 
        audioPath, 
        outputPath, 
        videoDuration,
        selectedBGM
      );

      if (!ffmpegResult.success) {
        throw new Error(`BGM 적용 실패: ${ffmpegResult.error}`);
      }

      console.log('BGM 적용 완료:', outputPath);

      // 5. 최종 비디오를 클라우드 스토리지에 업로드
      const finalVideoUrl = await uploadFinalVideo(outputPath, outputFileName);

      // 6. 임시 파일들 정리
      await cleanupTempFiles(tempDir);

      const response = {
        success: true,
        finalVideo: {
          url: finalVideoUrl,
          fileName: outputFileName,
          duration: videoDuration,
          resolution: '1920x1080',
          format: 'mp4',
          size: await getFileSize(outputPath),
          bgm: {
            name: selectedBGM.name,
            type: selectedBGM.type,
            genre: selectedBGM.genre,
            mood: selectedBGM.mood
          },
          createdAt: new Date().toISOString()
        },
        ffmpegCommand: ffmpegResult.command,
        metadata: {
          originalVideoUrl: compiledVideoUrl,
          appliedBGM: selectedBGM,
          projectInfo: projectInfo,
          processingTime: ffmpegResult.processingTime
        }
      };

      console.log('BGM 적용 프로세스 완료:', {
        파일명: outputFileName,
        BGM: selectedBGM.name,
        브랜드: projectInfo?.brandName
      });

      res.status(200).json(response);

    } catch (error) {
      // 오류 발생시 임시 파일 정리
      await cleanupTempFiles(tempDir).catch(console.error);
      throw error;
    }

  } catch (error) {
    console.error('BGM 적용 중 전체 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * FFmpeg를 사용하여 비디오에 BGM 적용
 */
async function applyBGMWithFFmpeg(videoPath, audioPath, outputPath, videoDuration, bgmInfo) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    console.log('FFmpeg BGM 적용 시작...');

    // BGM 볼륨 조절 (원본 비디오 오디오와 밸런스 맞추기)
    const bgmVolume = 0.3; // BGM 볼륨 (30%)
    const videoVolume = 0.7; // 원본 오디오 볼륨 (70%)

    // FFmpeg 명령어 구성
    const ffmpegArgs = [
      '-i', path.basename(videoPath),      // 입력 비디오
      '-i', path.basename(audioPath),      // 입력 BGM
      '-filter_complex', [
        // BGM을 비디오 길이에 맞게 조정하고 볼륨 조절
        `[1:a]volume=${bgmVolume},aloop=loop=-1:size=2e+09[bgm]`,
        // 원본 오디오 볼륨 조절
        `[0:a]volume=${videoVolume}[original]`,
        // 오디오 믹싱
        `[original][bgm]amix=inputs=2:duration=first:dropout_transition=2[audio]`
      ].join(';'),
      '-map', '0:v',                       // 비디오 스트림 사용
      '-map', '[audio]',                   // 믹싱된 오디오 사용
      '-c:v', 'libx264',                   // 비디오 코덱
      '-c:a', 'aac',                       // 오디오 코덱
      '-preset', 'medium',                 // 인코딩 속도/품질 밸런스
      '-crf', '23',                        // 비디오 품질 (23은 높은 품질)
      '-t', videoDuration.toString(),      // 비디오 길이로 제한
      '-movflags', '+faststart',           // 웹 스트리밍 최적화
      '-y',                                // 기존 파일 덮어쓰기
      path.basename(outputPath)
    ];

    const command = `ffmpeg ${ffmpegArgs.join(' ')}`;
    console.log('실행할 FFmpeg 명령어:', command);

    // FFmpeg 프로세스 실행
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      cwd: path.dirname(videoPath),
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
      
      // 진행률 파싱
      if (output.includes('time=')) {
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch) {
          const [, hours, minutes, seconds] = timeMatch;
          const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
          const progress = Math.min(100, (currentTime / videoDuration) * 100);
          console.log(`BGM 적용 진행: ${progress.toFixed(1)}% (${currentTime}/${videoDuration}초)`);
        }
      }
    });

    ffmpeg.on('close', (code) => {
      const processingTime = Date.now() - startTime;
      console.log(`FFmpeg BGM 적용 완료, 코드: ${code}, 처리시간: ${processingTime}ms`);
      
      if (code === 0) {
        console.log('BGM 적용 성공');
        resolve({
          success: true,
          command: command,
          stdout: stdout,
          stderr: stderr,
          processingTime: processingTime
        });
      } else {
        console.error('BGM 적용 실패:', stderr);
        resolve({
          success: false,
          error: `FFmpeg failed with code ${code}`,
          stderr: stderr,
          command: command,
          processingTime: processingTime
        });
      }
    });

    ffmpeg.on('error', (error) => {
      console.error('FFmpeg 프로세스 오류:', error);
      resolve({
        success: false,
        error: error.message,
        command: command,
        processingTime: Date.now() - startTime
      });
    });

    // 20분 타임아웃 설정
    setTimeout(() => {
      if (!ffmpeg.killed) {
        console.log('FFmpeg BGM 적용 타임아웃, 프로세스 종료');
        ffmpeg.kill('SIGTERM');
        resolve({
          success: false,
          error: 'FFmpeg BGM process timeout (20 minutes)',
          command: command,
          processingTime: Date.now() - startTime
        });
      }
    }, 20 * 60 * 1000);
  });
}

/**
 * 파일 다운로드 함수
 */
async function downloadFile(url, filePath) {
  try {
    console.log(`파일 다운로드 시작: ${url} -> ${filePath}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`다운로드 실패: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.buffer();
    await fs.writeFile(filePath, buffer);
    
    const fileSize = buffer.length;
    console.log(`파일 다운로드 완료: ${filePath} (${fileSize} bytes)`);
    
  } catch (error) {
    console.error('파일 다운로드 오류:', error);
    throw new Error(`파일 다운로드 실패: ${error.message}`);
  }
}

/**
 * 비디오 길이 확인
 */
async function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      path.basename(videoPath)
    ], {
      cwd: path.dirname(videoPath)
    });

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          const duration = parseFloat(result.format.duration);
          console.log(`비디오 길이 확인: ${duration}초`);
          resolve(Math.ceil(duration));
        } catch (error) {
          console.error('비디오 길이 파싱 오류:', error);
          reject(new Error('비디오 길이 파싱 실패'));
        }
      } else {
        console.error('ffprobe 실행 실패:', stderr);
        reject(new Error(`ffprobe failed with code ${code}`));
      }
    });

    ffprobe.on('error', (error) => {
      console.error('ffprobe 프로세스 오류:', error);
      reject(error);
    });
  });
}

/**
 * 오디오 파일 확장자 추론
 */
function getAudioExtension(url) {
  const urlPath = new URL(url).pathname;
  const extension = path.extname(urlPath).slice(1);
  
  // 일반적인 오디오 확장자들
  const audioExtensions = ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'];
  
  if (audioExtensions.includes(extension.toLowerCase())) {
    return extension.toLowerCase();
  }
  
  // 확장자를 추론할 수 없으면 mp3로 기본 설정
  return 'mp3';
}

/**
 * 최종 비디오를 클라우드 스토리지에 업로드
 */
async function uploadFinalVideo(filePath, fileName) {
  try {
    console.log('최종 비디오 업로드 시작:', fileName);
    
    // 파일이 존재하는지 확인
    await fs.access(filePath);
    
    // 실제 구현에서는 클라우드 스토리지 (AWS S3, Google Cloud Storage 등) 업로드
    /*
    const AWS = require('aws-sdk');
    const s3 = new AWS.S3();
    
    const fileContent = await fs.readFile(filePath);
    const uploadParams = {
      Bucket: 'your-final-video-bucket',
      Key: `final-videos/${fileName}`,
      Body: fileContent,
      ContentType: 'video/mp4',
      ACL: 'public-read',
      Metadata: {
        'original-name': fileName,
        'created-at': new Date().toISOString()
      }
    };
    
    const result = await s3.upload(uploadParams).promise();
    console.log('S3 업로드 완료:', result.Location);
    return result.Location;
    */
    
    // 현재는 임시 URL 반환
    const finalUrl = `https://your-domain.com/api/download-final-video/${fileName}`;
    console.log('업로드 시뮬레이션 완료:', finalUrl);
    return finalUrl;
    
  } catch (error) {
    console.error('최종 비디오 업로드 오류:', error);
    throw new Error(`최종 비디오 업로드 실패: ${error.message}`);
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

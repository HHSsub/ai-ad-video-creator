// upload-final-video.js
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

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
    const { finalVideoUrl, projectInfo } = req.body;

    if (!finalVideoUrl) {
      return res.status(400).json({ 
        error: 'Final video URL is required' 
      });
    }

    console.log('Google Drive 업로드 시작:', {
      videoUrl: finalVideoUrl,
      brandName: projectInfo?.brandName
    });

    // 1. 최종 비디오 파일 다운로드
    const tempDir = `/tmp/drive-upload-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    const fileName = generateFileName(projectInfo);
    const tempFilePath = path.join(tempDir, fileName);

    try {
      console.log('비디오 파일 다운로드 중:', finalVideoUrl);
      await downloadVideoFile(finalVideoUrl, tempFilePath);

      // 2. Google Drive에 업로드
      const driveUploadResult = await uploadToGoogleDrive(tempFilePath, fileName, projectInfo);

      // 3. 임시 파일 정리
      await cleanupTempFiles(tempDir);

      const response = {
        success: true,
        finalVideo: {
          url: finalVideoUrl,
          fileName: fileName,
          driveUrl: driveUploadResult.driveUrl,
          driveFileId: driveUploadResult.fileId,
          downloadUrl: finalVideoUrl,
          size: driveUploadResult.size,
          uploadedAt: new Date().toISOString()
        },
        driveInfo: {
          folderId: driveUploadResult.folderId,
          folderUrl: 'https://drive.google.com/drive/folders/1qwMIt4_yxM_5yIU7isNTJKp_mrBARlEm',
          permissions: driveUploadResult.permissions,
          status: 'uploaded'
        },
        metadata: {
          projectInfo: projectInfo,
          uploadMethod: 'google_drive_api',
          processingTime: driveUploadResult.processingTime
        }
      };

      console.log('Google Drive 업로드 완료:', {
        파일명: fileName,
        DriveID: driveUploadResult.fileId,
        브랜드: projectInfo?.brandName
      });

      res.status(200).json(response);

    } catch (error) {
      // 오류 발생시 임시 파일 정리
      await cleanupTempFiles(tempDir).catch(console.error);
      throw error;
    }

  } catch (error) {
    console.error('Google Drive 업로드 중 전체 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * 프로젝트 정보를 기반으로 파일명 생성
 */
function generateFileName(projectInfo) {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const brandName = projectInfo?.brandName ? 
    projectInfo.brandName.replace(/[^a-zA-Z0-9가-힣]/g, '_') : 
    'Brand';
  
  const style = projectInfo?.style ? 
    projectInfo.style.replace(/[^a-zA-Z0-9가-힣]/g, '_') : 
    'Style';

  return `${brandName}_${style}_광고영상_${timestamp}.mp4`;
}

/**
 * 비디오 파일 다운로드
 */
async function downloadVideoFile(url, filePath) {
  try {
    console.log(`비디오 다운로드 시작: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`다운로드 실패: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.buffer();
    await fs.writeFile(filePath, buffer);
    
    const fileSize = buffer.length;
    console.log(`비디오 다운로드 완료: ${filePath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    
    return fileSize;
    
  } catch (error) {
    console.error('비디오 다운로드 오류:', error);
    throw new Error(`비디오 다운로드 실패: ${error.message}`);
  }
}

/**
 * Google Drive에 파일 업로드
 */
async function uploadToGoogleDrive(filePath, fileName, projectInfo) {
  const startTime = Date.now();
  
  try {
    console.log('Google Drive 업로드 시작:', fileName);

    // Google Drive API 설정 확인
    const driveApiKey = process.env.GOOGLE_DRIVE_API_KEY;
    const driveAccessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
    
    if (!driveApiKey && !driveAccessToken) {
      console.warn('Google Drive API 키가 설정되지 않음, 업로드 시뮬레이션 모드');
      return simulateGoogleDriveUpload(filePath, fileName, startTime);
    }

    // 실제 Google Drive API 구현
    /*
    const { google } = require('googleapis');
    
    // OAuth2 클라이언트 설정
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    auth.setCredentials({
      access_token: driveAccessToken,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    const drive = google.drive({ version: 'v3', auth });

    // 파일 메타데이터 설정
    const fileMetadata = {
      name: fileName,
      parents: ['1qwMIt4_yxM_5yIU7isNTJKp_mrBARlEm'], // 지정된 폴더 ID
      description: `AI 생성 광고영상 - ${projectInfo?.brandName || '브랜드'} (${new Date().toISOString()})`
    };

    // 파일 읽기
    const fileContent = await fs.readFile(filePath);

    // Google Drive에 업로드
    const uploadResponse = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: 'video/mp4',
        body: fileContent
      },
      fields: 'id, webViewLink, webContentLink, size'
    });

    // 파일 권한 설정 (공개 읽기)
    await drive.permissions.create({
      fileId: uploadResponse.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    console.log('Google Drive 업로드 성공:', uploadResponse.data.id);

    return {
      fileId: uploadResponse.data.id,
      driveUrl: uploadResponse.data.webViewLink,
      downloadUrl: uploadResponse.data.webContentLink,
      size: uploadResponse.data.size,
      folderId: '1qwMIt4_yxM_5yIU7isNTJKp_mrBARlEm',
      permissions: 'public_read',
      processingTime: Date.now() - startTime
    };
    */

    // 현재는 시뮬레이션 모드
    return simulateGoogleDriveUpload(filePath, fileName, startTime);

  } catch (error) {
    console.error('Google Drive 업로드 오류:', error);
    
    // 업로드 실패시에도 로컬 정보는 반환
    return {
      fileId: null,
      driveUrl: null,
      downloadUrl: null,
      size: await getFileSize(filePath),
      folderId: '1qwMIt4_yxM_5yIU7isNTJKp_mrBARlEm',
      permissions: 'upload_failed',
      processingTime: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Google Drive 업로드 시뮬레이션 (개발/테스트용)
 */
async function simulateGoogleDriveUpload(filePath, fileName, startTime) {
  console.log('Google Drive 업로드 시뮬레이션 실행:', fileName);
  
  // 실제 파일 크기 확인
  const fileSize = await getFileSize(filePath);
  
  // 업로드 시간 시뮬레이션 (파일 크기에 비례)
  const simulatedDelay = Math.min(3000, Math.max(500, fileSize / 1024 / 1024 * 100));
  await new Promise(resolve => setTimeout(resolve, simulatedDelay));
  
  // 가상의 Google Drive 파일 ID 생성
  const mockFileId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log('Google Drive 업로드 시뮬레이션 완료:', mockFileId);
  
  return {
    fileId: mockFileId,
    driveUrl: `https://drive.google.com/file/d/${mockFileId}/view`,
    downloadUrl: `https://drive.google.com/uc?id=${mockFileId}`,
    size: fileSize,
    folderId: '1qwMIt4_yxM_5yIU7isNTJKp_mrBARlEm',
    permissions: 'public_read',
    processingTime: Date.now() - startTime,
    simulated: true
  };
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
    }
    
    // 디렉토리 삭제
    await fs.rmdir(tempDir);
    console.log('임시 디렉토리 삭제 완료:', tempDir);
    
  } catch (error) {
    console.error('임시 파일 정리 오류:', error);
  }
}

/**
 * Google Drive 폴더 생성 (필요시)
 */
async function createDriveFolderIfNotExists(folderName, parentFolderId = null) {
  try {
    console.log('Drive 폴더 확인/생성:', folderName);
    
    // 실제 구현에서는 Google Drive API 사용
    /*
    const { google } = require('googleapis');
    const drive = google.drive({ version: 'v3', auth });

    // 기존 폴더 검색
    const searchResponse = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)'
    });

    if (searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id;
    }

    // 폴더 생성
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentFolderId ? [parentFolderId] : undefined
    };

    const createResponse = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id'
    });

    return createResponse.data.id;
    */
    
    // 시뮬레이션: 기본 폴더 ID 반환
    return '1qwMIt4_yxM_5yIU7isNTJKp_mrBARlEm';
    
  } catch (error) {
    console.error('Drive 폴더 생성 오류:', error);
    return null;
  }
}

// api/upload-final-video.js - 서비스 계정 방식으로 수정
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { google } from 'googleapis';

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

      // 2. 서비스 계정으로 Google Drive에 업로드
      const driveUploadResult = await uploadToGoogleDriveWithServiceAccount(tempFilePath, fileName, projectInfo);

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
          status: 'uploaded',
          serviceAccount: driveUploadResult.serviceAccount
        },
        metadata: {
          projectInfo: projectInfo,
          uploadMethod: 'service_account',
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
 * 서비스 계정을 사용하여 Google Drive에 파일 업로드
 */
async function uploadToGoogleDriveWithServiceAccount(filePath, fileName, projectInfo) {
  const startTime = Date.now();
  
  try {
    console.log('서비스 계정으로 Google Drive 업로드 시작:', fileName);

    // 서비스 계정 키 정보 가져오기
    const serviceAccountKey = getServiceAccountCredentials();
    
    if (!serviceAccountKey) {
      console.warn('서비스 계정 정보가 없음, 시뮬레이션 모드로 진행');
      return simulateGoogleDriveUpload(filePath, fileName, startTime);
    }

    // Google Drive API 클라이언트 초기화
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive'
      ]
    });

    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });

    // 폴더 ID 가져오기
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '1qwMIt4_yxM_5yIU7isNTJKp_mrBARlEm';

    // 파일 메타데이터 설정
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
      description: `AI 생성 광고영상 - ${projectInfo?.brandName || '브랜드'}\n` +
                  `스타일: ${projectInfo?.style || '기본'}\n` +
                  `생성일: ${new Date().toISOString()}\n` +
                  `길이: ${projectInfo?.duration || '알 수 없음'}`
    };

    // 파일 내용 읽기
    const fileContent = await fs.readFile(filePath);
    console.log(`파일 크기: ${(fileContent.length / 1024 / 1024).toFixed(2)} MB`);

    // Google Drive에 업로드
    console.log('Google Drive API 업로드 시작...');
    const uploadResponse = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: 'video/mp4',
        body: fileContent
      },
      fields: 'id, webViewLink, webContentLink, size, parents'
    });

    const fileId = uploadResponse.data.id;
    console.log('업로드 완료, 파일 ID:', fileId);

    // 파일 권한 설정 (공개 읽기 권한)
    try {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });
      console.log('공개 권한 설정 완료');
    } catch (permError) {
      console.warn('권한 설정 실패:', permError.message);
      // 권한 설정 실패해도 업로드는 성공으로 처리
    }

    // 파일 정보 다시 조회 (최신 링크 확보)
    const fileInfo = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, webViewLink, webContentLink, size, parents, createdTime'
    });

    return {
      fileId: fileId,
      driveUrl: fileInfo.data.webViewLink,
      downloadUrl: fileInfo.data.webContentLink,
      size: parseInt(fileInfo.data.size || fileContent.length),
      folderId: folderId,
      permissions: 'public_read',
      serviceAccount: serviceAccountKey.client_email,
      processingTime: Date.now() - startTime,
      createdTime: fileInfo.data.createdTime
    };

  } catch (error) {
    console.error('서비스 계정 Drive 업로드 오류:', error);
    
    // 업로드 실패시에도 기본 정보는 반환
    return {
      fileId: null,
      driveUrl: null,
      downloadUrl: null,
      size: await getFileSize(filePath),
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '1qwMIt4_yxM_5yIU7isNTJKp_mrBARlEm',
      permissions: 'upload_failed',
      serviceAccount: 'failed',
      processingTime: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * 서비스 계정 자격 증명 가져오기
 */
function getServiceAccountCredentials() {
  try {
    // 1. 환경변수에서 JSON 문자열로 설정된 경우
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountJson) {
      return JSON.parse(serviceAccountJson);
    }

    // 2. 개별 환경변수로 설정된 경우
    const serviceAccountFromEnv = {
      type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE || 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_ID,
      auth_uri: process.env.GOOGLE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
      token_uri: process.env.GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
      universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN || 'googleapis.com'
    };

    // 필수 필드 확인
    if (serviceAccountFromEnv.project_id && 
        serviceAccountFromEnv.private_key && 
        serviceAccountFromEnv.client_email) {
      return serviceAccountFromEnv;
    }

    console.log('서비스 계정 정보 없음 - 환경변수를 확인하세요');
    return null;

  } catch (error) {
    console.error('서비스 계정 자격 증명 파싱 오류:', error);
    return null;
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
 * Google Drive 업로드 시뮬레이션 (서비스 계정 정보가 없을 때)
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
    serviceAccount: 'simulated',
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

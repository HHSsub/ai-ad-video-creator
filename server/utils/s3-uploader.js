import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fetch from 'node-fetch';
import fs from 'fs';

const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'nexxii-media-storage';
const CDN_BASE_URL = 'https://upnexx.ai/nexxii-storage';

/**
 * 외부 URL에서 이미지 다운로드 후 S3 업로드
 * @param {string} imageUrl - Freepik 임시 URL
 * @param {string} projectId - 프로젝트 ID
 * @param {number} conceptId - 컨셉 ID
 * @param {number} sceneNumber - 씬 번호
 * @returns {Promise<string>} S3 URL (CloudFront 경로)
 */
export async function uploadImageToS3(imageUrl, projectId, conceptId, sceneNumber) {
    console.log(`[S3] 이미지 다운로드 시작: ${imageUrl.substring(0, 80)}...`);

    try {
        // 1. 외부 URL에서 이미지 다운로드
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`이미지 다운로드 실패: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        console.log(`[S3] 다운로드 완료: ${(buffer.byteLength / 1024).toFixed(2)} KB`);

        // 2. S3 키 생성 (nexxii-storage 접두어 필수)
        const s3Key = `nexxii-storage/projects/${projectId}/images/concept_${conceptId}_scene_${sceneNumber}.jpg`;

        // 3. S3 업로드
        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: s3Key,
                Body: Buffer.from(buffer),
                ContentType: contentType,
                CacheControl: 'public, max-age=31536000', // 1년 캐싱
            },
        });

        await upload.done();

        // 4. CloudFront URL 반환
        // CDN_BASE_URL에 nexxii-storage가 포함되어 있으므로, 키에서 중복되지 않도록 처리하거나 절대 경로 사용
        const cdnUrl = `https://upnexx.ai/${s3Key}`;
        console.log(`[S3] ✅ 업로드 완료: ${cdnUrl}`);

        return cdnUrl;
    } catch (error) {
        console.error(`[S3] ❌ 이미지 업로드 실패:`, error.message);
        throw error;
    }
}

/**
 * 로컬 비디오 파일 S3 업로드
 * @param {string} videoPath - 로컬 파일 경로
 * @param {string} projectId - 프로젝트 ID
 * @param {string} conceptId - 컨셉 ID
 * @param {string} filename - 파일명 (확장자 제외)
 * @returns {Promise<string>} S3 URL (CloudFront 경로)
 */
export async function uploadVideoToS3(videoPath, projectId, conceptId, filename) {
    console.log(`[S3] 비디오 업로드 시작: ${videoPath}`);

    try {
        const buffer = fs.readFileSync(videoPath);
        console.log(`[S3] 파일 읽기 완료: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

        const s3Key = `nexxii-storage/projects/${projectId}/videos/${filename}.mp4`;

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: s3Key,
                Body: buffer,
                ContentType: 'video/mp4',
                CacheControl: 'public, max-age=31536000', // 1년 캐싱
            },
        });

        await upload.done();

        const cdnUrl = `https://upnexx.ai/${s3Key}`;
        console.log(`[S3] ✅ 비디오 업로드 완료: ${cdnUrl}`);

        return cdnUrl;
    } catch (error) {
        console.error(`[S3] ❌ 비디오 업로드 실패:`, error.message);
        throw error;
    }
}

/**
 * S3 파일 삭제
 * @param {string} s3Url - S3 URL (CloudFront 경로)
 * @returns {Promise<void>}
 */
export async function deleteFromS3(s3Url) {
    console.log(`[S3] 삭제 시작: ${s3Url}`);

    try {
        const s3Key = s3Url.replace(`${CDN_BASE_URL}/`, '');

        await s3Client.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
        }));

        console.log(`[S3] ✅ 삭제 완료: ${s3Key}`);
    } catch (error) {
        console.error(`[S3] ❌ 삭제 실패:`, error.message);
        throw error;
    }
}

/**
 * S3 폴더 내 파일 목록 조회
 * @param {string} prefix - 폴더 경로 (예: 'persons/')
 * @returns {Promise<Array<{key: string, url: string, lastModified: Date}>>}
 */
export async function listS3Files(prefix) {
    console.log(`[S3] 목록 조회: ${prefix}`);
    try {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix
        });

        const response = await s3Client.send(command);
        const contents = response.Contents || [];

        return contents.map(item => ({
            key: item.Key,
            url: `https://upnexx.ai/${item.Key}`,
            lastModified: item.LastModified,
            size: item.Size
        }));
    } catch (error) {
        console.error(`[S3] ❌ 목록 조회 실패:`, error.message);
        throw error;
    }
}

/**
         * 버퍼 데이터 S3 업로드
         * @param {Buffer} buffer - 파일 데이터
         * @param {string} projectId - 프로젝트 ID
         * @param {string} filename - 저장할 파일명
         * @param {string} contentType - MIME 타입 (기본: image/jpeg)
         * @returns {Promise<string>} S3 URL
         */
// ... existing code ...
export async function uploadBufferToS3(buffer, projectId, filename, contentType = 'image/jpeg') {
    const s3Key = `nexxii-storage/projects/${projectId}/images/${filename}`;

    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000',
        },
    });

    await upload.done();

    const cdnUrl = `https://upnexx.ai/${s3Key}`;
    console.log(`[S3] ✅ 버퍼 업로드 완료: ${cdnUrl}`);

    return cdnUrl;
}

/**
 * Base64 문자열 S3 업로드
 * @param {string} base64Data - Base64 인코딩된 이미지 데이터
 * @param {string} s3Key - S3 저장 키 (경로 포함)
 * @returns {Promise<{url: string, key: string}>}
 */
export async function uploadBase64ToS3(base64Data, s3Key) {
    try {
        const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ""), 'base64');

        // ContentType 추론 (기본값 png)
        let contentType = 'image/png';
        if (base64Data.startsWith('data:image/jpeg')) contentType = 'image/jpeg';
        if (base64Data.startsWith('data:image/webp')) contentType = 'image/webp';

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: s3Key,
                Body: buffer,
                ContentType: contentType,
                CacheControl: 'public, max-age=31536000',
            },
        });

        await upload.done();
        const url = `https://upnexx.ai/${s3Key}`;
        console.log(`[S3] ✅ Base64 업로드 완료: ${url}`);
        return { url, key: s3Key };

    } catch (error) {
        console.error(`[S3] ❌ Base64 업로드 실패:`, error.message);
        throw error;
    }
}

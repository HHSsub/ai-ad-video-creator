import { google } from 'googleapis';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// Configuration
const DRIVE_FOLDER_ID = '1P-ALwXFonisuTSWKfv0Nz4d6QX1Zgrxl';
const SERVICE_ACCOUNT_FILE = path.resolve(process.cwd(), 'config/google-service-account.json');
const METADATA_FILE = path.resolve(process.cwd(), 'config/persons-metadata.json');
const BUCKET_NAME = 'nexxii-media-storage';

// AWS S3 Client
const s3Client = new S3Client({
    region: 'ap-northeast-2',
    credentials: fromNodeProviderChain()
});

/**
 * Sync Handler
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    try {
        console.log('[Drive Sync] 시작...');

        // 1. Google Auth
        if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
            // Fallback: Check env var if file doesn't exist (User might have set ENV instead)
            if (!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
                return res.status(500).json({ success: false, error: 'Service Account credentials not found (config/google-service-account.json)' });
            }
            console.log('[Drive Sync] Using Environment Variable Credentials');
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: fs.existsSync(SERVICE_ACCOUNT_FILE) ? SERVICE_ACCOUNT_FILE : undefined,
            credentials: !fs.existsSync(SERVICE_ACCOUNT_FILE) && process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS
                ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS)
                : undefined,
            scopes: ['https://www.googleapis.com/auth/drive.readonly']
        });

        const drive = google.drive({ version: 'v3', auth });

        // 2. List Files
        console.log(`[Drive Sync] 폴더 ID: ${DRIVE_FOLDER_ID} 조회 중...`);
        const fileList = [];
        let pageToken = null;

        do {
            const response = await drive.files.list({
                q: `'${DRIVE_FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`,
                fields: 'nextPageToken, files(id, name, mimeType, webContentLink)',
                pageToken: pageToken
            });
            fileList.push(...(response.data.files || []));
            pageToken = response.data.nextPageToken;
        } while (pageToken);

        console.log(`[Drive Sync] 발견된 이미지: ${fileList.length}개`);

        // 3. Process & Upload to S3
        const metadataList = [];
        let uploadedCount = 0;
        let diffCount = 0; // files that needed update (not implemented fully, assuming overwrite or new)

        for (const file of fileList) {
            // Filename Parsing: Age_Gender_Nationality_Name.png
            // Example: 60_Male_Korean_만석(Man-seok).png
            let meta = {
                id: file.id,
                filename: file.name,
                age: 'Unknown',
                gender: 'Unknown',
                nationality: 'Unknown',
                name: file.name.split('.')[0]
            };

            const parts = file.name.split('.')[0].split('_');
            if (parts.length >= 4) {
                meta.age = parts[0];
                meta.gender = parts[1];
                meta.nationality = parts[2];
                meta.name = parts[3];
            } else if (parts.length === 3) {
                // Fallback if format varies slightly
                meta.age = parts[0];
                meta.gender = parts[1];
                meta.name = parts[2];
            }

            const s3Key = `nexxii-storage/persons/${file.name}`;
            const s3Url = `https://upnexx.ai/${s3Key}`;

            // Add to metadata
            metadataList.push({
                ...meta,
                s3Key,
                s3Url
            });

            // Check if exists (Optional optimization: Skip if exists? For now, let's sync all or check presence)
            // For robustness, we will attempt upload. Note: This can be slow for many files.
            // PROD: Check HEAD object first.

            try {
                // Download from Drive
                const response = await fetch(file.webContentLink);
                if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
                const buffer = await response.arrayBuffer();

                // Upload to S3
                const upload = new Upload({
                    client: s3Client,
                    params: {
                        Bucket: BUCKET_NAME,
                        Key: s3Key,
                        Body: Buffer.from(buffer),
                        ContentType: file.mimeType,
                        CacheControl: 'public, max-age=31536000'
                    }
                });

                await upload.done();
                uploadedCount++;
                console.log(`[Drive Sync] Uploaded: ${file.name}`);

            } catch (err) {
                console.error(`[Drive Sync] Failed to process ${file.name}: ${err.message}`);
            }
        }

        // 4. Update Metadata Cache
        fs.writeFileSync(METADATA_FILE, JSON.stringify(metadataList, null, 2), 'utf-8');
        console.log(`[Drive Sync] 메타데이터 저장 완료: ${metadataList.length}건`);

        res.json({
            success: true,
            message: `동기화 완료. ${uploadedCount}개 파일 업로드/갱신.`,
            count: metadataList.length
        });

    } catch (error) {
        console.error('[Drive Sync] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

import express from 'express';
import multer from 'multer';
import { listS3Files, deleteFromS3 } from '../server/utils/s3-uploader.js';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const BUCKET_NAME = 'nexxii-media-storage';
const CDN_BASE_URL = 'https://upnexx.ai/nexxii-storage';
const s3Client = new S3Client({ region: 'ap-northeast-2' });

// 목록 조회
router.get('/', async (req, res) => {
    try {
        // 🔥 변경된 S3 구조 반영: nexxii-storage/persons/
        const files = await listS3Files('nexxii-storage/persons/');

        const persons = files.map(file => {
            // 키에서 이름 추출 (예: nexxii-storage/persons/man.jpg -> man)
            const name = file.key.replace('nexxii-storage/persons/', '').split('.')[0];

            // 🔥 URL 중복 방지: Base URL에 이미 경로가 포함되어 있으므로, 
            // Key에서 'nexxii-storage/' 부분이 중복되지 않도록 처리하거나
            // 단순히 도메인 + 키 조합으로 재구성
            // CDN_BASE_URL = 'https://upnexx.ai/nexxii-storage'
            // Key = 'nexxii-storage/persons/man.jpg'
            // file.url (from utils) = 'https://upnexx.ai/nexxii-storage/nexxii-storage/persons/man.jpg' (잘못됨)

            const fixedUrl = `https://upnexx.ai/${file.key}`;

            return {
                ...file,
                name,
                url: fixedUrl
            };
        });

        res.json({ success: true, persons });
    } catch (error) {
        console.error('[Persons] Create Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch persons' });
    }
});

// 인물 업로드
router.post('/', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image file provided' });
        }

        const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); // 한글 깨짐 방지
        // 🔥 업로드 경로도 변경
        const s3Key = `nexxii-storage/persons/${filename}`;

        console.log(`[Persons] Uploading: ${filename} to ${s3Key}`);

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: s3Key,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
                CacheControl: 'public, max-age=31536000',
            },
        });

        await upload.done();

        const url = `${CDN_BASE_URL}/${s3Key}`;
        res.json({ success: true, url, key: s3Key });
    } catch (error) {
        console.error('[Persons] Upload Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 인물 삭제
router.delete('/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        // 🔥 경로 수정: nexxii-storage/persons/
        const s3Key = `nexxii-storage/persons/${filename}`;

        // deleteFromS3 expects full URL or needs adaptation, wait.
        // s3-uploader.js deleteFromS3 takes s3Url and replaces CDN_BASE_URL.
        // If I pass FULL URL, it works. If I pass key?
        // Let's manually perform delete or construct URL.
        const fullUrl = `${CDN_BASE_URL}/${s3Key}`;
        await deleteFromS3(fullUrl);

        res.json({ success: true });
    } catch (error) {
        console.error('[Persons] Delete Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

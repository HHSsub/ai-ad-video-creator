import express from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const router = express.Router();
const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'nexxii-media-storage';

router.get('/', async (req, res) => {
    try {
        const { key } = req.query;
        if (!key) {
            return res.status(400).json({ error: 'Missing key parameter' });
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });

        const response = await s3Client.send(command);

        if (response.ContentType) {
            res.setHeader('Content-Type', response.ContentType);
        }
        res.setHeader('Cache-Control', 'public, max-age=31536000');

        response.Body.pipe(res);

    } catch (error) {
        console.error('[ImageProxy] Error:', error);
        res.status(404).json({ error: 'Image not found or access denied' });
    }
});

export default router;

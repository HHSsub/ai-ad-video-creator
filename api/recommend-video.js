import express from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as XLSX from 'xlsx';


const router = express.Router();

const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'nexxii-media-storage';
const EXCEL_KEY = 'nexad-recommendations/분석DB_전체_2026-01-05.xlsx';

// Helper to convert stream to buffer
const getStreamBuffer = async (stream) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
};

// Helper to parse ISO 8601 duration (PT1M30S) to seconds
const parseDuration = (durationStr) => {
    if (!durationStr) return 999999;
    const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 999999;

    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);

    return (hours * 3600) + (minutes * 60) + seconds;
};

router.post('/', async (req, res) => {
    try {
        const { conceptType } = req.body; // 'product' (제품) or 'service' (서비스)

        console.log(`[Recommend] Request for concept: ${conceptType}`);

        if (!conceptType) {
            return res.status(400).json({ error: 'Concept type required' });
        }

        // 1. Determine keyword based on concept
        // Product -> "제품", Service -> "브랜딩"
        const targetKeyword = conceptType === 'product' ? '제품' : '브랜딩';

        // 2. Fetch Excel from S3
        console.log(`[Recommend] Fetching Excel from S3: ${EXCEL_KEY}`);
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: EXCEL_KEY
        });

        const response = await s3Client.send(command);
        const buffer = await getStreamBuffer(response.Body);

        // 3. Parse Excel
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        console.log(`[Recommend] Loaded ${data.length} rows.`);

        // 4. Filter Data
        const candidates = data.filter(row => {
            // Check Keyword in "153.종합 분석_산업"
            const industryAnalysis = row['153.종합 분석_산업'] || '';
            const hasKeyword = industryAnalysis.includes(targetKeyword);

            // Check Duration <= 1m 30s (90 seconds)
            // Column: "영상길이" (e.g., PT21M59S)
            const durationStr = row['영상길이'];
            const durationSec = parseDuration(durationStr);
            const isShort = durationSec <= 90;

            // Must have URL and Title
            const hasUrl = !!row['URL'];
            const hasTitle = !!row['영상제목'];

            return hasKeyword && isShort && hasUrl && hasTitle;
        });

        console.log(`[Recommend] Found ${candidates.length} candidates for ${targetKeyword}`);

        if (candidates.length === 0) {
            return res.json({ success: false, message: 'No matching video found' });
        }

        // 5. Sort by Views (조회수) - Descending
        // Column: "조회수" (ensure it's treated as number)
        candidates.sort((a, b) => {
            const viewsA = parseInt(a['조회수'] || 0);
            const viewsB = parseInt(b['조회수'] || 0);
            return viewsB - viewsA;
        });

        // 6. Pick Top 1
        const topVideo = candidates[0];

        res.json({
            success: true,
            video: {
                title: topVideo['영상제목'],
                url: topVideo['URL'],
                views: topVideo['조회수'],
                duration: topVideo['영상길이']
            }
        });

    } catch (error) {
        console.error('[Recommend] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;

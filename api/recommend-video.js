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
        console.log('[Recommend] Parsing Excel buffer...');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        console.log(`[Recommend] Sheet Name: ${sheetName}`);

        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        console.log(`[Recommend] Loaded ${data.length} rows from Excel.`);

        if (data.length > 0) {
            console.log('[Recommend] First row keys:', Object.keys(data[0]));
        }

        // 4. Filter Data
        // 4. Filter Data (With Debugging)
        let countMatchKeyword = 0;
        let countMatchDuration = 0;
        let countHasUrlTitle = 0;

        const candidates = data.filter(row => {
            // Safe Access & Trimming
            const rawText = row['153.종합 분석_산업'] || '';
            const text = String(rawText).trim();

            const hasProduct = text.includes('제품');
            const hasBranding = text.includes('브랜딩');

            // Broad Matching Logic
            let isMatch = false;
            if (conceptType === 'product') {
                isMatch = hasProduct || !hasBranding;
            } else {
                isMatch = hasBranding || !hasProduct;
            }
            if (isMatch) countMatchKeyword++;

            // Duration Check
            const durationStr = row['영상길이'];
            const durationSec = parseDuration(durationStr);
            const isShort = durationSec <= 90;
            if (isMatch && isShort) countMatchDuration++;

            // URL & Title Check
            const hasUrl = !!row['URL'] && String(row['URL']).trim().length > 0;
            const hasTitle = !!row['영상제목'] && String(row['영상제목']).trim().length > 0;
            if (isMatch && isShort && hasUrl && hasTitle) countHasUrlTitle++;

            return isMatch && isShort && hasUrl && hasTitle;
        });

        console.log(`[Recommend] Filtering Stats:
            - Total Rows: ${data.length}
            - Match Keyword (${targetKeyword}): ${countMatchKeyword}
            - Match Duration (<=90s): ${countMatchDuration}
            - Has URL/Title: ${countHasUrlTitle}
            - Final Candidates: ${candidates.length}
        `);

        console.log(`[Recommend] Found ${candidates.length} candidates for ${targetKeyword}`);

        if (candidates.length === 0) {
            console.warn('[Recommend] No matches found. Converting conceptType fallback...');
            // Fallback: Try searching WITHOUT keyword if nothing found? Or just return empty.
            // For now, return explicit failure message to frontend.
            return res.json({ success: false, message: 'No matching video found', totalRows: data.length });
        }

        // 5. Sort by Views (조회수) - Descending
        // Column: "조회수" (ensure it's treated as number)
        candidates.sort((a, b) => {
            const viewsA = parseInt(String(a['조회수']).replace(/,/g, '') || 0); // Handle "1,234" format
            const viewsB = parseInt(String(b['조회수']).replace(/,/g, '') || 0);
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

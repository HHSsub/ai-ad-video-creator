// api/storage-info.js - AWS S3 Storage Information & Cost Estimation
import { s3Client, BUCKET_NAME } from '../src/utils/awsConfig.js';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

/**
 * Calculate AWS S3 Standard Storage Cost
 * Pricing (ap-northeast-2 Seoul region estimation):
 * - First 50 TB: $0.023 / GB
 * - Next 450 TB: $0.022 / GB
 * - Over 500 TB: $0.021 / GB
 */
function calculateS3Cost(bytes) {
    const GB = 1024 * 1024 * 1024;
    const TB = 1024 * GB;

    let remainingBytes = bytes;
    let totalCost = 0;

    // Tier 1: First 50TB
    const tier1Limit = 50 * TB;
    const tier1Bytes = Math.min(remainingBytes, tier1Limit);
    totalCost += (tier1Bytes / GB) * 0.023;
    remainingBytes = Math.max(0, remainingBytes - tier1Limit);

    // Tier 2: Next 450TB
    if (remainingBytes > 0) {
        const tier2Limit = 450 * TB;
        const tier2Bytes = Math.min(remainingBytes, tier2Limit);
        totalCost += (tier2Bytes / GB) * 0.022;
        remainingBytes = Math.max(0, remainingBytes - tier2Limit);
    }

    // Tier 3: Over 500TB
    if (remainingBytes > 0) {
        totalCost += (remainingBytes / GB) * 0.021;
    }

    return totalCost;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        console.log(`[storage-info] S3 버킷 정보 조회 시작: ${BUCKET_NAME}`);

        // 1. Calculate Total S3 Usage (Iterate through all objects)
        // WARNING: This can be slow for buckets with millions of objects.
        // For production, consider using S3 Inventory or caching.
        let isTruncated = true;
        let continuationToken = undefined;
        let totalBytes = 0;
        let objectCount = 0;

        // Specific folders to track
        const folderStats = {
            'nexad-recommendations/': 0,
            'nexxii-storage/': 0,
            'projects/': 0
        };

        while (isTruncated) {
            const command = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                ContinuationToken: continuationToken
            });

            const response = await s3Client.send(command);

            if (response.Contents) {
                for (const item of response.Contents) {
                    const size = item.Size || 0;
                    totalBytes += size;
                    objectCount++;

                    // Track specific folder usage
                    for (const folder of Object.keys(folderStats)) {
                        if (item.Key?.startsWith(folder)) {
                            folderStats[folder] += size;
                        }
                    }
                }
            }

            isTruncated = response.IsTruncated;
            continuationToken = response.NextContinuationToken;
        }

        // 2. Cost Calculation
        const currentCostUSD = calculateS3Cost(totalBytes);

        // Simple linear projection for end of month cost
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentDay = now.getDate();
        // Projection: (Current Cost / Current Day) * Days In Month
        // Note: This assumes linear accumulation which is just an approximation.
        // If it's day 1, we use day 1's cost as the daily average.
        const projectedCostUSD = (currentCostUSD / Math.max(1, currentDay)) * daysInMonth;

        console.log('[storage-info] ✅ S3 정보 조회 완료');

        return res.status(200).json({
            success: true,
            provider: 'AWS S3',
            bucketName: BUCKET_NAME,
            usage: {
                totalBytes,
                totalBytesFormatted: formatBytes(totalBytes),
                objectCount
            },
            cost: {
                currency: 'USD',
                currentMonth: currentCostUSD.toFixed(4),
                projectedMonth: projectedCostUSD.toFixed(2),
                pricingTier: 'Standard (Seoul)'
            },
            folders: Object.entries(folderStats).map(([name, size]) => ({
                name: name.replace('/', ''),
                size,
                sizeFormatted: formatBytes(size)
            }))
        });

    } catch (error) {
        console.error('[storage-info] ❌ 오류:', error);

        // Friendly error for credential issues
        let errorMessage = error.message;
        if (error.name === 'CredentialsProviderError' || error.message.includes('authen')) {
            errorMessage = 'AWS 자격 증명을 찾을 수 없습니다. (EC2 IAM Role 또는 .env 설정을 확인해주세요)';
        }

        return res.status(500).json({
            success: false,
            error: errorMessage
        });
    }
}


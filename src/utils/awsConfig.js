import { S3Client } from '@aws-sdk/client-s3';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers'; // Use default provider chain
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const REGION = process.env.AWS_REGION || 'ap-northeast-2'; // Default to Seoul
// Credentials are strictly optional in config if running on EC2 with IAM Role
const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const clientConfig = {
    region: REGION
};

// Only add explicit credentials if they exist in env. 
// Otherwise, let the SDK look for them (EC2 Role, ~/.aws/credentials, etc.)
if (ACCESS_KEY_ID && SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY
    };
    console.log('[AWS Config] ✅ .env 파일의 자격 증명을 사용합니다.');
} else {
    // If no explicit keys, use the provider chain (EC2 Role, etc.)
    clientConfig.credentials = fromNodeProviderChain();
    console.log('[AWS Config] ℹ️ .env 자격 증명이 없어 기본 제공자 체인(EC2 Role 등)을 시도합니다.');
}

const s3Client = new S3Client(clientConfig);

export { s3Client };
export const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'nexxii-media-storage';

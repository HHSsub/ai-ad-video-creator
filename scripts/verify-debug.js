
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'nexxii-media-storage';

async function check(id) {
    const prefix = `nexxii-storage/projects/${id}/`;
    const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 5
    });
    try {
        const response = await s3Client.send(command);
        const count = response.Contents ? response.Contents.length : 0;
        console.log(`[${id}] Count: ${count}`);
        if (count > 0) console.log(` - Sample: ${response.Contents[0].Key}`);
    } catch (e) {
        console.log(`[${id}] Error: ${e.message}`);
    }
}

async function verify() {
    const timestamp = '1768290350790';
    const oldId = `project_${timestamp}`;
    const newId = `admin_${timestamp}`;

    console.log(`Checking S3 status for timestamp ${timestamp}...`);
    await check(oldId);
    await check(newId);
}

verify();

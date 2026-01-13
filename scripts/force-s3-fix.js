
import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'nexxii-media-storage';

async function moveFolder(oldId, newId) {
    const oldPrefix = `nexxii-storage/projects/${oldId}/`;
    const newPrefix = `nexxii-storage/projects/${newId}/`;

    console.log(`Moving ${oldPrefix} -> ${newPrefix}`);

    let continuationToken;
    let count = 0;
    do {
        const listCmd = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: oldPrefix,
            ContinuationToken: continuationToken
        });
        const res = await s3Client.send(listCmd);
        const objects = res.Contents || [];

        if (objects.length > 0) {
            // Copy
            for (const obj of objects) {
                const newKey = obj.Key.replace(oldPrefix, newPrefix);
                console.log(`Copying ${obj.Key} -> ${newKey}`);
                await s3Client.send(new CopyObjectCommand({
                    Bucket: BUCKET_NAME,
                    CopySource: `${BUCKET_NAME}/${obj.Key}`,
                    Key: newKey
                    // NO ACL!
                }));
            }

            // Delete
            await s3Client.send(new DeleteObjectsCommand({
                Bucket: BUCKET_NAME,
                Delete: {
                    Objects: objects.map(o => ({ Key: o.Key })),
                    Quiet: true
                }
            }));
            count += objects.length;
        }
        continuationToken = res.NextContinuationToken;
    } while (continuationToken);

    console.log(`Moved ${count} objects.`);
}

async function run() {
    // Target specific split-brain project
    await moveFolder('project_1768290350790', 'admin_1768290350790');
}

run().catch(console.error);

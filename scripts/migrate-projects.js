
import fs from 'fs';
import path from 'path';
import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'nexxii-media-storage';

const PROJECTS_DIR = path.join(process.cwd(), 'config', 'projects');
const MEMBERS_FILE = path.join(process.cwd(), 'config', 'project-members.json');

async function renameS3Folder(oldId, newId) {
    const oldPrefix = `nexxii-storage/projects/${oldId}/`;
    const newPrefix = `nexxii-storage/projects/${newId}/`;

    console.log(`[S3] Moving objects from ${oldPrefix} to ${newPrefix}...`);

    let continuationToken;
    let totalMoved = 0;

    try {
        do {
            const listCommand = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: oldPrefix,
                ContinuationToken: continuationToken
            });
            const listResponse = await s3Client.send(listCommand);
            const objects = listResponse.Contents || [];

            if (objects.length > 0) {
                // Copy each object
                for (const obj of objects) {
                    const oldKey = obj.Key;
                    const newKey = oldKey.replace(oldPrefix, newPrefix);

                    await s3Client.send(new CopyObjectCommand({
                        Bucket: BUCKET_NAME,
                        CopySource: `${BUCKET_NAME}/${oldKey}`, // Source must be URL-encoded? No, typically Bucket/Key
                        Key: newKey,
                        ACL: 'public-read' // Ensure public read
                    }));
                }

                // Delete old objects
                await s3Client.send(new DeleteObjectsCommand({
                    Bucket: BUCKET_NAME,
                    Delete: {
                        Objects: objects.map(o => ({ Key: o.Key })),
                        Quiet: true
                    }
                }));

                totalMoved += objects.length;
            }
            continuationToken = listResponse.NextContinuationToken;
        } while (continuationToken);

        console.log(`[S3] Moved ${totalMoved} objects.`);
    } catch (err) {
        console.error(`[S3] Error moving folder:`, err);
    }
}

async function migrate() {
    if (!fs.existsSync(PROJECTS_DIR)) {
        console.log('No projects directory found.');
        return;
    }

    const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.startsWith('project_') && f.endsWith('.json'));
    console.log(`Found ${files.length} projects to migrate.`);

    // Load members
    let membersData = { members: [] };
    if (fs.existsSync(MEMBERS_FILE)) {
        membersData = JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8'));
    }

    for (const file of files) {
        const oldId = file.replace('.json', '');
        const oldPath = path.join(PROJECTS_DIR, file);

        try {
            const data = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
            const owner = (data.createdBy || 'anonymous').replace(/[^a-zA-Z0-9]/g, '_');
            const parts = oldId.split('_');
            const timestamp = parts.length > 1 ? parts[1] : Date.now();

            const newId = `${owner}_${timestamp}`;

            if (fs.existsSync(path.join(PROJECTS_DIR, `${newId}.json`))) {
                console.warn(`Target file ${newId}.json already exists. Skipping.`);
                continue;
            }

            console.log(`Migrating: ${oldId} -> ${newId} (Owner: ${owner})`);

            // 1. S3 Migration
            await renameS3Folder(oldId, newId);

            // 2. Content Update (Replace IDs in stringified JSON)
            data.id = newId;
            let contentStr = JSON.stringify(data, null, 2);
            // Global replace of old ID in paths (S3 URLs, etc)
            // Need to be careful. projects/project_123 -> projects/user_123
            const regex = new RegExp(`projects/${oldId}`, 'g');
            contentStr = contentStr.replace(regex, `projects/${newId}`);

            // 3. Write New File
            fs.writeFileSync(path.join(PROJECTS_DIR, `${newId}.json`), contentStr, 'utf8');

            // 4. Update Members
            let membersUpdated = false;
            membersData.members.forEach(m => {
                if (m.projectId === oldId) {
                    m.projectId = newId;
                    membersUpdated = true;
                }
            });

            // 5. Delete Old File
            fs.unlinkSync(oldPath);
            console.log(`✅ Migrated local file and deleted old one.`);

        } catch (err) {
            console.error(`❌ Failed to migrate ${oldId}:`, err);
        }
    }

    // Save members
    fs.writeFileSync(MEMBERS_FILE, JSON.stringify(membersData, null, 2));
    console.log('Migration complete.');
}

migrate().catch(console.error);

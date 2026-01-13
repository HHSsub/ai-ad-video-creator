
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

    // Check if old folder has any objects
    const checkCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: oldPrefix,
        MaxKeys: 1
    });
    const checkResponse = await s3Client.send(checkCommand);
    if (!checkResponse.Contents || checkResponse.Contents.length === 0) {
        // No old folder found, skipping S3 move
        return;
    }

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

                    // ACL: 'public-read' REMOVED due to bucket restrictions
                    await s3Client.send(new CopyObjectCommand({
                        Bucket: BUCKET_NAME,
                        CopySource: `${BUCKET_NAME}/${oldKey}`, // Source must be URL-encoded? No, typically Bucket/Key
                        Key: newKey
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

    const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
    console.log(`Scanning ${files.length} projects...`);

    // Load members
    let membersData = { members: [] };
    if (fs.existsSync(MEMBERS_FILE)) {
        membersData = JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8'));
    }

    for (const file of files) {
        const currentId = file.replace('.json', '');
        const currentPath = path.join(PROJECTS_DIR, file);
        let data;
        try {
            data = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
        } catch (e) {
            console.error(`Skipping invalid JSON: ${file}`);
            continue;
        }

        const owner = (data.createdBy || 'anonymous').replace(/[^a-zA-Z0-9]/g, '_');

        // Scenario A: File is still named "project_..."
        if (currentId.startsWith('project_')) {
            const parts = currentId.split('_');
            const timestamp = parts.length > 1 ? parts[1] : Date.now();
            const newId = `${owner}_${timestamp}`;

            console.log(`\n-----------------------------------`);
            console.log(`Scenario A: Full Migration Needed`);
            console.log(`Old ID: ${currentId} -> New ID: ${newId}`);

            // 1. S3 Move
            await renameS3Folder(currentId, newId);

            // 2. Update Content
            data.id = newId;
            let contentStr = JSON.stringify(data, null, 2);
            const regex = new RegExp(`projects/${currentId}`, 'g');
            contentStr = contentStr.replace(regex, `projects/${newId}`);

            // 3. Write New File
            fs.writeFileSync(path.join(PROJECTS_DIR, `${newId}.json`), contentStr, 'utf8');

            // 4. Update Members
            membersData.members.forEach(m => {
                if (m.projectId === currentId) m.projectId = newId;
            });

            // 5. Delete Old File
            fs.unlinkSync(currentPath);
            console.log(`✅ Local file migrated.`);

        }
        // Scenario B: File is already renamed ("admin_..."), check if S3 is lagging
        else {
            // Check if there is a corresponding "project_" folder in S3
            const parts = currentId.split('_');
            const timestamp = parts[parts.length - 1]; // Assume last part is timestamp

            // Reconstruct potential old ID
            const potentialOldId = `project_${timestamp}`;

            if (potentialOldId !== currentId) {
                // Check S3 for potentialOldId
                const oldPrefix = `nexxii-storage/projects/${potentialOldId}/`;
                const checkCommand = new ListObjectsV2Command({
                    Bucket: BUCKET_NAME,
                    Prefix: oldPrefix,
                    MaxKeys: 1
                });

                try {
                    const checkResponse = await s3Client.send(checkCommand);
                    if (checkResponse.Contents && checkResponse.Contents.length > 0) {
                        console.log(`\n-----------------------------------`);
                        console.log(`Scenario B: Split-Brain Repair Needed`);
                        console.log(`Local already correct (${currentId}), but S3 has old folder (${potentialOldId})`);

                        // Move S3 only
                        await renameS3Folder(potentialOldId, currentId);

                        // Update content references (replace old S3 URLs in current file)
                        let contentStr = JSON.stringify(data, null, 2);
                        if (contentStr.includes(`projects/${potentialOldId}`)) {
                            const regex = new RegExp(`projects/${potentialOldId}`, 'g');
                            contentStr = contentStr.replace(regex, `projects/${currentId}`);
                            fs.writeFileSync(currentPath, contentStr, 'utf8');
                            console.log(`✅ Updated S3 URLs in local file.`);
                        }
                    }
                } catch (e) {
                    // Ignore S3 errors (maybe bucket access issue?)
                    console.warn(`[S3] Could not check for old S3 folder ${potentialOldId}:`, e.message);
                }
            }
        }
    }

    // Save members
    fs.writeFileSync(MEMBERS_FILE, JSON.stringify(membersData, null, 2));
    console.log('\nMigration/Repair complete.');
}

migrate().catch(console.error);


import fs from 'fs';
import path from 'path';
import { deleteFromS3 } from '../server/utils/s3-uploader.js';

const PROJECTS_DIR = path.join(process.cwd(), 'config', 'projects');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { projectId, conceptId, sceneNumber, imageUrl } = req.body;

    if (!projectId || !conceptId || sceneNumber === undefined) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    const projectFile = path.join(PROJECTS_DIR, `${projectId}.json`);

    try {
        if (!fs.existsSync(projectFile)) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const projectData = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
        const storyboard = projectData.storyboard;

        if (!storyboard || !storyboard.styles) {
            return res.status(400).json({ error: 'Invalid storyboard data' });
        }

        // Find the concept style
        const styleIndex = storyboard.styles.findIndex(s => s.conceptId == conceptId || s.concept_id == conceptId);
        if (styleIndex === -1) {
            return res.status(404).json({ error: 'Concept not found' });
        }

        const currentImages = storyboard.styles[styleIndex].images;

        // Find the scene to delete (for validation)
        const sceneToDelete = currentImages.find(img => img.sceneNumber === sceneNumber);

        if (!sceneToDelete) {
            console.warn(`[delete-scene] Scene ${sceneNumber} not found in project ${projectId}, possibly already deleted.`);
        } else {
            // 🔥 S3 DELETE LOGIC (Corrected)
            const targetUrl = imageUrl || sceneToDelete.imageUrl;

            if (targetUrl && targetUrl.includes('nexxii-storage')) {
                try {
                    console.log(`[delete-scene] S3 삭제 시도: ${targetUrl}`);
                    await deleteFromS3(targetUrl);
                    console.log(`[delete-scene] ✅ S3 파일 삭제 완료`);
                } catch (s3Error) {
                    console.error(`[delete-scene] ❌ S3 삭제 실패 (무시하고 진행): ${s3Error.message}`);
                }
            } else {
                console.log(`[delete-scene] S3 URL이 아니거나 유효하지 않음: ${targetUrl}`);
            }
        }

        // 🔥 UPDATE JSON LOGIC
        // Filter out the scene
        const updatedImages = currentImages
            .filter(img => img.sceneNumber !== sceneNumber)
            .sort((a, b) => a.sceneNumber - b.sceneNumber)
            .map((img, index) => ({
                ...img,
                sceneNumber: index + 1 // Re-index strictly
            }));

        storyboard.styles[styleIndex].images = updatedImages;

        // Save Project
        projectData.updatedAt = new Date().toISOString();
        fs.writeFileSync(projectFile, JSON.stringify(projectData, null, 2), 'utf8');

        console.log(`[delete-scene] Scene ${sceneNumber} deleted. Remaining: ${updatedImages.length}`);

        return res.json({
            success: true,
            storyboard: storyboard, // Return updated storyboard
            message: 'Scene deleted successfully'
        });

    } catch (error) {
        console.error('[delete-scene] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

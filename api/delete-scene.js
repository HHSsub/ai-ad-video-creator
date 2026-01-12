
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

const PROJECTS_DIR = path.join(process.cwd(), 'config', 'projects');
// Assuming local storage is in public/nexxii-storage based on previous context or nexxii-storage URL mapping
// However, looking at the user request: "https://upnexx.ai/nexxii-storage/projects/project_1766740872345/images/concept_1_scene_5.jpg"
// If it's a local file system, we need to map this URL to a file path.
// Common pattern: public/nexxii-storage -> /nexxii-storage
const STORAGE_ROOT = path.join(process.cwd(), 'public');

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
            // Scene might already be deleted, but we still proceed to clean up if needed or just return current state
            console.warn(`[delete-scene] Scene ${sceneNumber} not found in project ${projectId}, possibly already deleted.`);
        } else {
            // 🔥 DELETE FILE LOGIC
            // Try to delete the image file if it exists locally
            // imageUrl example: "https://upnexx.ai/nexxii-storage/projects/.../image.jpg"
            // or "/nexxii-storage/projects/.../image.jpg"
            let filePathToDelete = null;

            const targetUrl = imageUrl || sceneToDelete.imageUrl;

            if (targetUrl) {
                try {
                    if (targetUrl.startsWith('http')) {
                        const urlObj = new URL(targetUrl);
                        // pathname: /nexxii-storage/projects/project_.../image.jpg
                        // If mapped to public/nexxii-storage: 
                        // process.cwd() + 'public' + pathname
                        // BUT, we need to be careful about the mount point.
                        // Let's assume 'public' contains 'nexxii-storage'.
                        const relativePath = urlObj.pathname; // /nexxii-storage/...
                        filePathToDelete = path.join(process.cwd(), 'public', relativePath);
                    } else if (targetUrl.startsWith('/')) {
                        filePathToDelete = path.join(process.cwd(), 'public', targetUrl);
                    }

                    if (filePathToDelete && fs.existsSync(filePathToDelete)) {
                        fs.unlinkSync(filePathToDelete);
                        console.log(`[delete-scene] Deleted file: ${filePathToDelete}`);
                    } else {
                        console.log(`[delete-scene] File not found or not local: ${filePathToDelete}`);
                    }
                } catch (err) {
                    console.error(`[delete-scene] Failed to delete file: ${err.message}`);
                    // Continue to delete from JSON even if file deletion fails
                }
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

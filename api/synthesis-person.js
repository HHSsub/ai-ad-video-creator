
import express from 'express';
import { safeComposeWithSeedream } from './seedream-compose.js';
import { uploadImageToS3 } from '../server/utils/s3-uploader.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { sceneImage, personImage, personMetadata, sceneContext, projectId, aspectRatio } = req.body;

        console.log('[API] Person Synthesis Request:', {
            projectId,
            personName: personMetadata?.name,
            hasSceneImage: !!sceneImage,
            hasPersonImage: !!personImage,
            aspectRatio
        });

        if (!sceneImage || !personImage) {
            return res.status(400).json({
                success: false,
                error: 'sceneImage and personImage are required'
            });
        }

        // 1. 합성 실행 (Seedream v4)
        // compositingInfo 구성
        const compositingInfo = {
            sceneDescription: sceneContext || 'High quality cinematic shot',
            sceneDescription: sceneContext || 'High quality cinematic shot',
            aspectRatio: aspectRatio || 'widescreen_16_9', // Default fallback
            personMetadata: personMetadata // 🔥 Pass metadata for prompt engineering
        };

        const result = await safeComposeWithSeedream(sceneImage, personImage, compositingInfo);

        if (result.success && result.imageUrl) {
            // 2. 결과 이미지 S3 업로드 (영구 보관)
            let finalUrl = result.imageUrl;

            // Freepik URL인 경우 S3로 업로드
            if (projectId && finalUrl.includes('freepik')) {
                try {
                    const timestamp = Date.now();
                    // S3 저장 경로: projects/{id}/images/concept_synthesis_scene_{timestamp}.jpg
                    finalUrl = await uploadImageToS3(result.imageUrl, projectId, 'synthesis', timestamp);
                    console.log(`[synthesis-person] S3 Uploaded: ${finalUrl}`);
                } catch (uploadErr) {
                    console.error('[synthesis-person] S3 Upload failed, using original URL:', uploadErr);
                }
            }

            res.json({
                success: true,
                imageUrl: finalUrl,
                originalResult: result
            });
        } else {
            throw new Error('Synthesis succeeded but no image URL returned');
        }

    } catch (error) {
        console.error('[synthesis-person] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});

export default router;

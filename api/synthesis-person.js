
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
            aspectRatio: aspectRatio || 'widescreen_16_9' // Default fallback
        };

        const result = await safeComposeWithSeedream(sceneImage, personImage, compositingInfo);

        if (result.success && result.imageUrl) {
            // 2. 결과 이미지 S3 업로드 (영구 보관)
            // ConceptId, SceneNumber는 현재 컨텍스트에 없으므로(API 파라미터로 안오면)
            // 임의의 파일명이나 timestamp 사용. 
            // 하지만 영속성을 위해 projectId가 있다면 구조화된 경로 사용 권장.

            let finalUrl = result.imageUrl;

            // Freepik URL인 경우 S3로 업로드
            if (projectId && finalUrl.includes('freepik')) {
                try {
                    const timestamp = Date.now();
                    const s3Key = `projects/${projectId}/synthesized/person_${timestamp}.jpg`;

                    // uploadImageToS3는 (url, projectId, conceptId, sceneNum) 시그니처를 가짐.
                    // 여기서는 범용적으로 쓰기 어려우므로, S3 Uploader가 더 유연하면 좋겠지만,
                    // 일단 uploadImageToS3를 재활용하거나 직접 구현해야 함.
                    // 기존함수: uploadImageToS3(imageUrl, projectId, conceptId, sceneNumber)
                    // 임시로 conceptId=0, sceneNumber=timestamp로 사용

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

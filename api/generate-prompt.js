// api/generate-prompt.js
import fs from 'fs';
import path from 'path';
import { getPromptFilePath } from '../src/utils/enginePromptHelper.js';

export const config = {
    maxDuration: 60,
};

function mapAspectRatio(input) {
    if (!input) return 'widescreen_16_9';
    const normalized = String(input).toLowerCase().trim();

    if (normalized.includes('16:9') || normalized.includes('16_9') || normalized === '가로') {
        return 'widescreen_16_9';
    }
    if (normalized.includes('9:16') || normalized.includes('9_16') || normalized === '세로') {
        return 'portrait_9_16';
    }
    if (normalized.includes('1:1') || normalized.includes('1_1') || normalized === '정사각형') {
        return 'square_1_1';
    }

    return 'widescreen_16_9';
}

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { formData } = req.body;

        if (!formData) {
            return res.status(400).json({ success: false, error: 'formData 필요' });
        }

        const {
            brandName, industryCategory, productServiceCategory, productServiceName,
            videoLength, videoPurpose, coreTarget, coreDifferentiation,
            aspectRatio, aspectRatioCode, imageUpload, mode, userdescription
        } = formData;

        // storyboard-init.js Line 667-697과 동일
        const promptFilePath = getPromptFilePath(
            mode === 'manual' ? 'manual' : 'auto',
            videoPurpose
        );

        if (!fs.existsSync(promptFilePath)) {
            return res.status(404).json({
                success: false,
                error: `프롬프트 파일을 찾을 수 없습니다: ${promptFilePath}`
            });
        }

        let promptTemplate = fs.readFileSync(promptFilePath, 'utf-8');

        // 변수 치환
        const promptVariables = {
            brandName: brandName || '',
            industryCategory: industryCategory || '',
            productServiceCategory: productServiceCategory || '',
            productServiceName: productServiceName || '',
            videoPurpose: videoPurpose || 'product',
            videoLength: videoLength || '10초',
            coreTarget: coreTarget || '',
            coreDifferentiation: coreDifferentiation || '',
            videoRequirements: formData.videoRequirements || '없음',
            brandLogo: (imageUpload && imageUpload.url && (videoPurpose === 'service' || videoPurpose === 'brand')) ? '업로드됨' : '없음',
            productImage: (imageUpload && imageUpload.url && (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education')) ? '업로드 됨' : '없음',
            aspectRatioCode: mapAspectRatio(aspectRatioCode || aspectRatio),
            userdescription: userdescription || ''
        };

        for (const [key, value] of Object.entries(promptVariables)) {
            const placeholder = new RegExp(`\\{${key}\\}`, 'g');
            promptTemplate = promptTemplate.replace(placeholder, value);
        }

        console.log('[generate-prompt] ✅ 프롬프트 생성 완료');

        res.status(200).json({
            success: true,
            prompt: promptTemplate,
            promptFilePath: promptFilePath
        });

    } catch (error) {
        console.error('[generate-prompt] ❌ 오류:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

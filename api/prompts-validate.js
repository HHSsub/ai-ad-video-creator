import express from 'express';
const router = express.Router();

/**
 * 프롬프트 유효성 검증 API
 * POST /api/prompts/validate
 */
router.post('/', (req, res) => {
    const { prompt, mode } = req.body;

    if (!prompt) {
        return res.status(400).json({ success: false, error: '프롬프트 내용이 없습니다.' });
    }

    const errors = [];
    const warnings = [];

    // 1. 필수 입력 변수 검증
    const mandatoryVariables = mode === 'manual'
        ? ['videoLength', 'aspectRatioCode', 'videoPurpose', 'userdescription']
        : ['videoPurpose', 'videoLength', 'aspectRatioCode', 'brandName', 'coreTarget', 'coreDifferentiation'];

    mandatoryVariables.forEach(variable => {
        if (!prompt.includes(`{${variable}}`)) {
            errors.push(`필수 변수 {${variable}} 가 누락되었습니다.`);
        }
    });

    // 2. 출력 구조 지시어 검증 (정규식 기반 권고)
    if (mode === 'manual') {
        if (!/Section\s*2|Cinematic\s*Storyboard/i.test(prompt)) {
            warnings.push('Manual 모드에서는 "Section 2" 또는 "Cinematic Storyboard" 헤더를 명시하는 것이 좋습니다.');
        }
    } else {
        if (!/###\s*\d+\.\s*컨셉:/i.test(prompt)) {
            errors.push('Auto 모드 출력 포맷 지시어 "### N. 컨셉:" 형식이 누락되었습니다.');
        }
    }

    // 3. JSON 블록 구조 및 순서 검증 지시어 확인
    const jsonOrderPattern = /image_prompt.*motion_prompt.*copy/is;
    if (!jsonOrderPattern.test(prompt)) {
        warnings.push('출력 JSON 블록 순서(image_prompt -> motion_prompt -> copy)에 대한 명시적 지시가 부족합니다.');
    }

    const sceneHeaderPattern = /S#\d+\s*\(/i;
    if (!sceneHeaderPattern.test(prompt)) {
        errors.push('씬 헤더 형식 "S#N (타임코드)"에 대한 지시가 누락되었습니다.');
    }

    if (errors.length > 0) {
        return res.json({
            success: false,
            errors,
            warnings
        });
    }

    return res.json({
        success: true,
        message: '프롬프트 유효성 검증을 통과했습니다.',
        warnings: warnings.length > 0 ? warnings : null
    });
});

export default router;

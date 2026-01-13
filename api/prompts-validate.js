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
        if (!/Section\s*2|Cinematic\s*Storyboard|Manual\s*Storyboard/i.test(prompt)) {
            warnings.push('Manual 모드 헤더(Section 2 또는 Manual Storyboard 등) 지시어가 보이지 않습니다.');
        }
    } else {
        // # 개수에 상관없이 "# N. 컨셉:" 형식 허용
        if (!/#+\s*\d+\.\s*컨셉:/i.test(prompt)) {
            errors.push('Auto 모드 필수 지시어 "# N. 컨셉:" 형식이 누락되었습니다.');
        }
    }

    // 3. JSON 블록 구조 및 순서 검증
    // 키워드가 직접 없더라도 JSON 블록 3개가 순서대로 지시되어 있는지 확인
    const jsonSequencePatterns = [
        /image_prompt.*motion_prompt.*copy/is,
        /Visual.*Motion.*Copy/is,
        /JSON.*JSON.*JSON/is,
        /이미지.*모션.*카피/is
    ];

    const hasJsonInstruction = jsonSequencePatterns.some(p => p.test(prompt));
    if (!hasJsonInstruction) {
        warnings.push('씬별 3개 JSON 블록(이미지, 모션, 카피) 출력 순서에 대한 지시가 불분명합니다.');
    }

    // 씬 헤더: "S#1", "#### S#1", "S# 1" 등 유연하게 허용
    const sceneHeaderPattern = /S#\s*\d+/i;
    if (!sceneHeaderPattern.test(prompt)) {
        errors.push('씬 구분자 "S#N" 형식이 프롬프트 내에 명시되어야 합니다.');
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

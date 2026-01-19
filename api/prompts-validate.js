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
        ? [
            { key: 'videoLength', label: '영상 길이' },
            { key: 'aspectRatioCode', label: '화면 비율' },
            { key: 'videoPurpose', label: '광고 목적' },
            { key: 'userdescription', label: '사용자 요청 내용' }
        ]
        : [
            { key: 'videoPurpose', label: '광고 목적' },
            { key: 'videoLength', label: '영상 길이' },
            { key: 'aspectRatioCode', label: '화면 비율' },
            { key: 'brandName', label: '브랜드 이름' },
            { key: 'coreTarget', label: '핵심 타겟' },
            { key: 'coreDifferentiation', label: '핵심 차별점/USP' }
        ];

    mandatoryVariables.forEach(item => {
        if (!prompt.includes(`{${item.key}}`)) {
            errors.push(`[변수 누락] {${item.key}} 문구가 없습니다. (의미: Gemini에게 사용자가 선택한 '${item.label}'을 전달하기 위해 필요함)`);
        }
    });

    // 2. 출력 구조 지시어 검증
    if (mode === 'manual') {
        if (!/(Section\s*2|Cinematic\s*Storyboard|Manual\s*Storyboard|Production\s*Guide|Frame-by-Frame)/i.test(prompt)) {
            warnings.push('[구조 미비] "Section 2", "Cinematic Storyboard" 또는 "Production Guide"와 같은 섹션 구분 지시어가 없습니다. (파서가 내용을 찾지 못할 수 있음)');
        }
    } else {
        if (!/#+\s*(\d+|\[Number\])\.\s*컨셉:/i.test(prompt)) {
            errors.push('[구조 누락] "### 1. 컨셉: [이름]" 형식이 프롬프트 지침에 없습니다. (Gemini가 이 형식으로 출력하지 않으면 시스템이 컨셉을 구분할 수 없음)');
        }
    }

    // 3. JSON 블록 구조 및 순서 검증
    const jsonSequencePatterns = [
        /image_prompt.*motion_prompt.*copy/is,
        /Visual.*Motion.*Copy/is,
        /JSON.*JSON.*JSON/is,
        /이미지.*모션.*카피/is
    ];

    const hasJsonInstruction = jsonSequencePatterns.some(p => p.test(prompt));
    if (!hasJsonInstruction) {
        warnings.push('[순서 모호] 씬마다 3개의 JSON(이미지, 모션, 카피)을 순서대로 출력하라는 지시가 부족합니다.');
    }

    const sceneHeaderPattern = /(?:S#|Scene|Sequence|Frame)\s*(\d+|#)/i;
    if (!sceneHeaderPattern.test(prompt)) {
        errors.push('[구분자 누락] "S#1", "Sequence 1", "Frame 1"과 같은 씬 구분자 형식이 프롬프트 지침에 포함되어야 합니다.');
    }

    // 🔥 4. [Post-Production] 편집 가이드 검증 (새 양식)
    if (mode === 'manual') {
        const hasPostProduction = /\[Post-Production\]/i.test(prompt);
        if (hasPostProduction) {
            // Transition 지시어 확인
            if (!/Transition:/i.test(prompt)) {
                warnings.push('[편집 가이드] [Post-Production] 섹션에 "Transition:" 항목이 없습니다.');
            }
            // Sound 지시어 확인
            if (!/Sound\s*\(/i.test(prompt)) {
                warnings.push('[편집 가이드] [Post-Production] 섹션에 "Sound (Suno AI Prompt):" 항목이 없습니다.');
            }
            // SFX 지시어 확인
            if (!/SFX:/i.test(prompt)) {
                warnings.push('[편집 가이드] [Post-Production] 섹션에 "SFX:" 항목이 없습니다.');
            }
        } else {
            warnings.push('[편집 가이드] 각 씬에 [Post-Production] 섹션이 없으면 편집 포인트 제안이 표시되지 않습니다. (선택사항)');
        }
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

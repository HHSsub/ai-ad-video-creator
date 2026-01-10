// 🔥 Freepik Params 매핑 (하드코딩 버전 - 런타임 에러 방지)
function mapToFreepikParams(internalParams) {
    const { aspect_ratio, ...rest } = internalParams;

    // 🔥 portrait_9_16 → social_story_9_16 하드코딩 매핑 (모든 엔진)
    let mappedAspectRatio = aspect_ratio || 'widescreen_16_9';

    if (aspect_ratio === 'portrait_9_16') {
        mappedAspectRatio = 'social_story_9_16';
        console.log('[mapToFreepikParams] portrait_9_16 → social_story_9_16 자동 변환');
    }

    return {
        ...rest,
        aspect_ratio: mappedAspectRatio
    };
}

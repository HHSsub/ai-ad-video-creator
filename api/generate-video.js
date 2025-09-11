// Generate videos from selected images via Freepik Image-to-Video API
// Returns taskIds immediately. Frontend should poll /api/video-status to get playable video URLs.

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { selectedStyle, selectedImages, formData, targetTotalDuration } = req.body || {};

    if (!selectedStyle || !Array.isArray(selectedImages) || selectedImages.length === 0) {
      return res.status(400).json({ error: 'Selected style and images are required' });
    }

    const freepikApiKey =
      process.env.FREEPIK_API_KEY ||
      process.env.REACT_APP_FREEPIK_API_KEY ||
      process.env.VITE_FREEPIK_API_KEY;

    if (!freepikApiKey) throw new Error('Freepik API key not found');

    // Duration planning
    const totalSeconds = parseInt(targetTotalDuration || formData?.videoLength || 30, 10);
    const imageCount = selectedImages.length;
    const segmentDuration = Math.max(2, Math.floor(totalSeconds / imageCount)); // min 2s

    console.log('[generate-video] 요청 수신', {
      style: selectedStyle,
      imageCount,
      targetDuration: totalSeconds,
      perSegment: segmentDuration,
      brandName: formData?.brandName,
    });

    const videoSegments = [];
    const failedSegments = [];

    // Kick off image-to-video jobs (async on provider side)
    for (let i = 0; i < selectedImages.length; i++) {
      const image = selectedImages[i];
      console.log(
        `[generate-video] 비디오 ${i + 1}/${selectedImages.length} 생성 시작: ${
          image.title || image.sceneNumber || ''
        }`
      );

      try {
        if (!image.url) throw new Error('Image URL is required for video generation');
        const videoPromptRaw = generateVideoPrompt(image, formData);
        const videoPrompt = clampPrompt(videoPromptRaw, 1900); // Freepik limit <= 2000

        console.log('[generate-video] 프롬프트 길이:', {
          scene: image.sceneNumber || i + 1,
          promptLength: videoPrompt.length
        });

        const response = await fetch(
          'https://api.freepik.com/v1/ai/image-to-video/minimax-hailuo-02-768p',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-freepik-api-key': freepikApiKey,
            },
            body: JSON.stringify({
              prompt: videoPrompt,
              first_frame_image: image.url,
              // Freepik supports 6s or 10s only
              duration: segmentDuration >= 6 ? 10 : 6,
              webhook_url: null,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[generate-video] Freepik API 오류 (${response.status}):`, errorText);
          throw new Error(`Video API failed: ${response.status}`);
        }

        const result = await response.json();
        const taskId = result?.data?.task_id;
        if (!taskId) throw new Error('Invalid video generation response (no task_id)');

        // Initially IN PROGRESS — videoUrl is not ready yet
        videoSegments.push({
          segmentId: `segment-${i + 1}`,
          sceneNumber: image.sceneNumber || i + 1,
          originalImage: {
            url: image.url,
            title: image.title || null,
          },
          taskId,
          videoUrl: null,
          status: 'in_progress',
          duration: segmentDuration,
          prompt: videoPrompt,
          createdAt: new Date().toISOString(),
        });

        // slight delay to avoid rate limits
        if (i < selectedImages.length - 1) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (err) {
        console.error(`[generate-video] 비디오 ${i + 1} 생성 실패:`, err.message);
        failedSegments.push({
          segmentId: `segment-${i + 1}`,
          sceneNumber: i + 1,
          originalImage: selectedImages[i],
          error: err.message,
          status: 'failed',
          duration: segmentDuration,
        });
      }
    }

    const actualTotalDuration = videoSegments.reduce((sum, s) => sum + s.duration, 0);
    const projectId = `project-${Date.now()}`;

    // Return tasks to the client for polling via /api/video-status
    const tasks = videoSegments.map((s) => ({
      taskId: s.taskId,
      sceneNumber: s.sceneNumber,
      duration: s.duration,
      title: s.originalImage?.title || `Segment ${s.sceneNumber}`,
    }));

    const responsePayload = {
      success: true,
      videoProject: {
        projectId,
        brandName: formData?.brandName || 'Unknown',
        selectedStyle: selectedStyle,
        totalSegments: selectedImages.length,
        successfulSegments: videoSegments.length,
        failedSegments: failedSegments.length,
        requestedDuration: totalSeconds,
        actualDuration: actualTotalDuration,
        segmentDuration,
        status:
          failedSegments.length === 0 && videoSegments.length === 0
            ? 'failed'
            : 'in_progress', // 초기엔 in_progress
        createdAt: new Date().toISOString(),
      },
      videoSegments,
      failedSegments,
      tasks, // 프론트는 이 배열로 /api/video-status를 폴링
      durationInfo: {
        requested: totalSeconds,
        actual: actualTotalDuration,
        perSegment: segmentDuration,
        segments: selectedImages.length,
      },
      compilationGuide: {
        tool: 'FFmpeg',
        command:
          'Server-side merge is handled by /api/compile-videos.',
        instruction:
          'Call /api/video-status to collect completed video URLs, then POST them to /api/compile-videos to get a merged video URL.',
        resolution: '1920x1080',
      },
      metadata: {
        apiProvider: 'Freepik',
        model: 'minimax-hailuo-02-768p',
        generatedAt: new Date().toISOString(),
        note: 'Video generation is asynchronous. Poll /api/video-status with the task IDs.',
      },
    };

    console.log('[generate-video] 프로젝트 생성 완료', {
      projectId,
      총세그먼트: responsePayload.videoProject.totalSegments,
      성공요청수: responsePayload.videoProject.successfulSegments,
      실패요청수: responsePayload.videoProject.failedSegments,
    });

    res.status(200).json(responsePayload);
  } catch (error) {
    console.error('[generate-video] 전체 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

/**
 * Build a motion-oriented prompt for image-to-video.
 * Note: We keep it concise and clamp under API limit.
 */
function generateVideoPrompt(image, formData) {
  const baseRaw = String(image.prompt || image.title || 'commercial advertisement scene');
  const basePrompt = baseRaw.slice(0, 800); // base 자체가 너무 길면 1차 컷

  const motionKeywords = [
    'smooth camera movement',
    'professional cinematography',
    'commercial video style',
    'high quality motion',
    'brand commercial',
  ];

  const brandElements = [];
  if (formData?.brandName) brandElements.push(formData.brandName);
  if (formData?.industryCategory) brandElements.push(formData.industryCategory);

  let styleKeywords = [];
  if (formData?.videoPurpose === '브랜드 인지도 강화') {
    styleKeywords = ['memorable', 'impactful', 'brand focused'];
  } else if (formData?.videoPurpose === '구매 전환') {
    styleKeywords = ['persuasive', 'product focused', 'call to action'];
  } else if (formData?.videoPurpose === '신제품 출시') {
    styleKeywords = ['innovative', 'new', 'exciting reveal'];
  }

  const totalDuration = parseInt(formData?.videoLength || 30, 10);
  let pacingKeywords = [];
  if (totalDuration <= 15) pacingKeywords = ['fast paced', 'quick cuts', 'dynamic'];
  else if (totalDuration <= 30) pacingKeywords = ['medium paced', 'smooth transitions'];
  else pacingKeywords = ['slow paced', 'cinematic', 'detailed'];

  // 중복 제거 후, 순차 누적해서 2000자 이하가 되도록 빌드
  const unique = (arr) => {
    const seen = new Set();
    return arr.filter((x) => {
      const k = x.toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const parts = unique([
    basePrompt,
    ...motionKeywords,
    ...brandElements,
    ...styleKeywords,
    ...pacingKeywords,
    `${formData?.videoLength || '30'}s commercial advertisement`,
    'no text overlay',
    'professional lighting',
    '1920x1080 resolution',
  ]);

  return joinUntil(parts, 1900); // 최종 클램프
}

/**
 * Join array with ", " until reaching maxLen
 */
function joinUntil(parts, maxLen) {
  const sep = ', ';
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const piece = String(parts[i]).trim();
    if (!piece) continue;
    const tryAdd = out ? out + sep + piece : piece;
    if (tryAdd.length > maxLen) break;
    out = tryAdd;
  }
  return out;
}

/**
 * Clamp raw prompt as last safety
 */
function clampPrompt(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  // 우선 쉼표 단위로 줄이고, 그래도 길면 하드컷
  const parts = text.split(',');
  let out = joinUntil(parts.map((s) => s.trim()), maxLen);
  if (out.length > maxLen) out = out.slice(0, maxLen);
  return out;
}

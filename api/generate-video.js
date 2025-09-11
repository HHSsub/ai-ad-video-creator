// Generate videos from selected images via Freepik Image-to-Video API
// Parallel dispatch with bounded concurrency, optional webhook, prompt clamp.

function clampPrompt(s, max) {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max - 20) + '...';
}

function buildVideoPrompt(image, formData) {
  const base = [
    image.title ? `Title: ${image.title}` : null,
    formData?.brandName ? `Brand: ${formData.brandName}` : null,
    formData?.industryCategory ? `Category: ${formData.industryCategory}` : null,
    'High-quality cinematic motion, gentle camera parallax, natural easing',
    'Keep subject identity consistent across frames; avoid distortions',
  ].filter(Boolean).join('. ');
  return base + '. ' + (image.prompt || '');
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      selectedStyle,
      selectedImages,
      formData,
      targetTotalDuration,
      concurrency = 3, // new: bounded parallelism
    } = req.body || {};

    if (!selectedStyle || !Array.isArray(selectedImages) || selectedImages.length === 0) {
      return res.status(400).json({ error: 'Selected style and images are required' });
    }

    const freepikApiKey =
      process.env.FREEPIK_API_KEY ||
      process.env.REACT_APP_FREEPIK_API_KEY ||
      process.env.VITE_FREEPIK_API_KEY;
    if (!freepikApiKey) throw new Error('Freepik API key not found');

    const webhookUrl = process.env.FREEPIK_WEBHOOK_URL || null; // optional

    // Freepik supports 6s or 10s only. We choose the lowest viable for throughput.
    const totalSeconds = parseInt(targetTotalDuration || formData?.videoLength || 30, 10);
    const imageCount = selectedImages.length;
    const desiredPerSegment = Math.max(2, Math.floor(totalSeconds / imageCount));
    const segmentDuration = desiredPerSegment >= 6 ? 10 : 6; // provider constraint

    console.log('[generate-video] 요청 수신', {
      style: selectedStyle,
      imageCount,
      targetDuration: totalSeconds,
      perSegmentDesired: desiredPerSegment,
      providerSegment: segmentDuration,
      brandName: formData?.brandName,
      concurrency,
      webhookUrl: !!webhookUrl,
    });

    const videoSegments = [];
    const failedSegments = [];

    const tasksInput = selectedImages.map((image, i) => ({ image, i }));

    await runPool(tasksInput, concurrency, async ({ image, i }) => {
      try {
        if (!image.url) throw new Error('Image URL is required for video generation');

        const videoPromptRaw = buildVideoPrompt(image, formData);
        const videoPrompt = clampPrompt(videoPromptRaw, 1900);

        console.log('[generate-video] 프롬프트 길이:', {
          scene: image.sceneNumber || i + 1,
          promptLength: videoPrompt.length,
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
              duration: segmentDuration, // 6 or 10 only
              webhook_url: webhookUrl,   // optional push
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

        videoSegments[i] = {
          segmentId: `segment-${i + 1}`,
          sceneNumber: image.sceneNumber || i + 1,
          originalImage: { url: image.url, title: image.title || null },
          taskId,
          videoUrl: null,
          status: 'in_progress',
          duration: segmentDuration,
          prompt: videoPrompt,
          createdAt: new Date().toISOString(),
        };
      } catch (err) {
        console.error(`[generate-video] 비디오 ${i + 1} 생성 실패:`, err.message);
        failedSegments[i] = {
          segmentId: `segment-${i + 1}`,
          sceneNumber: i + 1,
          originalImage: selectedImages[i],
          error: err.message,
          status: 'failed',
          duration: segmentDuration,
        };
      }
    });

    const okSegments = videoSegments.filter(Boolean);
    const actualTotalDuration = okSegments.reduce((sum, s) => sum + s.duration, 0);
    const projectId = `project-${Date.now()}`;

    // Return tasks; frontend should poll only the ones not yet ready
    const tasks = okSegments.map((s) => ({
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
        selectedStyle,
        totalSegments: selectedImages.length,
        successfulSegments: okSegments.length,
        failedSegments: failedSegments.filter(Boolean).length,
        requestedDuration: totalSeconds,
        actualDuration: actualTotalDuration,
        segmentDuration,
        status:
          okSegments.length === 0 ? 'failed' : 'in_progress',
        createdAt: new Date().toISOString(),
      },
      videoSegments: okSegments,
      failedSegments: failedSegments.filter(Boolean),
      tasks,
      durationInfo: {
        requested: totalSeconds,
        actual: actualTotalDuration,
        perSegmentProvider: segmentDuration,
        perSegmentDesired: desiredPerSegment,
        segments: selectedImages.length,
      },
      metadata: {
        webhookEnabled: !!webhookUrl,
        provider: 'freepik/minimax-hailuo-02-768p',
      },
    };

    console.log('[generate-video] 프로젝트 생성 완료', {
      projectId,
      총세그먼트: selectedImages.length,
      성공요청수: okSegments.length,
      실패요청수: failedSegments.filter(Boolean).length,
    });

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('[generate-video] 전체 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// api/generate-video.js - 여러 이미지 → Freepik image-to-video 생성 파이프라인
// 영상 비율(aspect_ratio) 및 로고/제품 이미지 플래그 전달 확장

import 'dotenv/config';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ======================= 영상 비율 매핑 함수 =======================
function mapUserAspectRatio(value) {
  if (!value) return 'widescreen_16_9';
  if (typeof value !== 'string') return 'widescreen_16_9';
  if (value.includes('16:9') || value.includes('가로')) return 'widescreen_16_9';
  if (value.includes('9:16') || value.includes('세로')) return 'vertical_9_16';
  if (value.includes('1:1') || value.includes('정사각')) return 'square_1_1';
  return 'widescreen_16_9';
}

// 텍스트 정규화
function clamp(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) : str;
}

// 간단 워커 풀
async function runPool(items, concurrency, worker) {
  const executing = new Set();
  const results = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => worker(item)).then(r => {
      executing.delete(p);
      return r;
    });
    executing.add(p);
    results.push(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// 프롬프트 구성 (간단)
function buildVideoPrompt(image, formData) {
  const base = image?.prompt || image?.title || 'commercial advertising scene dynamic';
  const brand = formData?.brandName ? `brand:${formData.brandName}` : '';
  const purpose = formData?.videoPurpose ? `purpose:${formData.videoPurpose}` : '';
  const ratio = formData?.videoAspectRatio ? `aspect:${formData.videoAspectRatio}` : '';
  const logoHint = formData?.brandLogoProvided ? 'logo integration planned (overlay non-destructive)' : '';
  const productHint = formData?.productImageProvided ? 'product presence continuity' : '';
  return [base, brand, purpose, ratio, logoHint, productHint]
    .filter(Boolean)
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { selectedStyle, selectedImages, formData, concurrency = 3 } = req.body || {};
    if (!selectedStyle || !Array.isArray(selectedImages) || selectedImages.length === 0) {
      return res.status(400).json({ error: 'Selected style and images are required' });
    }

    const apiKey =
      process.env.FREEPIK_API_KEY ||
      process.env.REACT_APP_FREEPIK_API_KEY ||
      process.env.VITE_FREEPIK_API_KEY;
    if (!apiKey) throw new Error('Freepik API key not found');

    // 플래그/비율 정규화
    formData.brandLogoProvided = !!(formData.brandLogoProvided || formData.brandLogo);
    formData.productImageProvided = !!(formData.productImageProvided || formData.productImage);
    const aspectRatioCode = mapUserAspectRatio(formData.videoAspectRatio);

    console.log('[generate-video] 시작:', {
      style: selectedStyle,
      images: selectedImages.length,
      videoAspectRatio: formData.videoAspectRatio,
      aspectRatioCode,
      brandLogoProvided: formData.brandLogoProvided,
      productImageProvided: formData.productImageProvided
    });

    // Freepik 제한: 6 또는 10초. 성능 위해 6초 사용 → 후처리로 컷 가능
    const providerDuration = 6;

    const inputs = selectedImages.map((image, i) => ({ image, i }));
    const segments = [];
    const failed = [];

    await runPool(inputs, concurrency, async ({ image, i }) => {
      try {
        if (!image.url) throw new Error('Image URL is required');
        const prompt = clamp(buildVideoPrompt(image, formData), 1900);

        const bodyPayload = {
          prompt,
          first_frame_image: image.url,
          duration: providerDuration,
          aspect_ratio: aspectRatioCode,
          webhook_url: null,
          prompt_optimizer: true
        };

        console.log(`[generate-video] 이미지 ${i + 1}/${selectedImages.length} 호출`, {
          promptPreview: prompt.slice(0, 110) + (prompt.length > 110 ? '...' : ''),
          aspect_ratio: aspectRatioCode
        });

        const r = await fetch('https://api.freepik.com/v1/ai/image-to-video/minimax-hailuo-02-768p', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-freepik-api-key': apiKey },
          body: JSON.stringify(bodyPayload)
        });

        if (!r.ok) {
          const t = await r.text(); 
          console.error('[generate-video] Freepik 오류', r.status, t.slice(0, 300));
          throw new Error(`Video API failed ${r.status}`);
        }
        const j = await r.json();
        const taskId = j?.data?.task_id;
        if (!taskId) throw new Error('no task_id');

        segments[i] = {
          segmentId: `segment-${i + 1}`,
          sceneNumber: image.sceneNumber || i + 1,
          originalImage: { url: image.url, title: image.title || null },
          taskId,
          videoUrl: null,
          status: 'in_progress',
          duration: providerDuration,
          prompt,
          aspectRatio: formData.videoAspectRatio || null,
          aspectRatioCode,
          brandLogoProvided: formData.brandLogoProvided,
          productImageProvided: formData.productImageProvided,
          createdAt: new Date().toISOString(),
        };
      } catch (e) {
        failed[i] = {
          segmentId: `segment-${i + 1}`,
          sceneNumber: i + 1,
          originalImage: selectedImages[i],
          error: e.message,
          status: 'failed',
          duration: providerDuration,
          aspectRatio: formData.videoAspectRatio || null,
          aspectRatioCode
        };
      }
    });

    const ok = segments.filter(Boolean);
    const tasks = ok.map(s => ({
      taskId: s.taskId, 
      sceneNumber: s.sceneNumber, 
      duration: s.duration, 
      title: s.originalImage?.title || `Segment ${s.sceneNumber}`,
      aspectRatio: s.aspectRatio,
      aspectRatioCode: s.aspectRatioCode
    }));

    res.status(200).json({
      success: true,
      videoProject: {
        projectId: `project-${Date.now()}`,
        selectedStyle,
        aspectRatio: formData.videoAspectRatio || null,
        aspectRatioCode,
        brandLogoProvided: formData.brandLogoProvided,
        productImageProvided: formData.productImageProvided,
        totalRequested: selectedImages.length,
        segments: ok,
        failed: failed.filter(Boolean),
        createdAt: new Date().toISOString()
      },
      tasks,
      meta: {
        provider: 'Freepik image-to-video minimax-hailuo-02',
        durationPerSegment: providerDuration,
        concurrency,
        totalSubmitted: ok.length,
        failed: failed.filter(Boolean).length
      }
    });

  } catch (error) {
    console.error('[generate-video] 전체 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

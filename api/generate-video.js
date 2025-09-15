// api/generate-video.js - Freepik Kling v2.1 Pro 공식문서 기반 완전수정
// 기존 모든 minimax-hailuo-768p, kling-1024p 흔적 완전 제거. 엔드포인트/파라미터 100% 공식문서 일치.

import 'dotenv/config';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const CAMERA_BRAND_REGEX = /\b(Canon|Nikon|Sony|Fujifilm|Fuji|Panasonic|Leica|Hasselblad|EOS|Alpha|Lumix|R5|R6|Z6|A7R|A7S|GFX)\b/gi;

function sanitizeCamera(text='') {
  let t = text.replace(CAMERA_BRAND_REGEX,'professional');
  if (/^camera:/i.test(t.trim())) {
    t = t.trim().replace(/^camera:\s*/i,'');
    t += ' (technical: professional focal length framing)';
  }
  t = t.replace(/Camera:\s*/g,'');
  return t;
}

function clamp(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) : str;
}

function buildVideoPrompt(image, formData) {
  const raw = image?.prompt || image?.title || 'commercial advertising scene';
  const sanitized = sanitizeCamera(raw).replace(/\s+/g,' ').trim();

  const headParts = [
    formData?.brandName ? `Brand:${formData.brandName}` : null,
    formData?.productServiceName ? `Product:${formData.productServiceName}` :
      formData?.productServiceCategory ? `ProductCat:${formData.productServiceCategory}` : null,
    formData?.coreTarget ? `Target:${formData.coreTarget}` : null,
    formData?.videoPurpose ? `Purpose:${formData.videoPurpose}` : null,
    formData?.coreDifferentiation ? `Diff:${formData.coreDifferentiation}` : null
  ].filter(Boolean);

  let head = headParts.join(', ');
  if (!head) head = 'BrandScenario';

  // 중복 체크(브랜드명 이미 포함시 head 일부 축소 가능)
  const brandRe = formData?.brandName ? new RegExp(formData.brandName,'i') : null;
  let main = brandRe && brandRe.test(sanitized) ? sanitized : `${head}. ${sanitized}`;
  if (main.length < 60) {
    main += ' high quality narrative, natural product usage visible.';
  }
  return clamp(main, 1900);
}

async function runPool(items, concurrency, worker) {
  const executing = new Set();
  const results = [];
  for (const item of items) {
    const p = Promise.resolve().then(()=>worker(item)).then(r=>{
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

export default async function handler(req,res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  try {
    const { selectedStyle, selectedImages, formData, concurrency = 3 } = req.body || {};
    if (!selectedStyle || !Array.isArray(selectedImages) || selectedImages.length === 0) {
      return res.status(400).json({ error:'Selected style and images are required' });
    }

    const apiKey =
      process.env.FREEPIK_API_KEY ||
      process.env.REACT_APP_FREEPIK_API_KEY ||
      process.env.VITE_FREEPIK_API_KEY;
    if (!apiKey) throw new Error('Freepik API key not found');

    formData.brandLogoProvided = !!(formData.brandLogoProvided || formData.brandLogo);
    formData.productImageProvided = !!(formData.productImageProvided || formData.productImage);

    console.log('[generate-video] 시작:', {
      style: selectedStyle,
      imageCount: selectedImages.length,
      brandLogoProvided: formData.brandLogoProvided,
      productImageProvided: formData.productImageProvided
    });

    const providerDuration = 5; // Kling 공식 기본값
    const inputs = selectedImages.map((image,i)=>({ image,i }));
    const segments = [];
    const failed = [];

    await runPool(inputs, concurrency, async ({ image, i }) => {
      try {
        if (!image.url) throw new Error('Image URL is required');
        const prompt = buildVideoPrompt(image, formData);

        // Kling v2.1 Pro 공식문서 기반 파라미터
        const payload = {
          webhook_url: null,
          image: image.url,
          prompt: prompt,
          negative_prompt: 'blurry, low quality, watermark, cartoon, distorted',
          duration: providerDuration,
        };

        // undefined/null/빈 배열 자동 제거
        Object.keys(payload).forEach(key => {
          if (
            payload[key] === undefined ||
            payload[key] === null ||
            (Array.isArray(payload[key]) && payload[key].length === 0)
          ) {
            delete payload[key];
          }
        });

        console.log(`[generate-video] POST ${i+1}/${selectedImages.length}`, {
          endpoint: 'https://api.freepik.com/v1/ai/image-to-video/kling-v2-1-pro',
          promptPreview: prompt.slice(0,120)+(prompt.length>120?'...':'')
        });

        const r = await fetch('https://api.freepik.com/v1/ai/image-to-video/kling-v2-1-pro',{
          method:'POST',
          headers:{ 'Content-Type':'application/json','x-freepik-api-key':apiKey },
          body: JSON.stringify(payload)
        });
        if (!r.ok) {
          const t = await r.text();
          console.error('[generate-video] Freepik 오류', r.status, t.slice(0,200));
          throw new Error(`Video API failed ${r.status}`);
        }
        const j = await r.json();
        const taskId = j?.data?.task_id;
        if (!taskId) throw new Error('no task_id');
        segments[i] = {
          segmentId: `segment-${i+1}`,
          sceneNumber: image.sceneNumber || i+1,
          originalImage: { url: image.url, title: image.title || null },
          taskId,
          videoUrl: null,
          status: 'in_progress',
          duration: providerDuration,
          prompt,
          brandLogoProvided: formData.brandLogoProvided,
          productImageProvided: formData.productImageProvided,
          createdAt: new Date().toISOString()
        };
      } catch (e) {
        failed[i] = {
          segmentId: `segment-${i+1}`,
          sceneNumber: i+1,
          originalImage: selectedImages[i],
          error: e.message,
          status: 'failed',
          duration: providerDuration
        };
      }
    });

    const ok = segments.filter(Boolean);
    const tasks = ok.map(s => ({
      taskId: s.taskId,
      sceneNumber: s.sceneNumber,
      duration: s.duration,
      title: s.originalImage?.title || `Segment ${s.sceneNumber}`
    }));

    res.status(200).json({
      success:true,
      videoProject:{
        projectId: `project-${Date.now()}`,
        selectedStyle,
        brandLogoProvided: formData.brandLogoProvided,
        productImageProvided: formData.productImageProvided,
        totalRequested: selectedImages.length,
        segments: ok,
        failed: failed.filter(Boolean),
        createdAt: new Date().toISOString()
      },
      tasks,
      meta:{
        provider:'Freepik image-to-video kling-v2-1-pro',
        durationPerSegment: providerDuration,
        concurrency,
        totalSubmitted: ok.length,
        failed: failed.filter(Boolean).length
      }
    });

  } catch (error) {
    console.error('[generate-video] 전체 오류:', error);
    res.status(500).json({
      success:false,
      error: error.message
    });
  }
}

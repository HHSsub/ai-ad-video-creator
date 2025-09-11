function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-freepik-api-key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// 스타일 프로필(너가 storyboard.js에 정의해둔 것과 동일/확장)
const styleProfiles = {
  'Cinematic Professional': {
    artDirection: [
      'cinematic, anamorphic bokeh, dramatic rim lighting, deep contrast, film grain',
      'teal and orange color grading, shallow depth of field, volumetric haze',
      'high dynamic range, professional post-production color grading'
    ],
    composition: 'classic rule of thirds or centered hero framing, subtle camera vignetting',
    lighting: 'directional key light with soft fill, motivated practicals, edge lighting',
    palette: 'teal and orange with neutral skin tones',
    negative: 'avoid flat lighting, avoid overexposed highlights, avoid washed-out colors'
  },
  'Modern Minimalist': {
    artDirection: [
      'ultra-clean studio background, generous negative space, minimal props',
      'high-key lighting, soft shadows, monochrome accents, crisp edges',
      'product-centric layout, immaculate surfaces'
    ],
    composition: 'symmetrical or grid-based composition with balanced spacing',
    lighting: 'softbox high-key, even diffusion, gentle falloff',
    palette: 'white, light gray, subtle brand accent colors',
    negative: 'avoid clutter, avoid textures, avoid busy backgrounds'
  },
  'Vibrant Dynamic': {
    artDirection: [
      'hyper-saturated color scheme, bold graphic accents, dynamic diagonal lines',
      'motion streaks implied, dutch tilt, punchy contrast, energetic vibe',
      'neon accents and pop color blocking'
    ],
    composition: 'aggressive angles, off-center subject, sense of momentum',
    lighting: 'hard specular highlights, colored gels, rim kicks',
    palette: 'neon magenta, cyber cyan, electric blue, punchy yellow',
    negative: 'avoid pastel looks, avoid muted tones, avoid flat composition'
  },
  'Natural Lifestyle': {
    artDirection: [
      'authentic documentary feel, candid moment, environmental context',
      'natural textures, real-world imperfections, warm earthy vibe',
      'subtle depth and foreground occlusion'
    ],
    composition: 'over-the-shoulder or candid 35mm look, gentle perspective',
    lighting: 'window daylight, soft ambient bounce, golden hour when applicable',
    palette: 'warm earthy tones, soft greens, natural skin tones',
    negative: 'avoid studio backdrop, avoid hard specular highlights, avoid heavy grading'
  },
  'Premium Luxury': {
    artDirection: [
      'luxurious materials, pristine reflections, immaculate finishes',
      'black and gold palette, subtle vignette, refined elegance',
      'premium editorial photography aesthetics'
    ],
    composition: 'elegant minimal framing with premium negative space',
    lighting: 'soft glow, controlled highlights, layered reflections',
    palette: 'champagne gold, onyx black, ivory',
    negative: 'avoid plastic feel, avoid fingerprints or smudges, avoid noisy grain'
  },
  'Tech Innovation': {
    artDirection: [
      'futuristic UI holograms, sleek modern surfaces, glass and chrome',
      'edge lighting, procedural patterns, cyber aesthetic, depth fog',
      'high-tech, clean and precise'
    ],
    composition: 'central hero with interface overlays, layered depth',
    lighting: 'cool blue edge lights, subtle neon accents, controlled contrast',
    palette: 'cool blue, cyan, silver, graphite',
    negative: 'avoid warm vintage tones, avoid rustic textures, avoid organic clutter'
  }
};

function enhancePrompt(basePrompt, styleName, styleDescription) {
  const p = styleProfiles[styleName];
  if (!p) return `${basePrompt}, ${styleDescription}`;
  const ad = p.artDirection.join(', ');
  return [
    `${basePrompt}, ${styleDescription}`,
    `Art direction: ${ad}.`,
    `Composition: ${p.composition}.`,
    `Lighting: ${p.lighting}.`,
    `Color palette: ${p.palette}.`,
    `Avoid: ${p.negative}.`,
    'commercial advertising photo, 4K, ultra-detailed, sharp focus, professional grade'
  ].join(' ');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // styleName 또는 style.name 둘 다 허용
    const { prompt, styleName: rawStyleName, style, sceneNumber, title } = req.body || {};
    const styleName = rawStyleName || style?.name;

    if (!prompt || !styleName) {
      return res.status(400).json({ error: 'prompt and styleName are required' });
    }

    const freepikApiKey = process.env.FREEPIK_API_KEY || process.env.REACT_APP_FREEPIK_API_KEY || process.env.VITE_FREEPIK_API_KEY;
    if (!freepikApiKey) throw new Error('Freepik API key not found');

    const styles = [
      { name: 'Cinematic Professional', description: 'cinematic professional shot dramatic lighting high detail 8k corporate' },
      { name: 'Modern Minimalist',      description: 'minimalist modern clean background simple composition contemporary'   },
      { name: 'Vibrant Dynamic',        description: 'vibrant energetic dynamic motion bright colors active lifestyle'     },
      { name: 'Natural Lifestyle',      description: 'natural lifestyle photorealistic everyday life authentic people'     },
      { name: 'Premium Luxury',         description: 'luxury premium elegant sophisticated high-end exclusive'             },
      { name: 'Tech Innovation',        description: 'technology innovation futuristic digital modern tech startup'        }
    ];
    const styleDef = styles.find(s => s.name === styleName);
    if (!styleDef) return res.status(400).json({ error: `Unknown styleName: ${styleName}` });

    // 핵심: 스타일 개성 주입
    const finalPromptRaw = enhancePrompt(prompt, styleName, styleDef.description);

    const imageResult = await generateSingleImageWithFreepik(finalPromptRaw, freepikApiKey);
    if (!imageResult.success) return res.status(502).json({ success: false, error: imageResult.error });

    res.status(200).json({
      success: true,
      url: imageResult.url,
      style: styleName,
      sceneNumber: sceneNumber ?? null,
      title: title ?? null,
      prompt: finalPromptRaw
    });
  } catch (error) {
    console.error('storyboard-render-image 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function generateSingleImageWithFreepik(prompt, apiKey) {
  try {
    // 의미 있는 구두점 보존
    const cleanPrompt = prompt
      .replace(/[^\w\s가-힣,.\-:;()]/g, '')
      .replace(/\s+/g, ' ')
      .substring(0, 800)
      .trim();

    if (cleanPrompt.length < 20) throw new Error('프롬프트가 너무 짧습니다.');
    console.log(`Freepik 이미지 생성 요청: ${cleanPrompt.substring(0, 120)}...`);

    const response = await fetch('https://api.freepik.com/v1/ai/text-to-image/flux-dev', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-freepik-api-key': apiKey
      },
      body: JSON.stringify({
        prompt: cleanPrompt,
        num_images: 1,
        aspect_ratio: 'widescreen_16_9'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Freepik API 실패 (${response.status}):`, errorText);
      throw new Error(`Freepik API 실패: ${response.status}`);
    }

    const result = await response.json();
    console.log('Freepik API 응답:', result);

    if (result.data && result.data.task_id) {
      const url = await pollForImageResultOptimized(result.data.task_id, apiKey);
      if (url) return { success: true, url, taskId: result.data.task_id };
    }

    throw new Error('이미지 생성 실패: 유효한 결과를 받지 못함');

  } catch (error) {
    console.error('Freepik 이미지 생성 오류:', error);
    return { success: false, error: error.message };
  }
}

async function pollForImageResultOptimized(taskId, apiKey) {
  const maxAttempts = 10;
  const interval = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(`폴링 시도 ${attempt + 1}/${maxAttempts}: ${taskId}`);

      const response = await fetch(`https://api.freepik.com/v1/ai/text-to-image/flux-dev/${taskId}`, {
        method: 'GET',
        headers: {
          'x-freepik-api-key': apiKey,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`폴링 실패 (${response.status}):`, await response.text());
        if (response.status === 500) {
          await new Promise(r => setTimeout(r, interval * 2));
          continue;
        }
        throw new Error(`Status check failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`폴링 결과 ${attempt + 1}:`, result.data?.status);

      if (result.data && result.data.status === 'COMPLETED') {
        const generated = Array.isArray(result.data.generated) ? result.data.generated[0] : null;
        if (generated && typeof generated === 'string') return generated;
        await new Promise(r => setTimeout(r, 2000));
        continue;
      } else if (result.data && result.data.status === 'FAILED') {
        throw new Error('Image generation failed');
      }

      await new Promise(r => setTimeout(r, interval));

    } catch (error) {
      console.error(`폴링 시도 ${attempt + 1} 실패:`, error.message);
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, interval));
        continue;
      }
      throw error;
    }
  }
  throw new Error('이미지 생성 타임아웃 - 50초 초과');
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-freepik-api-key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 스타일 이름은 styleName 또는 style.name 어느 쪽이든 허용 (호환성 보강)
    const { prompt, styleName: rawStyleName, style, sceneNumber, title } = req.body || {};
    const styleName = rawStyleName || style?.name;

    if (!prompt || !styleName) {
      return res.status(400).json({ error: 'prompt and styleName are required' });
    }

    const freepikApiKey = process.env.FREEPIK_API_KEY || process.env.REACT_APP_FREEPIK_API_KEY || process.env.VITE_FREEPIK_API_KEY;
    if (!freepikApiKey) throw new Error('Freepik API key not found');

    // 원본 styles 설명 동일
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

    const finalPrompt = `${prompt}, ${styleDef.description}`;
    const imageResult = await generateSingleImageWithFreepik(finalPrompt, freepikApiKey);
    if (!imageResult.success) return res.status(502).json({ success: false, error: imageResult.error });

    res.status(200).json({
      success: true,
      url: imageResult.url,
      style: styleName,
      sceneNumber: sceneNumber ?? null,
      title: title ?? null
    });
  } catch (error) {
    console.error('storyboard-render-image 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function generateSingleImageWithFreepik(prompt, apiKey) {
  try {
    const cleanPrompt = prompt
      .replace(/[^\w\s가-힣,.\-:;()]/g, '') // 약간 완화: 기본 문장부호 유지
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

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const t0 = Date.now();
  try {
    const { prompt, sceneNumber, title } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
      console.error('[render-image] 잘못된 prompt 입력:', prompt?.length || 0);
      return res.status(400).json({ error: 'prompt is required (>=10 chars)' });
    }

    const apiKey =
      process.env.FREEPIK_API_KEY ||
      process.env.REACT_APP_FREEPIK_API_KEY ||
      process.env.VITE_FREEPIK_API_KEY;
    if (!apiKey) throw new Error('Freepik API key not found');

    console.log(`[render-image] 요청 수신: scene=${sceneNumber ?? '-'} title="${title ?? ''}" promptLen=${prompt.length}`);

    // 프롬프트 “그대로” 전달 (주입/변형 금지)
    const r = await fetch('https://api.freepik.com/v1/ai/text-to-image/minimax-hailuo-02-1024p', {
      method: 'POST',
      headers: {
        'x-freepik-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      console.error(`[render-image] Freepik 실패: ${r.status} ${text}`);
      return res.status(r.status).json({ error: text || `Freepik image error ${r.status}` });
    }

    const json = await r.json();
    const url = Array.isArray(json?.data?.result) && json.data.result[0]?.url ? json.data.result[0].url : null;

    if (!url) {
      console.error('[render-image] Freepik 응답에 URL 없음');
      return res.status(502).json({ error: 'No image URL returned' });
    }

    console.log(`[render-image] 성공: scene=${sceneNumber ?? '-'} (${Date.now() - t0}ms) url=${url}`);

    res.status(200).json({
      success: true,
      url,
      meta: { sceneNumber, title },
    });
  } catch (e) {
    console.error('[render-image] 오류:', e);
    res.status(500).json({ error: e.message });
  }
}

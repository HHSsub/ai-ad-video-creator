import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const t0 = Date.now();
  try {
    const { prompt, sceneNumber, conceptId, style } = req.body || {};
    if (!prompt || prompt.length<15) return res.status(400).json({error:'prompt too short'});
    const apiKey = process.env.FREEPIK_API_KEY ||
                   process.env.VITE_FREEPIK_API_KEY ||
                   process.env.REACT_APP_FREEPIK_API_KEY;
    if (!apiKey) throw new Error('FREEPIK_API_KEY missing');

    // Freepik Text-to-Image
    const body = {
      prompt,
      negative_prompt: 'blurry, distorted, low quality, watermark, text, logo',
      guidance_scale: 7,
      seed: Math.floor(Math.random()*1000000),
      num_images: 1,
      image: { size: 'square_1_1' },
      filter_nsfw: true
    };

    console.log(`[render-image] concept=${conceptId} scene=${sceneNumber} 요청 (len=${prompt.length})`);

    const r = await fetch('https://api.freepik.com/v1/ai/text-to-image', {
      method: 'POST',
      headers: {
        'x-freepik-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      console.error(`[render-image] 실패 status=${r.status} body=${txt.slice(0,300)}`);
      return res.status(r.status).json({error: txt || `freepik error ${r.status}`});
    }

    const json = await r.json();
    const b64 = json?.data?.[0]?.base64;
    if (!b64) {
      return res.status(502).json({error:'No base64 image in response'});
    }

    const buf = Buffer.from(b64, 'base64');
    const tmpDir = process.env.VIDEO_TMP_DIR || path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const fileName = `img_${conceptId}_${sceneNumber}_${crypto.randomBytes(6).toString('hex')}.png`;
    const filePath = path.join(tmpDir, fileName);
    fs.writeFileSync(filePath, buf);
    // 단순 로컬 경로; 실제 배포에서는 CDN/S3 업로드 권장
    const publicUrl = `/tmp/${fileName}`; // static 서빙 설정 필요 (예: express.static)

    console.log(`[render-image] 완료 concept=${conceptId} scene=${sceneNumber} (${Date.now()-t0}ms)`);

    res.status(200).json({
      success:true,
      url: publicUrl,
      meta:{ conceptId, sceneNumber, style }
    });
  } catch(e) {
    console.error('[render-image] 오류:', e);
    res.status(500).json({error:e.message});
  }
}

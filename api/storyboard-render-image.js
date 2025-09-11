import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  try{
    const { prompt, sceneNumber, conceptId } = req.body||{};
    if(!prompt) return res.status(400).json({error:'prompt required'});

    const apiKey = process.env.FREEPIK_API_KEY ||
                   process.env.VITE_FREEPIK_API_KEY ||
                   process.env.REACT_APP_FREEPIK_API_KEY;
    if(!apiKey) throw new Error('FREEPIK_API_KEY 누락');

    const body = {
      prompt,
      negative_prompt: 'blurry, distorted, low quality, watermark, text, logo',
      guidance_scale: 7,
      seed: Math.floor(Math.random()*1e6),
      num_images:1,
      image:{ size:'square_1_1' },
      filter_nsfw:true
    };

    const r = await fetch('https://api.freepik.com/v1/ai/text-to-image',{
      method:'POST',
      headers:{
        'x-freepik-api-key': apiKey,
        'Content-Type':'application/json'
      },
      body: JSON.stringify(body)
    });
    if(!r.ok){
      const txt=await r.text().catch(()=> '');
      return res.status(r.status).json({error:txt||`freepik error ${r.status}`});
    }
    const j=await r.json();
    const b64=j?.data?.[0]?.base64;
    if(!b64) return res.status(502).json({error:'no base64 in response'});

    const buf = Buffer.from(b64,'base64');
    const outDir = path.resolve(process.cwd(),'tmp','images');
    fs.mkdirSync(outDir,{recursive:true});
    const file = `img_${conceptId}_${sceneNumber}_${crypto.randomBytes(5).toString('hex')}.png`;
    fs.writeFileSync(path.join(outDir,file), buf);
    const url = `/tmp/images/${file}`; // 정적 서빙 설정 필요

    res.status(200).json({success:true,url});
  }catch(e){
    console.error('[render-image] 오류', e);
    res.status(500).json({error:e.message});
  }
}

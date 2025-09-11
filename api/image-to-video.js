export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  try{
    const { imageUrl, prompt, duration=2, sceneNumber, conceptId, title } = req.body||{};
    if(!imageUrl) return res.status(400).json({error:'imageUrl required'});

    const apiKey = process.env.FREEPIK_API_KEY || process.env.VITE_FREEPIK_API_KEY;
    if(!apiKey) throw new Error('FREEPIK_API_KEY 누락');

    const endpoint = 'https://api.freepik.com/v1/ai/image-to-video/minimax-hailuo-02-768p';

    const body = {
      prompt: (prompt||'High quality cinematic scene').slice(0,500),
      prompt_optimizer: true,
      first_frame_image: imageUrl,
      last_frame_image: imageUrl,
      duration
    };

    const r = await fetch(endpoint,{
      method:'POST',
      headers:{
        'x-freepik-api-key': apiKey,
        'Content-Type':'application/json'
      },
      body: JSON.stringify(body)
    });
    if(!r.ok){
      const txt=await r.text().catch(()=> '');
      return res.status(r.status).json({error:txt||`freepik video error ${r.status}`});
    }
    const j=await r.json();
    const taskId=j?.data?.task_id;
    if(!taskId) return res.status(502).json({error:'task_id missing'});
    res.status(200).json({success:true,taskId,sceneNumber,conceptId,title,duration});
  }catch(e){
    console.error('[image-to-video] 오류', e);
    res.status(500).json({error:e.message});
  }
}

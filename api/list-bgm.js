export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='GET') return res.status(405).json({error:'Method not allowed'});

  // 실제로는 CDN/S3 경로
  const bgms = [
    { id:'bgm1', name:'Energetic Upbeat', url:'/assets/bgm/energetic.mp3' },
    { id:'bgm2', name:'Soft Ambient', url:'/assets/bgm/ambient.mp3' },
    { id:'bgm3', name:'Driving Tech', url:'/assets/bgm/tech.mp3' }
  ];

  res.status(200).json({ success:true, bgms });
}

// 기존 로직 + jsonMode 지원 (jsonMode=true 이면 파일을 저장 후 URL 반환)
// 바이너리 직접 응답 방식도 유지
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

async function download(url, filePath){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`download failed ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(filePath, buf);
}

function runFFmpeg(args,label='ffmpeg'){
  return new Promise((resolve,reject)=>{
    const p = spawn('ffmpeg', args, {stdio:'inherit'});
    p.on('exit', code=>{
      if(code===0) resolve();
      else reject(new Error(`${label} exit ${code}`));
    });
  });
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  try{
    // next.js / node 환경 양쪽 호환
    let body;
    if(req.body) body = req.body;
    else if(typeof req.json === 'function') body = await req.json();
    else body = {};
    const {
      segments,
      clipDurationSec=2,
      fps=30,
      scale='1920:1080',
      jsonMode=false
    } = body;

    if(!Array.isArray(segments)||!segments.length)
      return res.status(400).json({error:'segments[] required'});

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(),'compile-'));
    const cuts=[];
    let idx=0;
    for(const s of segments){
      if(!s?.videoUrl) continue;
      idx++;
      const src = path.join(tmpDir, `src_${idx}.mp4`);
      const cut = path.join(tmpDir, `cut_${idx}.mp4`);
      await download(s.videoUrl, src);
      await runFFmpeg(['-y','-i',src,'-t',String(clipDurationSec),'-r',String(fps),'-vf',`scale=${scale}`,'-an',cut],`trim-${idx}`);
      cuts.push(cut);
    }
    if(!cuts.length) throw new Error('다운로드된 클립 없음');

    const listFile = path.join(tmpDir,'list.txt');
    fs.writeFileSync(listFile, cuts.map(f=>`file '${f.replace(/'/g,"'\\''")}'`).join('\n'));
    const outFile = path.join(tmpDir,'out.mp4');
    await runFFmpeg(['-y','-f','concat','-safe','0','-i',listFile,'-c','copy', outFile],'concat');

    if(jsonMode){
      // outFile 을 프로젝트 내 임시 public 경로로 이동
      const exportDir = path.resolve(process.cwd(),'tmp','compiled');
      fs.mkdirSync(exportDir,{recursive:true});
      const fileName = `compiled_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
      const finalPath = path.join(exportDir,fileName);
      fs.copyFileSync(outFile, finalPath);
      const publicUrl = `/tmp/compiled/${fileName}`;
      return res.status(200).json({
        success:true,
        compiledVideoUrl: publicUrl,
        segmentsCount: cuts.length
      });
    }

    // 바이너리 직접 반환 (기존 방식 유지)
    const buf = fs.readFileSync(outFile);
    res.setHeader('Content-Type','video/mp4');
    res.setHeader('Content-Length', String(buf.length));
    res.status(200).send(buf);

  }catch(e){
    console.error('[compile-videos] error', e);
    if(!res.headersSent){
      res.status(500).json({success:false,error:e.message});
    }
  }
}

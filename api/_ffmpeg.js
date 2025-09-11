import { spawn } from 'child_process';
import fs from 'fs';

export function runFFmpeg(args, logLabel='ffmpeg') {
  return new Promise((resolve, reject)=>{
    const bin = process.env.FFMPEG_PATH || 'ffmpeg';
    const proc = spawn(bin, args);
    let stderr='';
    proc.stderr.on('data', d=> { stderr += d.toString(); });
    proc.on('exit', code=>{
      if (code===0) resolve({ok:true, stderr});
      else reject(new Error(`${logLabel} failed code=${code} ${stderr.slice(0,400)}`));
    });
  });
}

export async function concatVideos(videoFiles, outFile) {
  // Create concat list file
  const listContent = videoFiles.map(f=>`file '${f.replace(/'/g,"'\\''")}'`).join('\n');
  const listPath = outFile + '.txt';
  fs.writeFileSync(listPath, listContent);
  await runFFmpeg([
    '-y',
    '-f','concat',
    '-safe','0',
    '-i', listPath,
    '-c','copy',
    outFile
  ], 'concat');
  fs.unlinkSync(listPath);
}

export async function muxBgm(videoFile, audioFile, outFile, {fadeIn=1, fadeOut=1, volume=0.9, bgmVolume=0.4} = {}) {
  await runFFmpeg([
    '-y',
    '-i', videoFile,
    '-i', audioFile,
    '-filter_complex',
    `[1:a]volume=${bgmVolume},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=0:d=${fadeOut}[bgm];` +
    `[0:a]volume=${volume}[vocal];` +
    `[vocal][bgm]amix=inputs=2:dropout_transition=2:normalize=0[aout]`,
    '-map','0:v:0',
    '-map','[aout]',
    '-c:v','copy',
    '-c:a','aac',
    '-shortest',
    outFile
  ], 'mux');
}

import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

// 단일 FFmpeg 인스턴스
let ffmpeg;
export async function ensureFFmpeg() {
  if (!ffmpeg) {
    ffmpeg = createFFmpeg({ log: true, corePath: undefined }); // 기본 CDN
  }
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }
  return ffmpeg;
}

// 이미지 시퀀스를 mp4로 렌더 (각 이미지 duration 초 유지)
// images: [{ url, duration, sceneNumber }]
export async function renderSlideshowMp4(styleKey, images, { width = 1280, height = 720, fps = 30 } = {}) {
  const ff = await ensureFFmpeg();

  // 이미지 다운로드 및 파일쓰기
  const inputs = [];
  for (let i = 0; i < images.length; i++) {
    const resp = await fetch(images[i].url);
    const buf = await resp.arrayBuffer();
    const name = `img_${String(i).padStart(3, '0')}.jpg`;
    ff.FS('writeFile', name, new Uint8Array(buf));
    inputs.push({ name, duration: images[i].duration || 2 });
  }

  // concat용 파일리스트 생성
  // 각 이미지를 duration만큼 loop 하도록 -loop 1 -t <dur>로 개별 영상으로 만들고 나중에 concat
  const parts = [];
  for (let i = 0; i < inputs.length; i++) {
    const img = inputs[i];
    const partName = `part_${String(i).padStart(3, '0')}.mp4`;
    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;
    await ff.run(
      '-loop', '1',
      '-framerate', String(fps),
      '-t', String(img.duration),
      '-i', img.name,
      '-vf', vf,
      '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-level', '4.1',
      '-movflags', '+faststart',
      '-y', partName
    );
    parts.push(partName);
  }

  // concat 파일 생성
  const listTxt = parts.map(p => `file '${p}'`).join('\n');
  ff.FS('writeFile', 'list.txt', new TextEncoder().encode(listTxt));
  const outName = `${styleKey.replace(/\s+/g, '_')}.mp4`;
  await ff.run(
    '-f', 'concat', '-safe', '0',
    '-i', 'list.txt',
    '-c', 'copy',
    '-movflags', '+faststart',
    '-y', outName
  );

  const data = ff.FS('readFile', outName);
  // 클린업(선택)
  try { ff.FS('unlink', 'list.txt'); } catch {}
  for (const f of parts) { try { ff.FS('unlink', f); } catch {} }
  for (const img of inputs) { try { ff.FS('unlink', img.name); } catch {} }

  return new Blob([data.buffer], { type: 'video/mp4' });
}

// 여러 mp4를 순차 병합
export async function mergeMp4Sequential(files) {
  const ff = await ensureFFmpeg();
  const listLines = [];

  for (let i = 0; i < files.length; i++) {
    const buf = await files[i].arrayBuffer();
    const name = `v${i}.mp4`;
    ff.FS('writeFile', name, new Uint8Array(buf));
    listLines.push(`file '${name}'`);
  }
  ff.FS('writeFile', 'merge.txt', new TextEncoder().encode(listLines.join('\n')));
  const outName = 'merged.mp4';
  await ff.run(
    '-f', 'concat', '-safe', '0',
    '-i', 'merge.txt',
    '-c', 'copy',
    '-movflags', '+faststart',
    '-y', outName
  );
  const data = ff.FS('readFile', outName);
  try { ff.FS('unlink', 'merge.txt'); } catch {}
  for (let i = 0; i < files.length; i++) { try { ff.FS('unlink', `v${i}.mp4`); } catch {} }
  try { ff.FS('unlink', outName); } catch {}
  return new Blob([data.buffer], { type: 'video/mp4' });
}

// mp4에 BGM(오디오) 입히기
export async function muxBgm(videoBlob, bgmUrl, { volume = 0.6, loop = true } = {}) {
  const ff = await ensureFFmpeg();
  const vBuf = await videoBlob.arrayBuffer();
  ff.FS('writeFile', 'input.mp4', new Uint8Array(vBuf));

  const aResp = await fetch(bgmUrl);
  const aBuf = await aResp.arrayBuffer();
  ff.FS('writeFile', 'bgm.mp3', new Uint8Array(aBuf));

  // 루프 처리: -stream_loop -1 (무한) + -shortest로 비디오 길이에 맞춤
  const out = 'output_bgm.mp4';
  const loopArgs = loop ? ['-stream_loop', '-1'] : [];
  await ff.run(
    '-i', 'input.mp4',
    ...loopArgs, '-i', 'bgm.mp3',
    '-filter_complex', `volume=${volume}`,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac',
    '-shortest',
    '-movflags', '+faststart',
    '-y', out
  );

  const data = ff.FS('readFile', out);
  try { ff.FS('unlink', 'input.mp4'); } catch {}
  try { ff.FS('unlink', 'bgm.mp3'); } catch {}
  try { ff.FS('unlink', out); } catch {}

  return new Blob([data.buffer], { type: 'video/mp4' });
}

import { useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function imagesTotalFromStyles(styles) {
  return (styles||[]).reduce((acc,s)=> acc + (s.imagePrompts?.length||0), 0);
}

async function runConcurrent(tasks, limit, onProgress) {
  let i=0, done=0;
  const results = new Array(tasks.length);
  const workers = new Array(Math.min(limit, tasks.length)).fill(0).map(async ()=>{
    while(true){
      const cur=i++;
      if (cur>=tasks.length) break;
      try {
        results[cur] = await tasks[cur]();
      } catch(e) {
        results[cur] = {error: e.message};
      } finally {
        done++;
        onProgress?.(done, tasks.length);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// ★ Z+ : aspect ratio → Freepik size 매핑 (imagePrompt 기본 보강용)
function mapAspectRatioToSize(ar){
  if(!ar) return 'widescreen_16_9';
  const norm = String(ar).replace(/\s+/g,'').toLowerCase();
  if(['16:9','widescreen','landscape'].includes(norm)) return 'widescreen_16_9';
  if(['9:16','vertical','portrait'].includes(norm)) return 'vertical_9_16';
  if(['1:1','square'].includes(norm)) return 'square_1_1';
  if(['4:5','4:5portrait'].includes(norm)) return 'portrait_4_5';
  return 'widescreen_16_9';
}

// ★ Z+ : imagePrompt 확장(원본 prompt 불변, 추가 필드만)
function enrichImagePrompt(basePromptObj, formData){
  const clone = { ...basePromptObj };
  // 원래 없으면 추가 (기존 있으면 그대로 유지)
  if(!clone.negative_prompt){
    clone.negative_prompt = 'blurry, low quality, watermark, cartoon, distorted';
  }
  if(!clone.image){
    clone.image = { size: mapAspectRatioToSize(formData?.videoAspectRatio) };
  } else if(!clone.image.size){
    clone.image.size = mapAspectRatioToSize(formData?.videoAspectRatio);
  }
  if(!clone.styling){
    clone.styling = { style: 'photo' };
  } else if(!clone.styling.style){
    clone.styling.style = 'photo';
  }
  if(!clone.seed){
    // 5자리 시드 (요구사항 seed 10000~99999 비슷한 규칙, 없으면 추가 — 네 체인 안건드리고 보강)
    clone.seed = Math.floor(10000 + Math.random()*90000);
  }
  if(!clone.num_images){
    clone.num_images = 1;
  }
  return clone;
}

const Step2 = ({ onNext, onPrev, formData, setStoryboard, setIsLoading, isLoading }) => {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [percent, setPercent] = useState(0);
  const [styles, setStyles] = useState([]);
  const [imgDone, setImgDone] = useState(0);
  const [imgFail, setImgFail] = useState(0);
  const [imgTotal, setImgTotal] = useState(0);

  const log = (m)=> setLogs(prev=> [...prev, `[${new Date().toLocaleTimeString()}] ${m}`]);

  const handleGenerate = async () => {
    if (isLoading) return;
    setIsLoading?.(true);
    setError(null);
    setLogs([]);
    setPercent(0);
    setImgDone(0);
    setImgFail(0);
    setImgTotal(0);
    setStyles([]);

    try {
      log('1/2 스토리보드(6컨셉) 생성 시작');
      setPercent(5);
      const r = await fetch(`${API_BASE}/api/storyboard-init`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ formData })
      });
      if (!r.ok) {
        const txt = await r.text().catch(()=> '');
        throw new Error(`storyboard-init 실패 ${r.status} ${txt}`);
      }
      const data = await r.json();
      if (!data.success) throw new Error(data.error || '스토리보드 실패');

      // 원본 styles
      const fetchedStyles = data.styles || [];
      // ★ Z+: imagePrompts 보강 (원본 prompt 문구 수정 없음)
      fetchedStyles.forEach(style=>{
        style.images = [];
        style.imagePrompts = (style.imagePrompts||[]).map(p => enrichImagePrompt(p, formData));
      });

      setStyles(fetchedStyles);
      const totalImages = imagesTotalFromStyles(fetchedStyles);
      setImgTotal(totalImages);
      log(`스토리보드 완료: 컨셉 6개, 총 이미지 ${totalImages}개`);
      setPercent(15);

      // 2) 이미지 생성
      log('2/2 Freepik 이미지 생성 시작');
      const tasks = [];
      fetchedStyles.forEach(style=>{
        (style.imagePrompts||[]).forEach(p=>{
          tasks.push(()=> generateOne(style, p));
        });
      });

      const concurrency = 6; // 필요시 조정
      await runConcurrent(tasks, concurrency, (done,total)=>{
        const prog = 15 + Math.round((done/total)*80);
        setPercent(Math.min(99, prog));
      });

      setPercent(100);
      log(`이미지 생성 완료 성공=${imgDone} 실패=${imgFail} / 전체=${imgTotal}`);

      setStoryboard?.({
        styles: fetchedStyles,
        metadata: data.metadata
      });

      setIsLoading?.(false);
      // 원본처럼 자동 진행 (사용자가 원하면 여기 유지)
      onNext?.();
    } catch(e) {
      console.error('Step2 오류:', e);
      log(`오류: ${e.message}`);
      setError(e.message);
      setIsLoading?.(false);
      setPercent(0);
    }
  };

  // ★ Z+: 새 API 규약 (imagePrompt 전체) + 구형 호환 안깨짐
  const generateOne = async (style, promptObj) => {
    try {
      log(`생성: [${style.style}] Scene ${promptObj.sceneNumber}`);
      const body = {
        imagePrompt: promptObj,         // 신규 형식
        sceneNumber: promptObj.sceneNumber,
        conceptId: style.concept_id
        // style 필드가 필요하다면 추가 가능 (기존 server 코드에선 사용 안함)
      };
      const r = await fetch(`${API_BASE}/api/storyboard-render-image`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        const txt = await r.text().catch(()=> '');
        log(`실패: [${style.style}] Scene ${promptObj.sceneNumber} ${r.status}`);
        setImgFail(f=>f+1);
        return;
      }
      const json = await r.json();
      let finalUrl = json.url;
      // Data URL 또는 절대/상대 경로 모두 허용
      if(finalUrl && !/^data:|^https?:\/\//.test(finalUrl)){
        finalUrl = `${API_BASE}${finalUrl.startsWith('/')?finalUrl:`/${finalUrl}`}`;
      }
      style.images.push({
        id: `${style.concept_id}-${promptObj.sceneNumber}-${Math.random().toString(36).slice(2,8)}`,
        sceneNumber: promptObj.sceneNumber,
        title: promptObj.title,
        duration: promptObj.duration,
        url: finalUrl,
        thumbnail: finalUrl,
        prompt: promptObj.prompt,
        // ★ Z+ : 디버깅용 메타 부가
        _fallback: json.fallback || false,
        _seed: promptObj.seed
      });
      setImgDone(d=>d+1);
      log(`완료: [${style.style}] Scene ${promptObj.sceneNumber}${json.fallback?' (fallback)':''}`);
    } catch(e) {
      setImgFail(f=>f+1);
      log(`예외: [${style.style}] Scene ${promptObj.sceneNumber} - ${e.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {isLoading && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center">
          <div className="bg-white/10 backdrop-blur p-6 rounded text-white w-full max-w-xl">
            <h3 className="text-lg font-semibold">생성 중...</h3>
            <div className="mt-3 w-full bg-white/25 h-2 rounded overflow-hidden">
              <div className="bg-white h-2 transition-all" style={{width:`${percent}%`}} />
            </div>
            <div className="mt-2 text-sm">진행률 {percent}% · 성공 {imgDone} 실패 {imgFail} / {imgTotal}</div>
            <details className="mt-4" open>
              <summary className="cursor-pointer">로그</summary>
              <div className="mt-2 h-48 overflow-auto text-xs font-mono whitespace-pre-wrap">
                {logs.slice(-300).join('\n')}
              </div>
            </details>
          </div>
        </div>
      )}
      <div className={`bg-white rounded shadow p-6 ${isLoading?'opacity-50 pointer-events-none':''}`}>
        <h2 className="text-2xl font-bold mb-4">2단계: 6개 컨셉 스토리보드 & 이미지 생성</h2>
        {error && <div className="mb-4 bg-red-100 text-red-700 p-3 rounded">{error}</div>}
        <p className="text-gray-600 mb-6">
          Gemini 3회 호출(브리프→컨셉JSON→6컨셉 멀티 스토리보드) 후 모든 컨셉 이미지를 Freepik으로 생성합니다.
        </p>
        <div className="flex justify-between">
          <button onClick={onPrev} className="px-5 py-2 border rounded">이전</button>
          <button
            onClick={handleGenerate}
            className="px-6 py-2 rounded bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow hover:from-purple-700 hover:to-pink-700"
            disabled={isLoading}
          >
            {styles.length? '다시 생성' : '생성 시작'}
          </button>
        </div>
      </div>

      {styles.length>0 && (
        <div className="mt-8 grid md:grid-cols-3 gap-5">
          {styles.map(s=>(
            <div key={s.concept_id} className="border rounded p-3">
              <div className="font-semibold mb-1">{s.style}</div>
              <div className="text-xs text-gray-500 mb-2 line-clamp-3">{s.summary}</div>
              <div className="grid grid-cols-3 gap-2">
                {(s.images||[]).slice(0, s.imagePrompts?.length || 6).map(img=>(
                  <img key={img.id} src={img.thumbnail||img.url} className="w-full h-20 object-cover rounded border" />
                ))}
                {/* 대기중 placeholder */}
                {Array.from({length: Math.max(0,(s.imagePrompts?.length||0)-(s.images?.length||0))})
                  .map((_,i)=>(
                    <div key={`ph-${s.concept_id}-${i}`} className="w-full h-20 rounded bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 border border-dashed">
                      대기
                    </div>
                  ))
                }
              </div>
              <div className="mt-2 text-xs text-gray-600">
                Scenes: {s.imagePrompts?.length} · Images Done: {(s.images||[]).length}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

Step2.propTypes = {
  onNext: PropTypes.func,
  onPrev: PropTypes.func,
  formData: PropTypes.object,
  setStoryboard: PropTypes.func,
  setIsLoading: PropTypes.func,
  isLoading: PropTypes.bool
};

export default Step2;

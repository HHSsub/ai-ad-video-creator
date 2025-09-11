import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const Step3 = ({ storyboard, onPrev, onNext, setIsLoading, isLoading }) => {
  const styles = storyboard?.styles || [];
  const [selected, setSelected] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [logs, setLogs] = useState([]);
  const [percent, setPercent] = useState(0);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState(null);

  const log = (m)=> setLogs(prev=> [...prev, `[${new Date().toLocaleTimeString()}] ${m}`]);

  const startVideoGen = async () => {
    if (!selected) return alert('컨셉 선택 먼저');
    if (isLoading) return;
    setIsLoading?.(true);
    setError(null);
    setLogs([]);
    setPercent(0);
    setTasks([]);
    setProgressMap({});
    log(`영상 생성 시작: ${selected.style}`);

    try {
      // 이미지별 video task 생성
      const localTasks = [];
      for (const img of (selected.images||[])) {
        try {
          const r = await fetch(`${API_BASE}/api/image-to-video`,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              imageUrl: img.url,
              prompt: img.prompt,
              duration: img.duration || 2,
              sceneNumber: img.sceneNumber,
              conceptId: selected.concept_id
            })
          });
          if (!r.ok) {
            log(`Task 생성 실패 scene=${img.sceneNumber}`);
            continue;
          }
          const j = await r.json();
            localTasks.push({ taskId: j.taskId, sceneNumber: img.sceneNumber });
          log(`Task 생성 성공 scene=${img.sceneNumber} task=${j.taskId}`);
        } catch(e) {
          log(`예외 scene=${img.sceneNumber}: ${e.message}`);
        }
      }
      if (!localTasks.length) throw new Error('생성된 video task 없음');
      setTasks(localTasks);
      setPolling(true);
    } catch(e) {
      setError(e.message);
      setIsLoading?.(false);
    }
  };

  useEffect(()=>{
    if (!polling || tasks.length===0) return;
    let cancelled=false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const pending = tasks.filter(t=> progressMap[t.sceneNumber]?.status !== 'COMPLETED');
        if (!pending.length) {
          setPolling(false);
          setIsLoading?.(false);
          log('모든 클립 완료');
          setPercent(100);
          return;
        }
        const r = await fetch(`${API_BASE}/api/video-status`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ tasks: pending })
        });
        if (!r.ok) {
          log(`status 실패 ${r.status}`);
          return;
        }
        const j = await r.json();
        const segs = j.segments || [];
        const map = {...progressMap};
        let done=0;
        for (const s of segs) {
          map[s.sceneNumber] = {
            status: s.status,
            videoUrl: s.videoUrl || map[s.sceneNumber]?.videoUrl || null
          };
        }
        for (const t of tasks) {
          if (map[t.sceneNumber]?.status === 'COMPLETED') done++;
        }
        setProgressMap(map);
        const p = Math.round((done / tasks.length)*100);
        setPercent(p);
        log(`상태: ${done}/${tasks.length} (${p}%)`);
      } catch(e) {
        log(`status 예외: ${e.message}`);
      }
    };

    tick();
    const intv = setInterval(tick, 5000);
    return ()=> {
      cancelled=true;
      clearInterval(intv);
    };
  }, [polling, tasks, progressMap]);

  const allDone = tasks.length>0 && tasks.every(t=>progressMap[t.sceneNumber]?.status==='COMPLETED');

  return (
    <div className="max-w-7xl mx-auto p-6">
      {isLoading && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center">
          <div className="bg-white/10 backdrop-blur p-6 rounded text-white w-full max-w-xl">
            <h3 className="font-semibold">영상 생성 중...</h3>
            <div className="mt-3 w-full bg-white/30 h-2 rounded overflow-hidden">
              <div className="bg-white h-2 transition-all" style={{width:`${percent}%`}} />
            </div>
            <div className="mt-2 text-sm">{percent}%</div>
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
        <h2 className="text-2xl font-bold mb-4">3단계: 컨셉 선택 & 영상 클립 생성</h2>
        {error && <div className="bg-red-100 text-red-700 p-3 mb-4 rounded">{error}</div>}

        <div className="grid md:grid-cols-3 gap-5 mb-6">
          {styles.map(s=>(
            <div
              key={s.concept_id}
              className={`border rounded p-3 cursor-pointer ${selected?.concept_id===s.concept_id?'ring-2 ring-blue-500':''}`}
              onClick={()=> !isLoading && setSelected(s)}
            >
              <div className="font-semibold mb-1">{s.style}</div>
              <div className="text-xs text-gray-500 mb-2 line-clamp-3">{s.summary}</div>
              <div className="grid grid-cols-3 gap-2">
                {(s.images||[]).slice(0,6).map(img=>(
                  <img key={img.id} src={img.thumbnail||img.url} className="w-full h-20 object-cover rounded" />
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-600">
                Scenes: {s.imagePrompts?.length} / Images: {(s.images||[]).length}
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">{selected.style} - 선택한 이미지</h3>
            <div className="grid md:grid-cols-5 gap-3">
              {(selected.images||[]).map(img=>{
                const st = progressMap[img.sceneNumber];
                return (
                  <div key={img.id} className="border rounded p-2 text-xs">
                    <img src={img.thumbnail||img.url} className="w-full h-24 object-cover rounded mb-1" />
                    <div>Scene {img.sceneNumber}</div>
                    <div className="text-[10px] text-gray-500">{st?st.status:'PENDING'}</div>
                    {st?.videoUrl && (
                      <video
                        src={st.videoUrl}
                        className="w-full mt-1 rounded"
                        controls
                        muted
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4 border-t">
          <button onClick={onPrev} className="px-5 py-2 border rounded">이전</button>
          {!allDone ? (
            <button
              onClick={startVideoGen}
              disabled={!selected || isLoading}
              className="px-6 py-2 rounded bg-gradient-to-r from-purple-600 to-pink-600 text-white disabled:opacity-50"
            >
              {selected ? '영상 생성 시작' : '컨셉 선택 필요'}
            </button>
          ) : (
            <button
              onClick={onNext}
              className="px-6 py-2 rounded bg-green-600 text-white"
            >
              합치기 단계로 이동
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

Step3.propTypes = {
  storyboard: PropTypes.object,
  onPrev: PropTypes.func,
  onNext: PropTypes.func,
  setIsLoading: PropTypes.func,
  isLoading: PropTypes.bool
};

export default Step3;

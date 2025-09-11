import { useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DUMMY_BGMS = [
  { id:'b1', name:'Upbeat Energy', url:'/assets/bgm/energetic.mp3', type:'theme', genre:'pop', mood:'energetic' },
  { id:'b2', name:'Ambient Soft', url:'/assets/bgm/ambient.mp3', type:'ambient', genre:'ambient', mood:'calm' },
  { id:'b3', name:'Tech Pulse', url:'/assets/bgm/tech.mp3', type:'tech', genre:'electronic', mood:'driving' }
];

const Step4=({ storyboard, selectedConceptId, onPrev })=>{
  const styles = storyboard?.styles||[];
  const selected = styles.find(s=>s.concept_id===selectedConceptId);
  const [logs,setLogs]=useState([]);
  const [compiledUrl,setCompiledUrl]=useState(null);
  const [finalVideo,setFinalVideo]=useState(null);
  const [bgm,setBgm]=useState('');
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState(null);

  const log=m=>setLogs(p=>[...p,`[${new Date().toLocaleTimeString()}] ${m}`]);

  const compile = async ()=>{
    if(!selected) return;
    setErr(null);
    setLoading(true);
    try{
      const segs=(selected.images||[])
        .filter(i=>i.videoUrl)
        .sort((a,b)=>a.sceneNumber-b.sceneNumber)
        .map(i=>({videoUrl:i.videoUrl, sceneNumber:i.sceneNumber}));

      if(!segs.length) throw new Error('videoUrl 있는 scene 없음');

      log('클립 합치기 JSON 모드 요청');
      const r=await fetch(`${API_BASE}/api/compile-videos`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ segments: segs, jsonMode:true })
      });
      if(!r.ok){
        const txt=await r.text().catch(()=> '');
        throw new Error(`compile 실패 ${r.status} ${txt}`);
      }
      const j=await r.json();
      if(!j.success) throw new Error(j.error||'compile 실패');
      setCompiledUrl(j.compiledVideoUrl);
      log(`합치기 완료 url=${j.compiledVideoUrl}`);
    }catch(e){
      setErr(e.message);
      log(`오류: ${e.message}`);
    }finally{
      setLoading(false);
    }
  };

  const applyBgm = async ()=>{
    if(!compiledUrl) return;
    if(!bgm) return;
    setErr(null);
    setLoading(true);
    try{
      const chosen = DUMMY_BGMS.find(b=>b.id===bgm);
      if(!chosen) throw new Error('BGM 선택 오류');
      log('BGM 적용 시작');
      const projectInfo = {
        brandName: storyboard?.brandName || 'brand',
        conceptId: selected.concept_id
      };
      const r=await fetch(`${API_BASE}/api/apply-bgm`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          compiledVideoUrl: compiledUrl,
          selectedBGM: chosen,
          projectInfo
        })
      });
      if(!r.ok){
        const txt=await r.text().catch(()=> '');
        throw new Error(`apply-bgm 실패 ${r.status} ${txt}`);
      }
      const j=await r.json();
      if(!j.success) throw new Error(j.error||'apply-bgm 실패');
      setFinalVideo(j.finalVideo?.url);
      log('BGM 적용 완료');
    }catch(e){
      setErr(e.message);
      log(`오류: ${e.message}`);
    }finally{
      setLoading(false);
    }
  };

  if(!selected){
    return (
      <div className="p-6 bg-white rounded shadow">
        <h2 className="text-xl font-bold mb-4">4단계</h2>
        <p className="text-gray-500">선택된 컨셉 없음. 이전 단계로 돌아가 선택.</p>
        <button onClick={onPrev} className="mt-4 px-4 py-2 border rounded">이전</button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">4단계: 합치기 & BGM</h2>
      {err && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{err}</div>}
      {!compiledUrl && (
        <button
          onClick={compile}
            disabled={loading}
          className="px-6 py-2 rounded bg-gradient-to-r from-purple-600 to-pink-600 text-white disabled:opacity-50">
          {loading?'합치는 중...':'클립 합치기'}
        </button>
      )}
      {compiledUrl && !finalVideo && (
        <div className="mt-6 space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Merged Preview</h3>
            <video src={compiledUrl} controls className="w-full rounded mb-2"/>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">BGM 선택</label>
            <select
              className="border rounded p-2"
              value={bgm}
              onChange={e=>setBgm(e.target.value)}
              disabled={loading}
            >
              <option value="">-- 선택 --</option>
              {DUMMY_BGMS.map(b=> <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <button
            onClick={applyBgm}
            disabled={!bgm || loading}
            className="px-6 py-2 rounded bg-green-600 text-white disabled:opacity-50"
          >
            {loading?'BGM 적용 중...':'BGM 적용'}
          </button>
        </div>
      )}
      {finalVideo && (
        <div className="mt-8">
          <h3 className="font-semibold mb-2">Final Video</h3>
          <video src={finalVideo} controls className="w-full rounded mb-3"/>
          <a href={finalVideo} download className="inline-block px-5 py-2 bg-blue-600 text-white rounded">
            다운로드
          </a>
        </div>
      )}

      <details className="mt-8">
        <summary className="cursor-pointer font-semibold">로그</summary>
        <div className="mt-2 h-48 overflow-auto bg-gray-900 text-green-300 p-3 text-xs font-mono whitespace-pre-wrap rounded">
          {logs.slice(-400).join('\n')}
        </div>
      </details>

      <div className="mt-6">
        <button onClick={onPrev} className="px-5 py-2 border rounded">이전</button>
      </div>
    </div>
  );
};

Step4.propTypes = {
  storyboard: PropTypes.object,
  selectedConceptId: PropTypes.number,
  onPrev: PropTypes.func
};

export default Step4;

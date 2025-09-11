import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

function loadTxt(fn){
  const p = path.resolve(process.cwd(),'public',fn);
  if(!fs.existsSync(p)) throw new Error(`${fn} 누락`);
  return fs.readFileSync(p,'utf-8');
}

const INPUT_PROMPT  = loadTxt('input_prompt.txt');
const SECOND_PROMPT = loadTxt('second_prompt.txt');
const THIRD_PROMPT  = loadTxt('third_prompt.txt');

function parseVideoLengthSeconds(raw){
  if(raw==null) return 10;
  if(typeof raw==='number') return raw;
  const d = String(raw).match(/\d+/g);
  if(!d) return 10;
  const n = parseInt(d.join(''),10);
  return (isNaN(n)||n<=0)?10:n;
}

function calcSceneCount(sec){
  const n = Math.floor(sec/2);
  return Math.max(1, Math.min(n, 30));
}

// 올바른 모델 체인 설정 (.env 기반)
const MODEL_CHAIN = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  process.env.FALLBACK_GEMINI_MODEL || 'gemini-2.5-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
].filter(Boolean);

const MAX_ATTEMPTS = 16; // 각 모델당 2번씩 시도
const BASE_BACKOFF = Number(process.env.GEMINI_BASE_BACKOFF_MS || 1500);
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const jitter = ms=>Math.round(ms*(0.7+Math.random()*0.6));

function retryable(e){
  const c = e?.status;
  const m = (e?.message||'').toLowerCase();
  if([429,500,502,503,504].includes(c)) return true;
  if(m.includes('overload')||m.includes('quota')||m.includes('timeout')||m.includes('fetch')||m.includes('503')) return true;
  return false;
}

// 개선된 Gemini 호출 로직
async function callGemini(genAI, prompt, label){
  let attempt = 0;
  
  for(const model of MODEL_CHAIN){
    for(let modelAttempt = 1; modelAttempt <= 2; modelAttempt++){
      attempt++;
      console.log(`[storyboard-init] ${label} attempt ${attempt}/${MAX_ATTEMPTS} model=${model} (${modelAttempt}/2)`);
      
      try{
        const m = genAI.getGenerativeModel({model});
        const t0=Date.now();
        const r = await m.generateContent(prompt);
        const text = r.response.text();
        console.log(`[storyboard-init] ${label} SUCCESS model=${model} ${Date.now()-t0}ms`);
        return text;
      }catch(e){
        console.warn(`[storyboard-init] ${label} FAIL model=${model} attempt=${modelAttempt}: ${e.message}`);
        
        // 503 과부하면 다음 모델로 즉시 전환
        if(e.message.includes('503') || e.message.includes('overloaded') || e.message.includes('Service Unavailable')){
          console.log(`[storyboard-init] ${model} 과부하 감지, 다음 모델로 즉시 전환`);
          break; // 이 모델의 재시도 중단
        }
        
        // 재시도 가능한 에러면 잠시 대기 후 재시도
        if(retryable(e) && modelAttempt < 2){
          const delay = jitter(BASE_BACKOFF * modelAttempt);
          console.warn(`[storyboard-init] ${delay}ms 후 같은 모델로 재시도`);
          await sleep(delay);
        }
      }
    }
    
    // 다음 모델로 넘어가기 전 잠시 대기
    const modelIndex = MODEL_CHAIN.indexOf(model);
    if(modelIndex < MODEL_CHAIN.length - 1) {
      console.log(`[storyboard-init] 모델 ${model} 실패, 다음 모델 ${MODEL_CHAIN[modelIndex + 1]}로 전환`);
      await sleep(2000); // 2초 대기
    }
  }
  
  throw new Error(`${label} 실패: 모든 모델 (${MODEL_CHAIN.join(', ')}) 실패`);
}

function buildBriefPrompt(fd){
  return INPUT_PROMPT
    .replaceAll('{{brandName}}', String(fd.brandName||''))
    .replaceAll('{{industryCategory}}', String(fd.industryCategory||''))
    .replaceAll('{{videoLength}}', String(parseVideoLengthSeconds(fd.videoLength)))
    .replaceAll('{{coreTarget}}', String(fd.coreTarget||''))
    .replaceAll('{{coreDifferentiation}}', String(fd.coreDifferentiation||''))
    .replaceAll('{{videoPurpose}}', String(fd.videoPurpose||''));
}

function buildConceptsPrompt(brief,fd){
  return SECOND_PROMPT
    .replaceAll('{{brief}}', brief)
    .replaceAll('{{brandName}}', String(fd.brandName||''))
    .replaceAll('{{videoLength}}', String(parseVideoLengthSeconds(fd.videoLength)))
    .replaceAll('{{videoPurpose}}', String(fd.videoPurpose||''));
}

function buildMultiPrompt(brief, conceptsJson, sceneCount, videoSec){
  return THIRD_PROMPT
    .replaceAll('{{brief}}', brief)
    .replaceAll('{{concepts_json}}', conceptsJson)
    .replaceAll('{{scene_count}}', String(sceneCount))
    .replaceAll('{{video_length_seconds}}', String(videoSec));
}

// 강화된 컨셉 파싱 함수
function parseConcepts(text) {
  console.log('[parseConcepts] 파싱 시작, 텍스트 길이:', text.length);
  
  try {
    // 1. JSON 배열 찾기
    const jsonPattern = /\[\s*\{[\s\S]*?\}\s*\]/;
    const jsonMatch = text.match(jsonPattern);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length === 6) {
          const valid = parsed.every(item => 
            item.concept_id && 
            item.concept_name && 
            item.summary && 
            Array.isArray(item.keywords) &&
            item.concept_id >= 1 && item.concept_id <= 6
          );
          
          if (valid) {
            console.log('[parseConcepts] JSON 배열 파싱 성공');
            return parsed;
          }
        }
      } catch(e) {
        console.warn('[parseConcepts] JSON 파싱 실패:', e.message);
      }
    }
    
    // 2. 개별 객체 추출
    const conceptMap = new Map();
    const objectPattern = /\{\s*["']?concept_id["']?\s*:\s*(\d+)\s*,[\s\S]*?\}/g;
    let match;
    
    while ((match = objectPattern.exec(text)) !== null) {
      try {
        const objText = match[0];
        const conceptId = parseInt(match[1], 10);
        
        if (conceptId >= 1 && conceptId <= 6) {
          const cleanedText = objText
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/'/g, '"')
            .replace(/(\w+):/g, '"$1":')
            .replace(/,\s*}/g, '}');
          
          const obj = JSON.parse(cleanedText);
          
          conceptMap.set(conceptId, {
            concept_id: conceptId,
            concept_name: obj.concept_name || `컨셉 ${conceptId}`,
            summary: obj.summary || `컨셉 ${conceptId} 설명`,
            keywords: Array.isArray(obj.keywords) ? obj.keywords : 
                     (typeof obj.keywords === 'string' ? obj.keywords.split(',').map(k => k.trim()) : 
                     [`키워드${conceptId}1`, `키워드${conceptId}2`, `키워드${conceptId}3`, `키워드${conceptId}4`, `키워드${conceptId}5`])
          });
          
          console.log(`[parseConcepts] 컨셉 ${conceptId} 추가됨`);
        }
      } catch (e) {
        console.warn('[parseConcepts] 개별 객체 파싱 실패:', e.message);
      }
    }
    
    // 3. 결과 배열 생성 (정확히 6개)
    const result = [];
    for (let i = 1; i <= 6; i++) {
      if (conceptMap.has(i)) {
        result.push(conceptMap.get(i));
      } else {
        result.push(generateFallbackConcept(i));
      }
    }
    
    console.log('[parseConcepts] 최종 컨셉 수:', result.length);
    return result;
    
  } catch (e) {
    console.error('[parseConcepts] 전체 파싱 실패:', e.message);
    return generateFallbackConcepts();
  }
}

function generateFallbackConcept(conceptId) {
  const templates = [
    { name: '욕망의 시각화', desc: '타겟의 심리적 욕구를 시각적으로 구현' },
    { name: '이질적 조합의 미학', desc: '예상치 못한 요소들의 창의적 결합' },
    { name: '핵심 가치의 극대화', desc: '브랜드 핵심 강점의 과장된 표현' },
    { name: '기회비용의 시각화', desc: '제품 미사용시 손해의 구체적 묘사' },
    { name: '트렌드 융합', desc: '최신 트렌드와 브랜드의 자연스러운 융합' },
    { name: '파격적 반전', desc: '예측 불가능한 스토리와 반전 요소' }
  ];
  
  const template = templates[conceptId - 1] || templates[0];
  return {
    concept_id: conceptId,
    concept_name: template.name,
    summary: template.desc,
    keywords: [`키워드${conceptId}1`, `키워드${conceptId}2`, `키워드${conceptId}3`, `키워드${conceptId}4`, `키워드${conceptId}5`]
  };
}

function generateFallbackConcepts() {
  return Array.from({ length: 6 }, (_, i) => generateFallbackConcept(i + 1));
}

// 강화된 멀티 스토리보드 파싱
function parseMultiStoryboards(raw, sceneCount) {
  console.log('[parseMultiStoryboards] 파싱 시작, sceneCount:', sceneCount);
  
  const results = [];
  if (!raw) {
    console.warn('[parseMultiStoryboards] 빈 응답');
    return generateFallbackStoryboards(sceneCount);
  }

  try {
    const conceptPattern = /#{1,3}\s*Concept\s+(\d+)[\s\S]*?(?=#{1,3}\s*Concept\s+\d+|$)/gi;
    const conceptMatches = [...raw.matchAll(conceptPattern)];
    
    console.log('[parseMultiStoryboards] 찾은 컨셉 블록 수:', conceptMatches.length);

    for (let i = 0; i < Math.min(conceptMatches.length, 6); i++) {
      const conceptMatch = conceptMatches[i];
      const conceptId = parseInt(conceptMatch[1], 10);
      const blockContent = conceptMatch[0];
      
      const nameMatch = blockContent.match(/Concept\s+\d+:\s*([^\n]+)/);
      const conceptName = nameMatch ? nameMatch[1].trim() : `Concept ${conceptId}`;
      
      console.log('[parseMultiStoryboards] 처리 중인 컨셉:', conceptId, conceptName);
      
      const scenes = [];
      const scenePattern = /#{1,4}\s*Scene\s+(\d+)[\s\S]*?(?=#{1,4}\s*Scene\s+\d+|#{1,3}\s*Concept\s+\d+|$)/gi;
      const sceneMatches = [...blockContent.matchAll(scenePattern)];
      
      console.log(`[parseMultiStoryboards] 컨셉 ${conceptId}에서 찾은 씬 수:`, sceneMatches.length);
      
      for (const sceneMatch of sceneMatches) {
        const sceneContent = sceneMatch[0];
        const sceneNumMatch = sceneContent.match(/Scene\s+(\d+)/i);
        
        if (sceneNumMatch) {
          const sceneNumber = parseInt(sceneNumMatch[1], 10);
          
          if (sceneNumber <= sceneCount) {
            let prompt = '';
            const promptPatterns = [
              /\*\*Image Prompt\*\*:\s*([\s\S]*?)(?=\n\*\*|\n#{1,4}|$)/i,
              /Image Prompt:\s*([\s\S]*?)(?=\n\*\*|\n#{1,4}|$)/i,
              /- \*\*Image Prompt\*\*:\s*([\s\S]*?)(?=\n\*\*|\n#{1,4}|$)/i,
              /\*\*Image Prompt\*\*([\s\S]*?)(?=\n#{1,4}|$)/i
            ];
            
            for (const pattern of promptPatterns) {
              const promptMatch = sceneContent.match(pattern);
              if (promptMatch) {
                prompt = promptMatch[1].trim();
                break;
              }
            }
            
            if (prompt) {
              prompt = prompt
                .replace(/\*\*/g, '')
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              
              if (prompt.split(/\s+/).length < 15) {
                prompt += ', professional commercial photography, high quality, detailed, cinematic lighting, 4K resolution';
              }
            } else {
              prompt = `${conceptName} scene ${sceneNumber}, professional commercial advertisement, cinematic lighting, high quality, detailed composition, 4K resolution`;
            }
            
            scenes.push({
              sceneNumber: sceneNumber,
              title: `Scene ${sceneNumber}`,
              prompt: prompt,
              duration: 2
            });
          }
        }
      }
      
      while (scenes.length < sceneCount) {
        const sceneNumber = scenes.length + 1;
        scenes.push({
          sceneNumber: sceneNumber,
          title: `Scene ${sceneNumber}`,
          prompt: `${conceptName} scene ${sceneNumber}, professional commercial advertisement, cinematic lighting, high quality, detailed composition, 4K resolution`,
          duration: 2
        });
      }
      
      scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
      scenes.splice(sceneCount);
      
      results.push({
        concept_id: conceptId,
        name: conceptName,
        imagePrompts: scenes
      });
    }
    
    while (results.length < 6) {
      const conceptId = results.length + 1;
      results.push(generateFallbackStoryboard(conceptId, sceneCount));
    }
    
    console.log('[parseMultiStoryboards] 최종 파싱된 컨셉 수:', results.length);
    return results;
    
  } catch (error) {
    console.error('[parseMultiStoryboards] 파싱 오류:', error.message);
    return generateFallbackStoryboards(sceneCount);
  }
}

function generateFallbackStoryboard(conceptId, sceneCount) {
  const fallbackNames = [
    'Cinematic Professional',
    'Modern Minimalist', 
    'Vibrant Dynamic',
    'Natural Lifestyle',
    'Premium Luxury',
    'Tech Innovation'
  ];
  
  const conceptName = fallbackNames[conceptId - 1] || `Concept ${conceptId}`;
  const scenes = [];
  
  for (let i = 1; i <= sceneCount; i++) {
    scenes.push({
      sceneNumber: i,
      title: `Scene ${i}`,
      prompt: `${conceptName} professional commercial advertisement scene ${i}, cinematic lighting, high quality composition, detailed textures, 4K resolution, commercial photography style`,
      duration: 2
    });
  }
  
  return {
    concept_id: conceptId,
    name: conceptName,
    imagePrompts: scenes
  };
}

function generateFallbackStoryboards(sceneCount) {
  console.log('[generateFallbackStoryboards] 폴백 스토리보드 생성, sceneCount:', sceneCount);
  return Array.from({ length: 6 }, (_, i) => generateFallbackStoryboard(i + 1, sceneCount));
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const t0=Date.now();
  
  try{
    const { formData } = req.body||{};
    if(!formData) return res.status(400).json({error:'formData required'});

    const videoSec=parseVideoLengthSeconds(formData.videoLength);
    const sceneCount=calcSceneCount(videoSec);
    console.log(`[storyboard-init] 시작 - videoSec=${videoSec} sceneCount=${sceneCount} models=[${MODEL_CHAIN.join(', ')}]`);

    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if(!apiKey) throw new Error('Gemini API Key 누락');
    
    const gen=new GoogleGenerativeAI(apiKey);

    // 1단계: 브리프 생성
    console.log('[storyboard-init] 1단계: 브리프 생성 시작');
    const briefPrompt = buildBriefPrompt(formData);
    const briefOut = await callGemini(gen, briefPrompt, '1-brief');
    console.log('[storyboard-init] 1단계 완료, 브리프 길이:', briefOut.length);

    // 2단계: 컨셉 생성
    console.log('[storyboard-init] 2단계: 컨셉 생성 시작');
    const conceptsPrompt = buildConceptsPrompt(briefOut, formData);
    const conceptsOut = await callGemini(gen, conceptsPrompt, '2-concepts');
    console.log('[storyboard-init] 2단계 완료, 응답 길이:', conceptsOut.length);
    
    const conceptsArr = parseConcepts(conceptsOut);
    console.log('[storyboard-init] 컨셉 파싱 결과:', conceptsArr.length);

    // 3단계: 멀티 스토리보드 생성
    console.log('[storyboard-init] 3단계: 멀티 스토리보드 생성 시작');
    const multiPrompt = buildMultiPrompt(briefOut, JSON.stringify(conceptsArr,null,2), sceneCount, videoSec);
    
    let parsed = [];
    try {
      const multiOut = await callGemini(gen, multiPrompt, '3-multi-storyboards');
      console.log('[storyboard-init] 3단계 완료, 응답 길이:', multiOut.length);
      parsed = parseMultiStoryboards(multiOut, sceneCount);
    } catch (multiError) {
      console.error('[storyboard-init] 3단계 실패, 폴백 사용:', multiError.message);
      parsed = generateFallbackStoryboards(sceneCount);
    }
    
    console.log('[storyboard-init] 멀티 스토리보드 파싱 결과:', parsed.length);

    // 최종 스타일 구성
    const styles = conceptsArr.map((concept, index) => {
      const storyboardData = parsed.find(p => p.concept_id === concept.concept_id) || 
                            parsed[index] || 
                            generateFallbackStoryboard(concept.concept_id, sceneCount);
      
      let imagePrompts = storyboardData.imagePrompts || [];
      while (imagePrompts.length < sceneCount) {
        const sceneNum = imagePrompts.length + 1;
        imagePrompts.push({
          sceneNumber: sceneNum,
          title: `Scene ${sceneNum}`,
          duration: 2,
          prompt: `${concept.concept_name} professional commercial advertisement scene ${sceneNum}, cinematic lighting, high quality composition, detailed textures, 4K resolution`
        });
      }
      
      imagePrompts = imagePrompts.slice(0, sceneCount);
      
      return {
        concept_id: concept.concept_id,
        style: concept.concept_name,
        name: concept.concept_name,
        summary: concept.summary,
        keywords: concept.keywords,
        imagePrompts: imagePrompts,
        images: []
      };
    });

    const response = {
      success: true,
      styles: styles,
      metadata: {
        videoLengthSeconds: videoSec,
        sceneCountPerConcept: sceneCount,
        modelChain: MODEL_CHAIN,
        totalMs: Date.now() - t0,
        conceptsGenerated: conceptsArr.length,
        storyboardsGenerated: parsed.length,
        totalImagePrompts: styles.reduce((sum, s) => sum + s.imagePrompts.length, 0)
      }
    };

    console.log('[storyboard-init] 성공 완료:', {
      처리시간: Date.now() - t0 + 'ms',
      컨셉수: styles.length,
      총이미지프롬프트: response.metadata.totalImagePrompts,
      사용된모델체인: MODEL_CHAIN.join(' → ')
    });

    res.status(200).json(response);

  }catch(e){
    console.error('[storyboard-init] 전체 오류:', e);
    
    try {
      const videoSec = parseVideoLengthSeconds(req.body?.formData?.videoLength);
      const sceneCount = calcSceneCount(videoSec);
      const fallbackStyles = generateFallbackStoryboards(sceneCount).map(fb => ({
        concept_id: fb.concept_id,
        style: fb.name,
        name: fb.name,
        summary: `${fb.name} 스타일의 폴백 스토리보드`,
        keywords: ['professional', 'commercial', 'advertisement'],
        imagePrompts: fb.imagePrompts,
        images: []
      }));
      
      console.log('[storyboard-init] 폴백 응답 반환');
      res.status(200).json({
        success: true,
        styles: fallbackStyles,
        metadata: {
          videoLengthSeconds: videoSec,
          sceneCountPerConcept: sceneCount,
          modelChain: MODEL_CHAIN,
          totalMs: Date.now() - t0,
          fallback: true,
          error: e.message
        }
      });
    } catch (fallbackError) {
      console.error('[storyboard-init] 폴백도 실패:', fallbackError);
      res.status(500).json({success:false, error: e.message});
    }
  }
}

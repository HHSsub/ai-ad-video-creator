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
  return Math.max(1, Math.min(n, 30)); // 최소 1개, 최대 30개로 제한
}

const MODEL_CHAIN = (process.env.GEMINI_MODEL_CHAIN ||
  process.env.GEMINI_MODEL ||
  'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash,gemini-1.5-flash')
  .split(',').map(s=>s.trim()).filter(Boolean);

const MAX_ATTEMPTS = Number(process.env.GEMINI_MAX_ATTEMPTS || 8);
const BASE_BACKOFF = Number(process.env.GEMINI_BASE_BACKOFF_MS || 1500);
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const jitter = ms=>Math.round(ms*(0.7+Math.random()*0.6));

function retryable(e){
  const c = e?.status;
  const m = (e?.message||'').toLowerCase();
  if([429,500,502,503,504].includes(c)) return true;
  if(m.includes('overload')||m.includes('quota')||m.includes('timeout')||m.includes('fetch')) return true;
  return false;
}

async function callGemini(genAI, prompt, label){
  let attempt=0;
  const total = Math.max(MODEL_CHAIN.length*2, MAX_ATTEMPTS);
  while(attempt<total){
    for(const model of MODEL_CHAIN){
      for(let local=1; local<=2; local++){
        attempt++;
        console.log(`[storyboard-init] ${label} attempt ${attempt}/${total} model=${model}`);
        try{
          const m = genAI.getGenerativeModel({model});
          const t0=Date.now();
          const r = await m.generateContent(prompt);
          const text = r.response.text();
          console.log(`[storyboard-init] ${label} success model=${model} ${Date.now()-t0}ms`);
          return text;
        }catch(e){
          console.warn(`[storyboard-init] ${label} attempt ${attempt} failed:`, e.message);
          if(!retryable(e) && attempt > MODEL_CHAIN.length) {
            console.error(`[storyboard-init] ${label} non-retryable error:`, e);
            // 비재시도 오류여도 모든 모델을 시도해본 후 실패
          }
          const delay = jitter(BASE_BACKOFF*Math.pow(2, Math.floor(attempt/MODEL_CHAIN.length)));
          console.warn(`[storyboard-init] ${label} retry in ${delay}ms`);
          await sleep(delay);
        }
      }
    }
  }
  throw new Error(`${label} 실패: 전 모델 실패`);
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

// 개선된 컨셉 파싱 함수
function parseConcepts(text) {
  console.log('[parseConcepts] 파싱 시작, 텍스트 길이:', text.length);
  
  try {
    // 1. JSON 배열 형태 찾기
    const jsonArrayMatch = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (jsonArrayMatch) {
      try {
        const parsed = JSON.parse(jsonArrayMatch[0]);
        if (Array.isArray(parsed) && parsed.length === 6) {
          console.log('[parseConcepts] JSON 배열 파싱 성공');
          return parsed;
        }
      } catch(e) {
        console.warn('[parseConcepts] JSON 배열 파싱 실패:', e.message);
      }
    }
    
    // 2. 개별 JSON 객체들 찾기 (더 관대한 패턴)
    const objectPattern = /\{\s*["\']?concept_id["\']?\s*:\s*\d+[\s\S]*?\}/g;
    const matches = [...text.matchAll(objectPattern)];
    console.log('[parseConcepts] 찾은 객체 수:', matches.length);
    
    const conceptMap = {};
    
    for (const match of matches) {
      try {
        const objText = match[0];
        console.log('[parseConcepts] 파싱 시도:', objText.substring(0, 100) + '...');
        
        // JSON 파싱 전에 간단한 정리
        const cleanedText = objText
          .replace(/\s+/g, ' ')
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        
        const obj = JSON.parse(cleanedText);
        
        if (obj.concept_id && typeof obj.concept_id === 'number' && 
            obj.concept_id >= 1 && obj.concept_id <= 6 && 
            !conceptMap[obj.concept_id]) {
          
          // 필수 필드 확인 및 기본값 설정
          conceptMap[obj.concept_id] = {
            concept_id: obj.concept_id,
            concept_name: obj.concept_name || obj.name || `컨셉 ${obj.concept_id}`,
            summary: obj.summary || obj.description || `컨셉 ${obj.concept_id} 설명`,
            keywords: Array.isArray(obj.keywords) ? obj.keywords : 
                     (typeof obj.keywords === 'string' ? obj.keywords.split(',').map(k => k.trim()) : 
                     [`키워드${obj.concept_id}1`, `키워드${obj.concept_id}2`])
          };
          
          console.log('[parseConcepts] 컨셉 추가됨:', obj.concept_id);
        }
      } catch (e) {
        console.warn('[parseConcepts] 개별 객체 파싱 실패:', e.message);
      }
    }
    
    // 3. 결과 배열 생성
    const result = [];
    for (let i = 1; i <= 6; i++) {
      if (conceptMap[i]) {
        result.push(conceptMap[i]);
      }
    }
    
    console.log('[parseConcepts] 최종 파싱된 컨셉 수:', result.length);
    
    if (result.length === 6) {
      return result;
    }
    
    // 4. 부족한 컨셉은 기본값으로 채우기
    console.warn('[parseConcepts] 일부 컨셉 누락, 기본값으로 채움');
    return generateFallbackConcepts(result);
    
  } catch (e) {
    console.error('[parseConcepts] 전체 파싱 실패:', e.message);
    return generateFallbackConcepts([]);
  }
}

// 폴백 컨셉 생성
function generateFallbackConcepts(existingConcepts = []) {
  const fallbackTemplates = [
    { name: '욕망의 시각화', desc: '타겟의 심리적 욕구를 시각적으로 구현' },
    { name: '이질적 조합의 미학', desc: '예상치 못한 요소들의 창의적 결합' },
    { name: '핵심 가치의 극대화', desc: '브랜드 핵심 강점의 과장된 표현' },
    { name: '기회비용의 시각화', desc: '제품 미사용시 손해의 구체적 묘사' },
    { name: '트렌드 융합', desc: '최신 트렌드와 브랜드의 자연스러운 융합' },
    { name: '파격적 반전', desc: '예측 불가능한 스토리와 반전 요소' }
  ];
  
  const result = [...existingConcepts];
  
  for (let i = result.length; i < 6; i++) {
    const template = fallbackTemplates[i] || fallbackTemplates[0];
    result.push({
      concept_id: i + 1,
      concept_name: template.name,
      summary: template.desc,
      keywords: [`키워드${i+1}1`, `키워드${i+1}2`, `키워드${i+1}3`]
    });
  }
  
  return result.slice(0, 6);
}

// 개선된 멀티 스토리보드 파싱
function parseMultiStoryboards(raw, sceneCount) {
  console.log('[parseMultiStoryboards] 파싱 시작, sceneCount:', sceneCount);
  
  const results = [];
  if (!raw) {
    console.warn('[parseMultiStoryboards] 빈 응답');
    return results;
  }

  try {
    // 컨셉별 블록 분리 (더 관대한 패턴)
    const conceptBlocks = raw.split(/\n*#{1,3}\s*Concept\s+\d+/gi)
      .filter(block => block.trim().length > 0);
    
    console.log('[parseMultiStoryboards] 찾은 컨셉 블록 수:', conceptBlocks.length);

    for (let blockIndex = 0; blockIndex < conceptBlocks.length && blockIndex < 6; blockIndex++) {
      const block = conceptBlocks[blockIndex];
      const conceptId = blockIndex + 1;
      
      // 컨셉 이름 추출
      const nameMatch = block.match(/^[:\s]*([^\n]+)/);
      const conceptName = nameMatch ? nameMatch[1].trim() : `Concept ${conceptId}`;
      
      console.log('[parseMultiStoryboards] 처리 중인 컨셉:', conceptId, conceptName);
      
      const scenes = [];
      
      // Scene 패턴 매칭 (더 유연한 패턴)
      const scenePattern = /#{1,4}\s*Scene\s+(\d+)[\s\S]*?(?=#{1,4}\s*Scene\s+\d+|$)/gi;
      const sceneMatches = [...block.matchAll(scenePattern)];
      
      console.log('[parseMultiStoryboards] 찾은 씬 수:', sceneMatches.length);
      
      for (const match of sceneMatches) {
        const sceneText = match[0];
        const sceneNumMatch = sceneText.match(/Scene\s+(\d+)/i);
        
        if (sceneNumMatch) {
          const sceneNumber = parseInt(sceneNumMatch[1], 10);
          
          // Image Prompt 추출 (여러 패턴 시도)
          let prompt = '';
          const promptPatterns = [
            /\*\*Image Prompt\*\*:\s*([\s\S]*?)(?=\n\*\*|\n#{1,4}|$)/i,
            /Image Prompt:\s*([\s\S]*?)(?=\n\*\*|\n#{1,4}|$)/i,
            /- \*\*Image Prompt\*\*:\s*([\s\S]*?)(?=\n\*\*|\n#{1,4}|$)/i
          ];
          
          for (const pattern of promptPatterns) {
            const promptMatch = sceneText.match(pattern);
            if (promptMatch) {
              prompt = promptMatch[1].trim();
              break;
            }
          }
          
          // 프롬프트 정리
          if (prompt) {
            prompt = prompt
              .replace(/\*\*/g, '')
              .replace(/\n+/g, ' ')
              .trim();
            
            // 프롬프트가 너무 짧으면 보완
            if (prompt.split(/\s+/).length < 20) {
              prompt += ', professional commercial photography, high quality, detailed, cinematic lighting, 4K resolution';
            }
          } else {
            // 기본 프롬프트 생성
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
      
      // 부족한 씬은 기본값으로 채우기
      while (scenes.length < sceneCount) {
        const sceneNumber = scenes.length + 1;
        scenes.push({
          sceneNumber: sceneNumber,
          title: `Scene ${sceneNumber}`,
          prompt: `${conceptName} scene ${sceneNumber}, professional commercial advertisement, cinematic lighting, high quality, detailed composition, 4K resolution`,
          duration: 2
        });
      }
      
      // 씬 정렬 및 제한
      scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
      scenes.splice(sceneCount); // sceneCount로 제한
      
      results.push({
        concept_id: conceptId,
        name: conceptName,
        imagePrompts: scenes
      });
    }
    
    console.log('[parseMultiStoryboards] 최종 파싱된 컨셉 수:', results.length);
    return results;
    
  } catch (error) {
    console.error('[parseMultiStoryboards] 파싱 오류:', error.message);
    return generateFallbackStoryboards(sceneCount);
  }
}

// 폴백 스토리보드 생성
function generateFallbackStoryboards(sceneCount) {
  console.log('[generateFallbackStoryboards] 폴백 스토리보드 생성, sceneCount:', sceneCount);
  
  const fallbackConcepts = [
    'Cinematic Professional',
    'Modern Minimalist', 
    'Vibrant Dynamic',
    'Natural Lifestyle',
    'Premium Luxury',
    'Tech Innovation'
  ];
  
  return fallbackConcepts.map((conceptName, index) => {
    const conceptId = index + 1;
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
  });
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
    console.log(`[storyboard-init] 시작 - videoSec=${videoSec} sceneCount=${sceneCount}`);

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
    
    if(conceptsArr.length !== 6) {
      console.warn(`[storyboard-init] 컨셉 수 부족 (${conceptsArr.length}/6), 폴백 사용`);
    }

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
                            { name: concept.concept_name, imagePrompts: [] };
      
      // 이미지 프롬프트가 부족하면 보충
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
      
      // sceneCount로 제한
      imagePrompts = imagePrompts.slice(0, sceneCount);
      
      return {
        concept_id: concept.concept_id,
        style: concept.concept_name,
        name: concept.concept_name,
        summary: concept.summary,
        keywords: concept.keywords,
        imagePrompts: imagePrompts,
        images: [] // 이미지는 나중에 추가됨
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
      총이미지프롬프트: response.metadata.totalImagePrompts
    });

    res.status(200).json(response);

  }catch(e){
    console.error('[storyboard-init] 전체 오류:', e);
    
    // 에러 발생시에도 기본 스타일 반환 (완전 실패 방지)
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

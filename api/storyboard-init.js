// api/storyboard-init.js - 2025년 최신 Gemini 2.5 사용

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 2025년 최신 모델 체인 (Gemini 2.5 우선)
const MODEL_CHAIN = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  process.env.FALLBACK_GEMINI_MODEL || 'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
].filter(Boolean);

const MAX_ATTEMPTS = 16;
const BASE_BACKOFF = 2500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Gemini API 키 가져오기
function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || 
         process.env.VITE_GEMINI_API_KEY || 
         process.env.REACT_APP_GEMINI_API_KEY;
}

// 재시도 가능한 에러 판단
function isRetryable(error) {
  const status = error?.status;
  const message = (error?.message || '').toLowerCase();
  
  // HTTP 상태코드 기반
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  
  // 메시지 기반
  if (message.includes('overload') || message.includes('overloaded')) return true;
  if (message.includes('quota') || message.includes('rate limit')) return true;
  if (message.includes('timeout') || message.includes('503')) return true;
  if (message.includes('temporarily unavailable')) return true;
  if (message.includes('service unavailable')) return true;
  
  return false;
}

// 강화된 Gemini 2.5 호출 함수
async function callGemini2_5(genAI, prompt, label) {
  let attempt = 0;
  
  for (const modelName of MODEL_CHAIN) {
    console.log(`[${label}] 모델 ${modelName} 시도 시작`);
    
    for (let modelAttempt = 1; modelAttempt <= 3; modelAttempt++) {
      attempt++;
      console.log(`[${label}] ${modelName} 시도 ${modelAttempt}/3 (전체 ${attempt}/${MAX_ATTEMPTS})`);
      
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.8,
            maxOutputTokens: 8192,
          },
          safetySettings: [
            {
              category: 'HARM_CATEGORY_HARASSMENT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_HATE_SPEECH',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              threshold: 'BLOCK_NONE',
            },
          ],
        });
        
        const startTime = Date.now();
        
        // 타임아웃 설정
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90초
        
        const result = await Promise.race([
          model.generateContent(prompt),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Custom timeout')), 85000)
          )
        ]);
        
        clearTimeout(timeoutId);
        
        if (!result || !result.response) {
          throw new Error('응답 객체가 없음');
        }
        
        const text = result.response.text();
        const duration = Date.now() - startTime;
        
        console.log(`[${label}] ✅ 성공 model=${modelName} 시간=${duration}ms 길이=${text.length}자`);
        
        if (!text || text.length < 20) {
          throw new Error('응답이 너무 짧음');
        }
        
        return text;
        
      } catch (error) {
        console.warn(`[${label}] ❌ 실패 model=${modelName} 시도=${modelAttempt}: ${error.message}`);
        
        // 503 과부하면 즉시 다음 모델로
        if (error.message.includes('503') || error.message.includes('overload')) {
          console.log(`[${label}] 🔄 과부하 감지, 다음 모델로 즉시 전환`);
          break;
        }
        
        // 재시도 가능하면 잠시 대기 후 같은 모델로 재시도
        if (isRetryable(error) && modelAttempt < 3) {
          const delay = BASE_BACKOFF * modelAttempt + Math.random() * 1000;
          console.log(`[${label}] ⏳ ${delay}ms 후 같은 모델로 재시도`);
          await sleep(delay);
        }
      }
    }
    
    // 다음 모델로 넘어가기 전 잠시 대기
    const modelIndex = MODEL_CHAIN.indexOf(modelName);
    if (modelIndex < MODEL_CHAIN.length - 1) {
      console.log(`[${label}] 🔄 모델 ${modelName} 완전 실패, 다음 모델로 전환`);
      await sleep(2000);
    }
  }
  
  throw new Error(`${label} 완전 실패: 모든 모델 (${MODEL_CHAIN.join(', ')}) 시도 완료`);
}

// 강화된 컨셉 파싱 (JSON 구조 복구)
function parseConceptsRobust(text) {
  console.log('[parseConceptsRobust] 파싱 시작, 텍스트 길이:', text.length);
  
  try {
    // 1차: 완전한 JSON 배열 추출 시도
    const jsonArrayPattern = /\[\s*\{[\s\S]*?\}\s*\]/;
    const jsonMatch = text.match(jsonArrayPattern);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length >= 4) {
          console.log('[parseConceptsRobust] ✅ JSON 배열 파싱 성공:', parsed.length);
          
          // 6개로 정규화
          const normalized = parsed.slice(0, 6);
          while (normalized.length < 6) {
            normalized.push(createFallbackConcept(normalized.length + 1));
          }
          
          return normalized.map((item, index) => ({
            concept_id: item.concept_id || (index + 1),
            concept_name: item.concept_name || `컨셉 ${index + 1}`,
            summary: item.summary || `컨셉 ${index + 1} 설명`,
            keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 5) : 
                     [`키워드${index + 1}-1`, `키워드${index + 1}-2`, `키워드${index + 1}-3`, `키워드${index + 1}-4`, `키워드${index + 1}-5`]
          }));
        }
      } catch (jsonError) {
        console.warn('[parseConceptsRobust] JSON 파싱 실패:', jsonError.message);
      }
    }
    
    // 2차: 라인별 패턴 매칭으로 복구
    const concepts = new Map();
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // concept_id 패턴
      const idMatch = trimmed.match(/["\']?concept_id["\']?\s*:\s*(\d+)/i);
      if (idMatch) {
        const id = parseInt(idMatch[1]);
        if (!concepts.has(id)) {
          concepts.set(id, { concept_id: id, concept_name: '', summary: '', keywords: [] });
        }
      }
      
      // concept_name 패턴
      const nameMatch = trimmed.match(/["\']?concept_name["\']?\s*:\s*["\']([^"']+)["\']?/i);
      if (nameMatch) {
        // 가장 최근 ID에 매핑
        const lastId = Math.max(...Array.from(concepts.keys()));
        if (concepts.has(lastId)) {
          concepts.get(lastId).concept_name = nameMatch[1];
        }
      }
      
      // summary 패턴
      const summaryMatch = trimmed.match(/["\']?summary["\']?\s*:\s*["\']([^"']+)["\']?/i);
      if (summaryMatch) {
        const lastId = Math.max(...Array.from(concepts.keys()));
        if (concepts.has(lastId)) {
          concepts.get(lastId).summary = summaryMatch[1];
        }
      }
      
      // keywords 배열 패턴
      const keywordsMatch = trimmed.match(/["\']?keywords["\']?\s*:\s*\[(.*?)\]/i);
      if (keywordsMatch) {
        const keywordStr = keywordsMatch[1];
        const keywords = keywordStr.split(',')
          .map(k => k.trim().replace(/["\[\]']/g, ''))
          .filter(k => k.length > 0)
          .slice(0, 5);
        
        const lastId = Math.max(...Array.from(concepts.keys()));
        if (concepts.has(lastId)) {
          concepts.get(lastId).keywords = keywords;
        }
      }
    }
    
    console.log('[parseConceptsRobust] 라인 파싱 결과:', concepts.size);
    
    // 6개 컨셉으로 정규화
    const result = [];
    for (let i = 1; i <= 6; i++) {
      if (concepts.has(i) && concepts.get(i).concept_name && concepts.get(i).summary) {
        const concept = concepts.get(i);
        result.push({
          concept_id: i,
          concept_name: concept.concept_name,
          summary: concept.summary,
          keywords: concept.keywords.length > 0 ? concept.keywords : 
                   [`키워드${i}-1`, `키워드${i}-2`, `키워드${i}-3`, `키워드${i}-4`, `키워드${i}-5`]
        });
      } else {
        result.push(createFallbackConcept(i));
      }
    }
    
    console.log('[parseConceptsRobust] ✅ 최종 파싱 성공:', result.length);
    return result;
    
  } catch (error) {
    console.error('[parseConceptsRobust] ❌ 전체 파싱 실패:', error.message);
    return createFallbackConcepts();
  }
}

// 폴백 컨셉 생성 (고정 6개 컨셉 사용)
function createFallbackConcept(conceptId) {
  const fixedConcepts = [
    {
      name: '욕망의 시각화',
      desc: '타겟 오디언스의 심리적 욕구를 감각적이고 몰입감 높은 장면으로 구현',
      keywords: ["감각적", "몰입", "욕구충족", "심리적", "시각화"]
    },
    {
      name: '이질적 조합의 미학',
      desc: '브랜드와 관련 없는 이질적 요소를 결합하여 신선한 충격과 주목도 유발',
      keywords: ["이질적", "충격", "주목도", "창의적", "의외성"]
    },
    {
      name: '핵심 가치의 극대화',
      desc: '브랜드의 핵심 강점을 시각적/감정적으로 과장하여 각인 효과 극대화',
      keywords: ["핵심가치", "과장", "각인", "강점", "브랜드"]
    },
    {
      name: '기회비용의 시각화',
      desc: '제품/서비스 미사용시 손해를 구체적으로 묘사하여 필요성 강조',
      keywords: ["기회비용", "손해", "필요성", "구체적", "위험"]
    },
    {
      name: '트렌드 융합',
      desc: '최신 트렌드와 바이럴 요소를 브랜드와 융합하여 친밀감과 화제성 증폭',
      keywords: ["트렌드", "바이럴", "융합", "친밀감", "화제성"]
    },
    {
      name: '파격적 반전',
      desc: '예측 불가능한 스토리와 반전 요소로 강한 인상과 재미를 선사',
      keywords: ["반전", "예측불가", "인상적", "재미", "병맛"]
    }
  ];
  
  const concept = fixedConcepts[conceptId - 1] || fixedConcepts[0];
  
  return {
    concept_id: conceptId,
    concept_name: concept.name,
    summary: concept.desc,
    keywords: concept.keywords
  };
}

function createFallbackConcepts() {
  return Array.from({ length: 6 }, (_, i) => createFallbackConcept(i + 1));
}

// 비디오 길이 파싱
function parseVideoLengthSeconds(raw) {
  if (raw == null) return 10;
  if (typeof raw === 'number') return Math.max(10, Math.min(60, raw));
  
  const str = String(raw);
  const numMatch = str.match(/(\d+)/);
  if (!numMatch) return 10;
  
  const num = parseInt(numMatch[1], 10);
  return Math.max(10, Math.min(60, isNaN(num) ? 10 : num));
}

// 씬 개수 계산 (2초당 1씬)
function calcSceneCount(videoSeconds) {
  const count = Math.floor(videoSeconds / 2);
  return Math.max(3, Math.min(15, count)); // 최소 3개, 최대 15개 씬
}

// 브리프 생성 프롬프트
function buildBriefPrompt(formData) {
  return `당신은 세계적으로 유명한 광고 크리에이티브 디렉터입니다. 다음 브랜드 정보를 바탕으로 창의적이고 전략적인 광고 브리프를 작성해주세요.

브랜드 정보:
- 브랜드명: ${formData.brandName || '미정'}
- 산업분야: ${formData.industryCategory || '일반'}
- 제품/서비스: ${formData.productServiceCategory || '미정'}
- 영상 목적: ${formData.videoPurpose || '브랜드 인지도 향상'}
- 영상 길이: ${formData.videoLength || '30초'}
- 핵심 타겟: ${formData.coreTarget || '일반 소비자'}
- 핵심 차별점: ${formData.coreDifferentiation || '미정'}
- 추가 요구사항: ${formData.videoRequirements || '없음'}

이 정보를 바탕으로 브랜드의 핵심 가치, 타겟 고객의 인사이트, 경쟁 환경 분석, 그리고 창의적 방향성을 포함한 종합적인 광고 전략 브리프를 작성해주세요. 실제 광고 제작에 바로 활용할 수 있을 정도로 구체적이고 실용적으로 작성해주세요.`;
}

뜻하고 진정성 있는 이야기 중심 접근 방식",
    "keywords": ["감성", "스토리", "공감", "진정성", "경험"]
  },
  {
    "concept_id": 2,
    "concept_name": "제품 중심 쇼케이스",
    "summary": "제품의 핵심 기능과 차별화된 장점을 명확하고 직관적으로 부각하는 방식",
    "keywords": ["기능", "품질", "성능", "차별화", "전문성"]
  },
  {
    "concept_id": 3,
    "concept_name": "라이프스타일 통합",
    "summary": "일상 속에서 자연스럽게 녹아드는 브랜드 경험과 라이프스타일 연출",
    "keywords": ["일상", "자연스러움", "라이프스타일", "편리함", "통합"]
  },
  {
    "concept_id": 4,
    "concept_name": "프리미엄 포지셔닝",
    "summary": "고급스럽고 세련된 이미지로 브랜드의 프리미엄 가치를 극대화",
    "keywords": ["고급", "세련", "프리미엄", "품격", "가치"]
  },
  {
    "concept_id": 5,
    "concept_name": "혁신적 비전",
    "summary": "미래지향적이고 창의적인 브랜드 철학과 혁신 기술력을 강조",
    "keywords": ["혁신", "미래", "기술", "창의", "비전"]
  },
  {
    "concept_id": 6,
    "concept_name": "신뢰와 전문성",
    "summary": "전문성과 신뢰성을 바탕으로 한 권위있고 안정적인 브랜드 이미지",
    "keywords": ["신뢰", "전문성", "안정", "권위", "신용"]
  }
]`;
}

// 멀티 스토리보드 생성 프롬프트
function buildMultiStoryboardPrompt(brief, conceptsJson, sceneCount, videoSec) {
  return `다음 광고 브리프와 6개 컨셉을 바탕으로, 각 컨셉별로 ${sceneCount}개의 씬을 가진 상세한 스토리보드를 생성해주세요.

광고 브리프:
${brief}

컨셉들:
${conceptsJson}

총 영상 길이: ${videoSec}초 (각 씬 약 2초)

각 컨셉에 대해 다음과 같은 정확한 형식으로 작성해주세요:

### Concept 1: 감성적 스토리텔링
#### Scene 1 (0:00-0:02)
- **Image Prompt**: A warm, emotional scene showing a family gathering around a dinner table, soft golden hour lighting streaming through windows, professional commercial photography, high quality, detailed faces showing genuine happiness, 4K resolution, cinematic composition

#### Scene 2 (0:02-0:04)  
- **Image Prompt**: Close-up of hands preparing food with care and attention, natural kitchen lighting, steam rising from freshly cooked meal, professional food photography, warm color palette, detailed textures, commercial quality

(${sceneCount}개 씬까지 계속...)

### Concept 2: 제품 중심 쇼케이스
#### Scene 1 (0:00-0:02)
- **Image Prompt**: Product hero shot on clean white background, professional studio lighting, sharp focus on product details, commercial photography, premium presentation, 4K quality, minimal composition

(각 컨셉마다 ${sceneCount}개씩 총 6개 컨셉 작성)

중요사항:
- 각 Image Prompt는 영어로 작성하고 70-100단어 길이로 상세하게
- 상업적 광고 촬영에 적합한 구체적 지시사항 포함
- professional, commercial, high quality, detailed, 4K 등 품질 키워드 필수 포함
- 각 씬은 정확히 2초 분량으로 계획`;
}

// 스토리보드 파싱 (다중 컨셉)
function parseMultiStoryboards(rawText, sceneCount) {
  console.log('[parseMultiStoryboards] 파싱 시작, sceneCount:', sceneCount);
  
  const results = [];
  if (!rawText || typeof rawText !== 'string') {
    console.warn('[parseMultiStoryboards] 빈 응답, 폴백 생성');
    return generateFallbackStoryboards(sceneCount);
  }

  try {
    // 각 컨셉 블록 추출
    const conceptPattern = /#{1,3}\s*Concept\s+(\d+)[\s\S]*?(?=#{1,3}\s*Concept\s+\d+|$)/gi;
    const conceptMatches = [...rawText.matchAll(conceptPattern)];
    
    console.log('[parseMultiStoryboards] 발견된 컨셉 블록:', conceptMatches.length);

    for (let i = 0; i < Math.min(conceptMatches.length, 6); i++) {
      const conceptMatch = conceptMatches[i];
      const conceptId = parseInt(conceptMatch[1], 10);
      const blockContent = conceptMatch[0];
      
      // 컨셉명 추출
      const nameMatch = blockContent.match(/Concept\s+\d+:\s*([^\n]+)/i);
      const conceptName = nameMatch ? nameMatch[1].trim() : `Concept ${conceptId}`;
      
      console.log('[parseMultiStoryboards] 처리 중:', conceptId, conceptName);
      
      // 씬들 추출
      const scenes = [];
      const scenePattern = /#{1,4}\s*Scene\s+(\d+)[^#]*?\*\*Image Prompt\*\*:\s*([\s\S]*?)(?=#{1,4}\s*Scene|\n#{1,3}\s*Concept|$)/gi;
      const sceneMatches = [...blockContent.matchAll(scenePattern)];
      
      console.log(`[parseMultiStoryboards] 컨셉 ${conceptId} 씬 발견:`, sceneMatches.length);
      
      for (const sceneMatch of sceneMatches) {
        const sceneNumber = parseInt(sceneMatch[1], 10);
        let prompt = sceneMatch[2] ? sceneMatch[2].trim() : '';
        
        if (sceneNumber <= sceneCount && sceneNumber > 0) {
          // 프롬프트 정제
          prompt = prompt
            .replace(/\*\*/g, '')
            .replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          // 너무 짧으면 기본 키워드 추가
          if (prompt.split(' ').length < 15) {
            prompt += `, professional commercial photography, high quality, detailed, 4K resolution, cinematic lighting`;
          }
          
          scenes.push({
            sceneNumber: sceneNumber,
            title: `Scene ${sceneNumber}`,
            prompt: prompt,
            duration: 2
          });
        }
      }
      
      // 부족한 씬 보완
      while (scenes.length < sceneCount) {
        const sceneNumber = scenes.length + 1;
        scenes.push({
          sceneNumber: sceneNumber,
          title: `Scene ${sceneNumber}`,
          prompt: `${conceptName} professional commercial scene ${sceneNumber}, high quality advertising photography, detailed composition, 4K resolution, professional lighting`,
          duration: 2
        });
      }
      
      // 씬 정렬 및 개수 제한
      scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
      scenes.splice(sceneCount);
      
      results.push({
        concept_id: conceptId,
        name: conceptName,
        imagePrompts: scenes
      });
    }
    
    // 부족한 컨셉 보완
    while (results.length < 6) {
      const conceptId = results.length + 1;
      results.push(generateFallbackStoryboard(conceptId, sceneCount));
    }
    
    console.log('[parseMultiStoryboards] ✅ 파싱 완료:', results.length);
    return results;
    
  } catch (error) {
    console.error('[parseMultiStoryboards] ❌ 파싱 오류:', error.message);
    return generateFallbackStoryboards(sceneCount);
  }
}

function generateFallbackStoryboard(conceptId, sceneCount) {
  const fallbackNames = [
    'Professional Showcase',
    'Lifestyle Integration', 
    'Product Excellence',
    'Customer Experience',
    'Brand Innovation',
    'Premium Quality'
  ];
  
  const conceptName = fallbackNames[conceptId - 1] || `Concept ${conceptId}`;
  const scenes = [];
  
  for (let i = 1; i <= sceneCount; i++) {
    scenes.push({
      sceneNumber: i,
      title: `Scene ${i}`,
      prompt: `${conceptName} professional commercial advertisement scene ${i}, high quality product photography, detailed composition, professional lighting, 4K resolution, clean background, commercial style`,
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

export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();
  
  try {
    const { formData } = req.body || {};
    if (!formData) {
      return res.status(400).json({ error: 'formData required' });
    }

    const videoSec = parseVideoLengthSeconds(formData.videoLength);
    const sceneCount = calcSceneCount(videoSec);
    
    console.log(`[storyboard-init] 🎬 시작 - 비디오=${videoSec}초, 씬=${sceneCount}개, 모델체인=[${MODEL_CHAIN.join(', ')}]`);

    // API 키 확인
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      console.error('[storyboard-init] ❌ Gemini API 키 없음');
      throw new Error('Gemini API Key가 설정되지 않았습니다');
    }
    
    console.log('[storyboard-init] ✅ API 키 확인됨:', apiKey.substring(0, 10) + '...');
    
    const genAI = new GoogleGenerativeAI(apiKey);

    // 1단계: 크리에이티브 브리프 생성
    console.log('[storyboard-init] 🎯 1단계: 크리에이티브 브리프 생성');
    const briefPrompt = buildBriefPrompt(formData);
    const briefOut = await callGemini2_5(genAI, briefPrompt, '1-brief');
    console.log(`[storyboard-init] ✅ 1단계 완료, 브리프 길이: ${briefOut.length}자`);
    
    // 2단계: 6개 컨셉 생성
    console.log('[storyboard-init] 🎨 2단계: 6개 컨셉 생성');
    const conceptsPrompt = buildConceptsPrompt(briefOut, formData);
    const conceptsOut = await callGemini2_5(genAI, conceptsPrompt, '2-concepts');
    const conceptsArr = parseConceptsRobust(conceptsOut);
    console.log(`[storyboard-init] ✅ 2단계 완료, 컨셉: ${conceptsArr.length}개`);
    
    // 3단계: 멀티 스토리보드 생성
    console.log('[storyboard-init] 📝 3단계: 멀티 스토리보드 생성');
    let parsedStoryboards = [];
    try {
      const multiPrompt = buildMultiStoryboardPrompt(briefOut, JSON.stringify(conceptsArr, null, 2), sceneCount, videoSec);
      const multiOut = await callGemini2_5(genAI, multiPrompt, '3-multi-storyboards');
      parsedStoryboards = parseMultiStoryboards(multiOut, sceneCount);
      console.log(`[storyboard-init] ✅ 3단계 완료, 스토리보드: ${parsedStoryboards.length}개`);
    } catch (multiError) {
      console.error('[storyboard-init] ⚠️ 3단계 실패, 폴백 사용:', multiError.message);
      parsedStoryboards = generateFallbackStoryboards(sceneCount);
    }
    
    // 최종 스타일 데이터 구성
    const styles = conceptsArr.map((concept, index) => {
      const storyboardData = parsedStoryboards.find(p => p.concept_id === concept.concept_id) || 
                            parsedStoryboards[index] || 
                            generateFallbackStoryboard(concept.concept_id, sceneCount);
      
      let imagePrompts = storyboardData.imagePrompts || [];
      
      // 씬 수 정규화
      while (imagePrompts.length < sceneCount) {
        const sceneNum = imagePrompts.length + 1;
        imagePrompts.push({
          sceneNumber: sceneNum,
          title: `Scene ${sceneNum}`,
          duration: 2,
          prompt: `${concept.concept_name} professional commercial scene ${sceneNum}, high quality advertising photography, detailed composition, 4K resolution, professional lighting`
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
        images: [] // 이미지는 다음 단계에서 생성
      };
    });

    // 최종 응답 구성
    const response = {
      success: true,
      styles: styles,
      metadata: {
        videoLengthSeconds: videoSec,
        sceneCountPerConcept: sceneCount,
        modelChain: MODEL_CHAIN,
        totalProcessingTime: Date.now() - startTime,
        conceptsGenerated: conceptsArr.length,
        storyboardsGenerated: parsedStoryboards.length,
        totalImagePrompts: styles.reduce((sum, s) => sum + s.imagePrompts.length, 0),
        geminiVersion: '2.5-flash',
        apiProvider: 'Google Gemini 2.5'
      }
    };

    const processingTime = Date.now() - startTime;
    console.log(`[storyboard-init] 🎉 전체 완료! 시간=${processingTime}ms, 컨셉=${styles.length}개, 총프롬프트=${response.metadata.totalImagePrompts}개`);

    res.status(200).json(response);

  } catch (error) {
    console.error('[storyboard-init] ❌ 전체 시스템 오류:', error);
    
    // 폴백 응답 시도
    try {
      const videoSec = parseVideoLengthSeconds(req.body?.formData?.videoLength);
      const sceneCount = calcSceneCount(videoSec);
      const fallbackStyles = generateFallbackStoryboards(sceneCount).map(fb => ({
        concept_id: fb.concept_id,
        style: fb.name,
        name: fb.name,
        summary: `${fb.name} 스타일의 기본 스토리보드`,
        keywords: ['professional', 'commercial', 'advertisement', 'quality', 'brand'],
        imagePrompts: fb.imagePrompts,
        images: []
      }));
      
      console.log('[storyboard-init] 🆘 폴백 응답 반환');
      res.status(200).json({
        success: true,
        styles: fallbackStyles,
        metadata: {
          videoLengthSeconds: videoSec,
          sceneCountPerConcept: sceneCount,
          totalProcessingTime: Date.now() - startTime,
          fallback: true,
          error: error.message,
          modelChain: MODEL_CHAIN
        }
      });
      
    } catch (fallbackError) {
      console.error('[storyboard-init] ❌ 폴백도 실패:', fallbackError);
      res.status(500).json({
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
}

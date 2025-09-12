// api/storyboard-init.js
// - Gemini 2.5 모델 체인
// - 브랜드/제품 이미지 플래그 & 영상비율(aspectRatioCode) 반영
// - 1/2단계 로깅
// - third prompt(멀티 스토리보드) 컨텍스트/변수 확장 + 카메라 브랜드 남용 방지
// - Image Prompt 연동 강화: 브랜드/제품/타겟/목적/차별점 → 각 씬 묘사 우선, 카메라 장비 언급은 후순위(브랜드 미기재)

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

function mapUserAspectRatio(value) {
  if (!value) return 'widescreen_16_9';
  if (typeof value !== 'string') return 'widescreen_16_9';
  if (value.includes('16:9') || value.includes('가로')) return 'widescreen_16_9';
  if (value.includes('9:16') || value.includes('세로')) return 'vertical_9_16';
  if (value.includes('1:1') || value.includes('정사각')) return 'square_1_1';
  return 'widescreen_16_9';
}

const MODEL_CHAIN = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash',
  process.env.FALLBACK_GEMINI_MODEL || 'gemini-2.5-flash-lite'
].filter(Boolean);

const MAX_ATTEMPTS = 16;
const BASE_BACKOFF = 2500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || 
         process.env.VITE_GEMINI_API_KEY || 
         process.env.REACT_APP_GEMINI_API_KEY;
}

function isRetryable(error) {
  const status = error?.status;
  const message = (error?.message || '').toLowerCase();
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  if (message.includes('overload') || message.includes('overloaded')) return true;
  if (message.includes('quota') || message.includes('rate limit')) return true;
  if (message.includes('timeout') || message.includes('503')) return true;
  if (message.includes('temporarily unavailable')) return true;
  if (message.includes('service unavailable')) return true;
  return false;
}

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
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        });
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        const result = await Promise.race([
          model.generateContent(prompt),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Custom timeout')), 85000))
        ]);
        clearTimeout(timeoutId);

        if (!result || !result.response) throw new Error('응답 객체가 없음');
        const text = result.response.text();
        const duration = Date.now() - startTime;
        console.log(`[${label}] ✅ 성공 model=${modelName} 시간=${duration}ms 길이=${text.length}자`);
        if (modelName === 'gemini-2.5-flash-lite') {
          console.warn(`[${label}] 🚨🚨🚨 경고: gemini-2.5-flash-lite 모델이 사용되었습니다! 🚨🚨🚨`);
        }

        if (label === '1-brief') {
          const preview = text.replace(/\s+/g, ' ').slice(0, 70);
            console.log(`[${label}] 🔍 응답 프리뷰(앞70자): ${preview}${text.length > 70 ? '...' : ''}`);
        }

        if (!text || text.length < 20) throw new Error('응답이 너무 짧음');
        return text;
      } catch (error) {
        console.warn(`[${label}] ❌ 실패 model=${modelName} 시도=${modelAttempt}: ${error.message}`);
        if (error.message.includes('503') || error.message.includes('overload')) {
          console.log(`[${label}] 🔄 과부하 감지, 다음 모델로 즉시 전환`);
          break;
        }
        if (isRetryable(error) && modelAttempt < (modelName === 'gemini-2.5-flash' ? 5 : 3)) {
          const delay = BASE_BACKOFF * modelAttempt + Math.random() * 1000;
          console.log(`[${label}] ⏳ ${delay}ms 후 같은 모델로 재시도`);
          await sleep(delay);
        }
      }
    }
    const modelIndex = MODEL_CHAIN.indexOf(modelName);
    if (modelIndex < MODEL_CHAIN.length - 1) {
      console.log(`[${label}] 🔄 모델 ${modelName} 완전 실패, 다음 모델로 전환`);
      await sleep(2000);
    }
  }
  throw new Error(`${label} 완전 실패: 모든 모델 (${MODEL_CHAIN.join(', ')}) 시도 완료`);
}

function loadPromptFile(filename) {
  const filePath = path.resolve(process.cwd(), 'public', filename);
  if (!fs.existsSync(filePath)) {
    console.error(`프롬프트 파일 없음: ${filename}`);
    throw new Error(`프롬프트 파일 없음: ${filename}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function buildBriefPrompt(formData) {
  try {
    const inputPrompt = loadPromptFile('input_prompt.txt');
    return inputPrompt
      .replaceAll('{{brandName}}', String(formData.brandName || ''))
      .replaceAll('{{industryCategory}}', String(formData.industryCategory || ''))
      .replaceAll('{{videoLength}}', String(parseVideoLengthSeconds(formData.videoLength)))
      .replaceAll('{{coreTarget}}', String(formData.coreTarget || ''))
      .replaceAll('{{coreDifferentiation}}', String(formData.coreDifferentiation || ''))
      .replaceAll('{{videoPurpose}}', String(formData.videoPurpose || ''));
  } catch (error) {
    console.error('input_prompt.txt 로드 실패:', error);
    return `당신은 전문 크리에이티브 디렉터입니다. 다음 브랜드 정보를 바탕으로 광고 전략을 수립하세요:
브랜드명: ${formData.brandName || ''}
산업분야: ${formData.industryCategory || ''}
영상 목적: ${formData.videoPurpose || ''}
영상 길이: ${formData.videoLength || ''}
핵심 타겟: ${formData.coreTarget || ''}
차별점: ${formData.coreDifferentiation || ''}
위 정보를 바탕으로 창의적인 광고 전략과 방향성을 제시하세요.`;
  }
}

function buildConceptsPrompt(brief, formData) {
  try {
    const secondPrompt = loadPromptFile('second_prompt.txt');
    return secondPrompt
      .replaceAll('{{brief}}', brief)
      .replaceAll('{{brandName}}', String(formData.brandName || ''))
      .replaceAll('{{videoLength}}', String(parseVideoLengthSeconds(formData.videoLength)))
      .replaceAll('{{videoPurpose}}', String(formData.videoPurpose || ''));
  } catch (error) {
    console.error('second_prompt.txt 로드 실패:', error);
    return `다음은 브리프입니다: ${brief}

아래 6가지 고정 컨셉을 JSON 배열로만 응답하세요: [...]`;
  }
}

// -------------------- 멀티 스토리보드 prompt 확장 --------------------
function buildMultiStoryboardPrompt(
  brief,
  conceptsJson,
  sceneCount,
  videoSec,
  formData
) {
  try {
    const thirdPrompt = loadPromptFile('third_prompt.txt');
    return thirdPrompt
      .replaceAll('{{brief}}', brief)
      .replaceAll('{{concepts_json}}', conceptsJson)
      .replaceAll('{{scene_count}}', String(sceneCount))
      .replaceAll('{{video_length_seconds}}', String(videoSec))
      // 새 placeholder 추가 치환
      .replaceAll('{{brandName}}', String(formData.brandName || ''))
      .replaceAll('{{industryCategory}}', String(formData.industryCategory || ''))
      .replaceAll('{{productServiceCategory}}', String(formData.productServiceCategory || ''))
      .replaceAll('{{productServiceName}}', String(formData.productServiceName || ''))
      .replaceAll('{{videoPurpose}}', String(formData.videoPurpose || ''))
      .replaceAll('{{coreTarget}}', String(formData.coreTarget || ''))
      .replaceAll('{{coreDifferentiation}}', String(formData.coreDifferentiation || ''))
      .replaceAll('{{aspect_ratio_code}}', String(formData.aspectRatioCode || 'widescreen_16_9'));
  } catch (error) {
    console.error('third_prompt.txt 로드 실패:', error);
    return `브리프: ${brief}\n컨셉들: ${conceptsJson}\n(Scene Format fallback)`;
  }
}

// --------------- 컨셉 JSON 파싱 로직 (기존 유지) ---------------
function parseConceptsRobust(text) {
  console.log('[parseConceptsRobust] 파싱 시작, 텍스트 길이:', text.length);
  try {
    const jsonArrayPattern = /\[\s*\{[\s\S]*?\}\s*\]/;
    const jsonMatch = text.match(jsonArrayPattern);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length >= 4) {
          console.log('[parseConceptsRobust] ✅ JSON 배열 파싱 성공:', parsed.length);
          const normalized = parsed.slice(0, 6);
          while (normalized.length < 6) normalized.push(createFallbackConcept(normalized.length + 1));
          return normalized.map((item, index) => ({
            concept_id: item.concept_id || (index + 1),
            concept_name: item.concept_name || `컨셉 ${index + 1}`,
            summary: item.summary || `컨셉 ${index + 1} 설명`,
            keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 5) :
              [`키워드${index + 1}-1`,`키워드${index + 1}-2`,`키워드${index + 1}-3`,`키워드${index + 1}-4`,`키워드${index + 1}-5`]
          }));
        }
      } catch (e) {
        console.warn('[parseConceptsRobust] JSON 파싱 실패:', e.message);
      }
    }
    const concepts = new Map();
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      const idMatch = trimmed.match(/["']?concept_id["']?\s*:\s*(\d+)/i);
      if (idMatch) {
        const id = parseInt(idMatch[1]);
        if (!concepts.has(id)) concepts.set(id, { concept_id: id, concept_name: '', summary: '', keywords: [] });
      }
      const nameMatch = trimmed.match(/["']?concept_name["']?\s*:\s*["']([^"']+)["']?/i);
      if (nameMatch) {
        const lastId = Math.max(...Array.from(concepts.keys()));
        if (concepts.has(lastId)) concepts.get(lastId).concept_name = nameMatch[1];
      }
      const summaryMatch = trimmed.match(/["']?summary["']?\s*:\s*["']([^"']+)["']?/i);
      if (summaryMatch) {
        const lastId = Math.max(...Array.from(concepts.keys()));
        if (concepts.has(lastId)) concepts.get(lastId).summary = summaryMatch[1];
      }
      const keywordsMatch = trimmed.match(/["']?keywords["']?\s*:\s*\[(.*?)\]/i);
      if (keywordsMatch) {
        const keywordStr = keywordsMatch[1];
        const keywords = keywordStr.split(',')
          .map(k => k.trim().replace(/["\[\]']/g, ''))
          .filter(k => k.length > 0)
          .slice(0, 5);
        const lastId = Math.max(...Array.from(concepts.keys()));
        if (concepts.has(lastId)) concepts.get(lastId).keywords = keywords;
      }
    }
    console.log('[parseConceptsRobust] 라인 파싱 결과:', concepts.size);
    const result = [];
    for (let i = 1; i <= 6; i++) {
      if (concepts.has(i) && concepts.get(i).concept_name && concepts.get(i).summary) {
        const c = concepts.get(i);
        result.push({
          concept_id: i,
          concept_name: c.concept_name,
          summary: c.summary,
          keywords: c.keywords.length ? c.keywords :
            [`키워드${i}-1`,`키워드${i}-2`,`키워드${i}-3`,`키워드${i}-4`,`키워드${i}-5`]
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

function createFallbackConcept(id) {
  const fixedConcepts = [
    { name:'욕망의 시각화',desc:'타겟 오디언스의 심리적 욕구를 감각적이고 몰입감 높은 장면으로 구현',keywords:["감각적","몰입","욕구충족","심리적","시각화"]},
    { name:'이질적 조합의 미학',desc:'브랜드와 관련 없는 이질적 요소를 결합하여 신선한 충격과 주목도 유발',keywords:["이질적","충격","주목도","창의적","의외성"]},
    { name:'핵심 가치의 극대화',desc:'브랜드의 핵심 강점을 시각적/감정적으로 과장하여 각인 효과 극대화',keywords:["핵심가치","과장","각인","강점","브랜드"]},
    { name:'기회비용의 시각화',desc:'제품/서비스 미사용시 손해를 구체적으로 묘사하여 필요성 강조',keywords:["기회비용","손해","필요성","구체적","위험"]},
    { name:'트렌드 융합',desc:'최신 트렌드와 바이럴 요소를 브랜드와 융합하여 친밀감과 화제성 증폭',keywords:["트렌드","바이럴","융합","친밀감","화제성"]},
    { name:'파격적 반전',desc:'예측 불가능한 스토리와 반전 요소로 강한 인상과 재미를 선사',keywords:["반전","예측불가","인상적","재미","병맛"]}
  ];
  const c = fixedConcepts[id - 1] || fixedConcepts[0];
  return { concept_id:id, concept_name:c.name, summary:c.desc, keywords:c.keywords };
}
function createFallbackConcepts() {
  return Array.from({ length: 6 }, (_, i) => createFallbackConcept(i + 1));
}

function parseMultiStoryboards(rawText, sceneCount) {
  console.log('[parseMultiStoryboards] 파싱 시작, sceneCount:', sceneCount);
  if (!rawText || typeof rawText !== 'string') {
    console.warn('[parseMultiStoryboards] 빈 응답, 폴백 생성');
    return generateFallbackStoryboards(sceneCount);
  }
  const results = [];
  try {
    const conceptPattern = /#{1,3}\s*Concept\s+(\d+)[\s\S]*?(?=#{1,3}\s*Concept\s+\d+|$)/gi;
    const conceptMatches = [...rawText.matchAll(conceptPattern)];
    console.log('[parseMultiStoryboards] 발견된 컨셉 블록:', conceptMatches.length);

    for (let i = 0; i < Math.min(conceptMatches.length, 6); i++) {
      const match = conceptMatches[i];
      const conceptId = parseInt(match[1], 10);
      const blockContent = match[0];
      const nameMatch = blockContent.match(/Concept\s+\d+:\s*([^\n]+)/i);
      const conceptName = nameMatch ? nameMatch[1].trim() : `Concept ${conceptId}`;
      console.log('[parseMultiStoryboards] 처리 중:', conceptId, conceptName);

      const scenes = [];
      const scenePattern = /#{1,4}\s*Scene\s+(\d+)[^#]*?\*\*Image Prompt\*\*:\s*([\s\S]*?)(?=#{1,4}\s*Scene|\n#{1,3}\s*Concept|$)/gi;
      const sceneMatches = [...blockContent.matchAll(scenePattern)];
      console.log(`[parseMultiStoryboards] 컨셉 ${conceptId} 씬 발견:`, sceneMatches.length);

      for (const s of sceneMatches) {
        const sceneNumber = parseInt(s[1], 10);
        let prompt = s[2] ? s[2].trim() : '';
        if (sceneNumber <= sceneCount && sceneNumber > 0) {
          prompt = prompt.replace(/\*\*/g,'').replace(/\n+/g,' ').replace(/\s+/g,' ').trim();
          if (prompt.split(' ').length < 15) {
            prompt += ', professional commercial photography, high quality, detailed, 4K resolution, cinematic lighting';
          }
          scenes.push({ sceneNumber, title:`Scene ${sceneNumber}`, prompt, duration:2 });
        }
      }
      while (scenes.length < sceneCount) {
        const next = scenes.length + 1;
        scenes.push({
          sceneNumber: next,
          title: `Scene ${next}`,
          prompt: `${conceptName} commercial scene ${next}, brand/product usage, high quality advertising photography, 4K resolution`,
          duration: 2
        });
      }
      scenes.sort((a,b)=>a.sceneNumber-b.sceneNumber);
      scenes.splice(sceneCount);
      results.push({ concept_id: conceptId, name: conceptName, imagePrompts: scenes });
    }
    while (results.length < 6) {
      results.push(generateFallbackStoryboard(results.length + 1, sceneCount));
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
    'Professional Showcase','Lifestyle Integration','Product Excellence',
    'Customer Experience','Brand Innovation','Premium Quality'
  ];
  const conceptName = fallbackNames[conceptId - 1] || `Concept ${conceptId}`;
  const scenes = [];
  for (let i = 1; i <= sceneCount; i++) {
    scenes.push({
      sceneNumber: i,
      title: `Scene ${i}`,
      prompt: `${conceptName} advertisement scene ${i}, brand usage, product visible, professional lighting, 4K`,
      duration: 2
    });
  }
  return { concept_id: conceptId, name: conceptName, imagePrompts: scenes };
}
function generateFallbackStoryboards(sceneCount) {
  return Array.from({ length: 6 }, (_, i) => generateFallbackStoryboard(i + 1, sceneCount));
}

function parseVideoLengthSeconds(raw) {
  if (raw == null) return 10;
  if (typeof raw === 'number') return Math.max(10, Math.min(60, raw));
  const m = String(raw).match(/(\d+)/);
  if (!m) return 10;
  const num = parseInt(m[1], 10);
  return Math.max(10, Math.min(60, isNaN(num) ? 10 : num));
}
function calcSceneCount(videoSeconds) {
  return Math.max(3, Math.min(15, Math.floor(videoSeconds / 2)));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();
  try {
    const { formData } = req.body || {};
    if (!formData) return res.status(400).json({ error: 'formData required' });

    formData.brandLogoProvided = !!(formData.brandLogoProvided || formData.brandLogo);
    formData.productImageProvided = !!(formData.productImageProvided || formData.productImage);
    formData.aspectRatioCode = mapUserAspectRatio(formData.videoAspectRatio);

    const videoSec = parseVideoLengthSeconds(formData.videoLength);
    const sceneCount = calcSceneCount(videoSec);

    console.log('[storyboard-init] 시작:', {
      videoSec, sceneCount,
      modelChain: MODEL_CHAIN,
      brandLogoProvided: formData.brandLogoProvided,
      productImageProvided: formData.productImageProvided,
      videoAspectRatio: formData.videoAspectRatio,
      aspectRatioCode: formData.aspectRatioCode
    });

    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error('Gemini API Key가 설정되지 않았습니다');
    const genAI = new GoogleGenerativeAI(apiKey);

    // 1단계
    let briefPrompt = buildBriefPrompt(formData);
    briefPrompt += `
---
(Flags)
Brand Logo Provided: ${formData.brandLogoProvided}
Product Image Provided: ${formData.productImageProvided}
Target Video Aspect Ratio: ${formData.videoAspectRatio || '미입력'} => ${formData.aspectRatioCode}
지시: 제공된 이미지가 있다면(로고/제품) 스토리 컨텍스트에 자연스럽게 등장할 기회 확보.`;
    const briefOut = await callGemini2_5(genAI, briefPrompt, '1-brief');

    // 2단계
    let conceptsPrompt = buildConceptsPrompt(briefOut, formData);
    conceptsPrompt += `
---
(Flags)
Brand Logo Provided: ${formData.brandLogoProvided}
Product Image Provided: ${formData.productImageProvided}
Target Video Aspect Ratio: ${formData.videoAspectRatio || '미입력'} => ${formData.aspectRatioCode}
지시: 컨셉 summary/keywords에 브랜드 또는 제품 사용 상황을 암시.`;
    console.log('[Gemini-2nd][INPUT_START]');
    console.log(conceptsPrompt);
    console.log('[Gemini-2nd][INPUT_END]');
    const conceptsOut = await callGemini2_5(genAI, conceptsPrompt, '2-concepts');
    console.log('[Gemini-2nd][RAW_OUTPUT_START]');
    console.log(conceptsOut);
    console.log('[Gemini-2nd][RAW_OUTPUT_END]');
    try {
      const jm = conceptsOut.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (jm) {
        console.log('[Gemini-2nd][PARSED_JSON_START]');
        console.log(JSON.stringify(JSON.parse(jm[0]), null, 2));
        console.log('[Gemini-2nd][PARSED_JSON_END]');
      }
    } catch (e) {
      console.warn('[Gemini-2nd] JSON 파싱 실패:', e.message);
    }
    const conceptsArr = parseConceptsRobust(conceptsOut);

    // 3단계 멀티 스토리보드
    let multiPrompt = buildMultiStoryboardPrompt(
      briefOut,
      JSON.stringify(conceptsArr, null, 2),
      sceneCount,
      videoSec,
      formData
    );

    // 추가 규칙 삽입: 카메라 브랜드 금지 & 컨텍스트 우선
    multiPrompt += `

---
(STRICT RULES EXTENSION)
1) DO NOT begin any Image Prompt with camera brand or "Camera:" token.
2) If camera/lens info is included, put it AFTER the brand/product usage & target scenario description, use generic terms (e.g., "professional 50mm prime lens") without brand names.
3) Each Image Prompt MUST explicitly reflect:
   - Brand: ${formData.brandName || '(미입력)'}
   - Product/Service: ${formData.productServiceName || formData.productServiceCategory || '(미입력)'}
   - Target Audience: ${formData.coreTarget || '(미입력)'}
   - Differentiation: ${formData.coreDifferentiation || '(미입력)'}
4) If brandLogoProvided=true include at least one mention of brand visibility or subtle logo placement (text or on-device) in at least one early scene (Scene 1 or 2) per concept.
5) If productImageProvided=true ensure product usage or tactile interaction is described (handling, using, viewing) across multiple scenes (not only last).
6) NEVER produce generic gear-ad style intros. Focus on the brand story & user scenario first.
7) Aspect Ratio Code (for planning, do not output literally): ${formData.aspectRatioCode}
8) Time per scene: 2 seconds, adjust timecodes precisely (MM:SS-MM:SS).`;

    let parsedStoryboards = [];
    try {
      const multiOut = await callGemini2_5(genAI, multiPrompt, '3-multi-storyboards');
      parsedStoryboards = parseMultiStoryboards(multiOut, sceneCount);
    } catch (e) {
      console.error('[storyboard-init] 3단계 실패, 폴백 사용:', e.message);
      parsedStoryboards = generateFallbackStoryboards(sceneCount);
    }

    const styles = conceptsArr.map((concept, index) => {
      const storyboardData = parsedStoryboards.find(p => p.concept_id === concept.concept_id) ||
        parsedStoryboards[index] ||
        generateFallbackStoryboard(concept.concept_id, sceneCount);

      let imagePrompts = storyboardData.imagePrompts || [];
      while (imagePrompts.length < sceneCount) {
        const sceneNum = imagePrompts.length + 1;
        imagePrompts.push({
          sceneNumber: sceneNum,
          title: `Scene ${sceneNum}`,
          duration: 2,
          prompt: `${concept.concept_name} scene ${sceneNum}, brand usage, product visible, target user interaction, high quality`
        });
      }
      imagePrompts = imagePrompts.slice(0, sceneCount);
      return {
        concept_id: concept.concept_id,
        style: concept.concept_name,
        name: concept.concept_name,
        summary: concept.summary,
        keywords: concept.keywords,
        imagePrompts,
        images: []
      };
    });

    const response = {
      success: true,
      styles,
      metadata: {
        videoLengthSeconds: videoSec,
        sceneCountPerConcept: sceneCount,
        modelChain: MODEL_CHAIN,
        totalProcessingTime: Date.now() - startTime,
        conceptsGenerated: conceptsArr.length,
        storyboardsGenerated: parsedStoryboards.length,
        totalImagePrompts: styles.reduce((s, c) => s + c.imagePrompts.length, 0),
        geminiVersion: '2.5-flash',
        apiProvider: 'Google Gemini 2.5',
        brandLogoProvided: formData.brandLogoProvided,
        productImageProvided: formData.productImageProvided,
        videoAspectRatio: formData.videoAspectRatio || null,
        aspectRatioCode: formData.aspectRatioCode
      }
    };
    console.log('[storyboard-init] 완료:', {
      concepts: response.metadata.conceptsGenerated,
      totalImagePrompts: response.metadata.totalImagePrompts
    });

    res.status(200).json(response);
  } catch (error) {
    console.error('[storyboard-init] ❌ 전체 오류:', error);
    try {
      const videoSec = parseVideoLengthSeconds(req.body?.formData?.videoLength);
      const sceneCount = calcSceneCount(videoSec);
      const fallbackStyles = generateFallbackStoryboards(sceneCount).map(fb => ({
        concept_id: fb.concept_id,
        style: fb.name,
        name: fb.name,
        summary: `${fb.name} 기본 스토리보드`,
        keywords: ['professional','commercial','advertisement','quality','brand'],
        imagePrompts: fb.imagePrompts,
        images: []
      }));
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
      console.error('[storyboard-init] ❌ 폴백 실패:', fallbackError);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

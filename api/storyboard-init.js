// api/storyboard-init.js - 🔥 비디오 폴링 + 진행률 업데이트 + duration 동적 로드
import fs from 'fs';
import path from 'path';
import { safeCallGemini } from '../src/utils/apiHelpers.js';
import sessionStore from '../server/utils/sessionStore.js';
import { checkUsageLimit, incrementUsage } from './users.js'; // 🔥 Use single source of truth
import { getImageToVideoStatusUrl } from '../src/utils/engineConfigLoader.js';
import { getPromptFilePath, getGeminiResponsesDir, getPromptVersionsDir } from '../src/utils/enginePromptHelper.js';

// 🔥 v4.3: 최신 프롬프트 버전 타임스탬프 획득
async function getLatestPromptTimestamp(mode, videoPurpose) {
  try {
    const vDir = getPromptVersionsDir(mode === 'manual' ? 'manual' : 'auto', videoPurpose);
    if (!fs.existsSync(vDir)) return null;

    const files = fs.readdirSync(vDir);
    const promptType = (mode === 'manual') ? 'manual' :
      (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education') ? 'auto_product' : 'auto_service';

    const regex = new RegExp(`^${promptType}_(\\d+)\\.txt$`);
    const timestamps = files
      .map(f => {
        const match = f.match(regex);
        return match ? parseInt(match[1]) : null;
      })
      .filter(t => t !== null)
      .sort((a, b) => b - a);

    return timestamps.length > 0 ? timestamps[0] : null;
  } catch (err) {
    console.error('[storyboard-init] 최신 버전 타임스탬프 획득 실패:', err);
    return null;
  }
}

/**
 * Section 3 (Audio & Editing Guide) 파싱
 * BGM, SFX, Editing Pace 정보 추출
 */
function parseAudioEditingGuide(text) {
  try {
    const section3Pattern = /🎵\s*Section\s*3[.:]?\s*Audio\s*&\s*Editing\s*Guide/i;
    const section3Match = text.match(section3Pattern);

    if (!section3Match) {
      console.log('[parseAudioEditingGuide] Section 3을 찾을 수 없음');
      return null;
    }

    const section3StartIdx = section3Match.index;
    const section4Pattern = /✍️\s*Section\s*4/i;
    const section4Match = text.substring(section3StartIdx).match(section4Pattern);
    const section3EndIdx = section4Match
      ? section3StartIdx + section4Match.index
      : text.length;

    const section3Text = text.substring(section3StartIdx, section3EndIdx);

    const bgmMatch = section3Text.match(/BGM:\s*(.+?)(?=\n\n|SFX:|Editing|$)/s);
    const bgm = bgmMatch ? bgmMatch[1].trim().replace(/\n/g, ' ') : '';

    const sfxMatch = section3Text.match(/SFX:\s*(.+?)(?=\n\n|Editing|$)/s);
    const sfx = sfxMatch ? sfxMatch[1].trim() : '';

    const editingMatch = section3Text.match(/Editing\s*(?:Pace)?:\s*(.+?)(?=\n\n|$)/s);
    const editing = editingMatch ? editingMatch[1].trim().replace(/\n/g, ' ') : '';

    const result = {
      bgm: bgm || '정보 없음',
      sfx: sfx || '정보 없음',
      editing: editing || '정보 없음'
    };

    console.log('[parseAudioEditingGuide] ✅ 파싱 성공:', result);
    return result;

  } catch (error) {
    console.error('[parseAudioEditingGuide] ❌ 오류:', error);
    return null;
  }
}


export const config = {
  maxDuration: 9000,
};

// 🔥 환경변수로 도메인 관리
const API_DOMAIN = process.env.API_DOMAIN || 'https://upnexx.ai';
const API_BASE = process.env.VITE_API_BASE_URL
  ? (process.env.VITE_API_BASE_URL.startsWith('http')
    ? process.env.VITE_API_BASE_URL
    : `${API_DOMAIN}${process.env.VITE_API_BASE_URL}`)
  : 'http://localhost:3000';

console.log('[storyboard-init] API_DOMAIN:', API_DOMAIN);
console.log('[storyboard-init] API_BASE:', API_BASE);

const FREEPIK_API_BASE = 'https://api.freepik.com/v1';

// ============================================================
// 원본 함수들
// ============================================================

// ❌ 레거시 프롬프트 매핑 제거 - enginePromptHelper 사용
// 레거시 파일은 public/*.txt에 백업용으로 유지

function getSceneCount(videoLength) {
  const lengthStr = String(videoLength).replace(/[^0-9]/g, '');
  const length = parseInt(lengthStr, 10);

  console.log(`[getSceneCount] 입력: "${videoLength}" → 숫자: ${length}`);

  let sceneCount;
  if (length <= 5) sceneCount = 3;
  else if (length <= 10) sceneCount = 5;
  else if (length <= 20) sceneCount = 10;
  else sceneCount = 15;

  console.log(`[getSceneCount] ✅ ${length}초 → ${sceneCount}개 씬`);
  return sceneCount;
}

// 🔥 100% 동적 Aspect Ratio 매핑 (engines.json 기반)
function mapAspectRatio(input) {
  if (!input) {
    // engines.json에서 기본값 로드
    try {
      const enginesPath = path.join(process.cwd(), 'config', 'engines.json');
      if (fs.existsSync(enginesPath)) {
        const enginesData = JSON.parse(fs.readFileSync(enginesPath, 'utf8'));
        return enginesData.currentEngine?.textToImage?.parameters?.aspect_ratio || 'widescreen_16_9';
      }
    } catch (error) {
      console.error('[mapAspectRatio] engines.json 로드 실패:', error.message);
    }
    return 'widescreen_16_9'; // Ultimate fallback
  }

  const normalized = String(input).toLowerCase().trim();

  // engines.json에서 supportedAspectRatios 로드
  try {
    const enginesPath = path.join(process.cwd(), 'config', 'engines.json');
    if (fs.existsSync(enginesPath)) {
      const enginesData = JSON.parse(fs.readFileSync(enginesPath, 'utf8'));
      const currentModel = enginesData.currentEngine?.textToImage?.model;
      const availableEngines = enginesData.availableEngines?.textToImage || [];
      const currentEngine = availableEngines.find(e => e.model === currentModel);

      if (currentEngine?.supportedAspectRatios) {
        // 지원되는 aspect ratio 중에서 매칭
        for (const supportedRatio of currentEngine.supportedAspectRatios) {
          const supportedNormalized = supportedRatio.toLowerCase();
          // 직접 매칭
          if (normalized === supportedNormalized) {
            return supportedRatio;
          }
          // 한글/별칭 매칭
          if ((normalized.includes('16:9') || normalized.includes('16_9') || normalized === '가로') &&
            supportedNormalized.includes('16_9')) {
            return supportedRatio;
          }
          if ((normalized.includes('9:16') || normalized.includes('9_16') || normalized === '세로') &&
            supportedNormalized.includes('9_16')) {
            return supportedRatio;
          }
          if ((normalized.includes('1:1') || normalized.includes('1_1') || normalized === '정사각형') &&
            supportedNormalized.includes('1_1')) {
            return supportedRatio;
          }
        }
        // 지원되는 첫 번째 ratio 반환
        return currentEngine.supportedAspectRatios[0];
      }
    }
  } catch (error) {
    console.error('[mapAspectRatio] 동적 로드 실패:', error.message);
  }

  // Fallback: 하드코딩 (engines.json 읽기 실패 시만)
  if (normalized.includes('16:9') || normalized.includes('16_9') || normalized === '가로') {
    return 'widescreen_16_9';
  }
  if (normalized.includes('9:16') || normalized.includes('9_16') || normalized === '세로') {
    return 'social_story_9_16'; // ✅ portrait_9_16 대신
  }
  if (normalized.includes('1:1') || normalized.includes('1_1') || normalized === '정사각형') {
    return 'square_1_1';
  }

  return 'widescreen_16_9';
}


function getWidthFromAspectRatio(aspectRatio) {
  const map = {
    'widescreen_16_9': 1920,
    'portrait_9_16': 1080,
    'square_1_1': 1080
  };
  return map[aspectRatio] || 1920;
}

function getHeightFromAspectRatio(aspectRatio) {
  const map = {
    'widescreen_16_9': 1080,
    'portrait_9_16': 1920,
    'square_1_1': 1080
  };
  return map[aspectRatio] || 1080;
}

function detectProductCompositingScenes(fullOutput, videoPurpose) {
  const scenes = [];

  if (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education') {
    const regex = /S#(\d+)[^:]*:[^[]*\[PRODUCT COMPOSITING SCENE\]/gi;
    const matches = [...fullOutput.matchAll(regex)];

    matches.forEach(match => {
      const sceneNum = parseInt(match[1], 10);
      scenes.push({
        sceneNumber: sceneNum,
        context: '[PRODUCT COMPOSITING SCENE]',
        explicit: true
      });
    });

    if (scenes.length === 0) {
      scenes.push({
        sceneNumber: 2,
        context: '[PRODUCT COMPOSITING SCENE] - Default S#2',
        explicit: false
      });
    }
  }

  return scenes;
}

function analyzeCompositingInfo(requestBody, compositingScenes) {
  const { videoPurpose, imageUpload, productServiceName, brandName } = requestBody;

  const needsProductImage = (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education');
  const needsBrandLogo = (videoPurpose === 'service' || videoPurpose === 'brand');

  return {
    videoPurpose: videoPurpose || 'product',
    sceneDescription: productServiceName || brandName || '제품/서비스',
    compositingContext: needsProductImage ? 'product_placement' : 'brand_logo',
    needsProductImage: needsProductImage,
    needsBrandLogo: needsBrandLogo,
    hasProductImage: needsProductImage && !!(imageUpload && imageUpload.url),
    hasBrandLogo: needsBrandLogo && !!(imageUpload && imageUpload.url),
    scenes: compositingScenes,
    productImageData: (needsProductImage && imageUpload) ? imageUpload : null,
    brandLogoData: (needsBrandLogo && imageUpload) ? imageUpload : null,
    totalCompositingScenes: compositingScenes.length
  };
}

function getPromptFile(videoPurpose, mode = 'auto') {
  if (mode === 'manual') return 'manual';
  if (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education') return 'product';
  if (videoPurpose === 'service' || videoPurpose === 'brand') return 'service';
  return 'product';
}

// ❌ REMOVED: Duplicate User Management Logic
// checkUsageLimit and incrementUsage are now imported from ./users.js
// This prevents logic conflicts (e.g., daily reset vs total limit) and sync issues.

function saveGeminiResponse(promptKey, step, formData, fullResponse) {
  try {
    const mode = promptKey.includes('manual') ? 'manual' : 'auto';

    // 🔥 Use centralized helper for directory path
    // videoPurpose is derived from promptKey roughly, but checking mode is safer for directory structure
    const responsesPath = getGeminiResponsesDir(mode);

    // 디렉토리 생성 (없으면)
    if (!fs.existsSync(responsesPath)) {
      fs.mkdirSync(responsesPath, { recursive: true });
    }

    const timestamp = Date.now();
    // 🔥 EC2 실측 구조와 일치하도록 파일명에 _storyboard_ 추가
    const fileName = `${promptKey}_storyboard_${step}_${timestamp}.json`;
    const filePath = path.join(responsesPath, fileName);

    const responseData = {
      promptKey,
      step,
      formData: formData || {},
      response: fullResponse,
      timestamp: new Date().toISOString(),
      savedAt: new Date().toISOString()
    };

    fs.writeFileSync(filePath, JSON.stringify(responseData, null, 2), 'utf-8');

    console.log(`[saveGeminiResponse] ✅ 저장 완료: ${fileName} (Path: ${filePath})`);
    return { success: true, fileName };
  } catch (error) {
    console.error('[saveGeminiResponse] ❌ 저장 실패:', error);
    return { success: false, error: error.message };
  }
}

function parseUnifiedConceptJSON(text, mode = 'auto') {
  try {
    const expectedConceptCount = mode === 'manual' ? 1 : 3;
    let conceptMatches = [];

    if (mode === 'manual') {
      // Manual 모드: 다양한 섹션 헤더(Production Guide, Frame-by-Frame 등) 지원 확장
      const manualConceptPattern = /(Section\s*2|Cinematic|Storyboard|Production\s*Guide|Frame-by-Frame)/i;
      const match = text.match(manualConceptPattern);
      if (match) {
        conceptMatches = [{
          0: match[0],
          1: '1',
          2: 'Manual Video Concept',
          index: match.index,
          input: text
        }];
      }
    } else {
      // # 개수에 상관없이(1개 이상) "N. 컨셉:" 형식을 인식하도록 개선
      const conceptPattern = /#+\s*(\d+)\.\s*컨셉:\s*(.+)/g;
      conceptMatches = [...text.matchAll(conceptPattern)];
    }

    if (conceptMatches.length === 0) return null;

    const concepts = [];
    const conceptsToProcess = conceptMatches.slice(0, expectedConceptCount);

    for (let i = 0; i < conceptsToProcess.length; i++) {
      const conceptMatch = conceptsToProcess[i];
      const conceptNum = parseInt(conceptMatch[1]);
      const conceptName = conceptMatch[2].trim();
      const startIdx = conceptMatch.index;
      let endIdx = text.length;
      if (i < conceptsToProcess.length - 1) {
        endIdx = conceptsToProcess[i + 1].index;
      }
      const conceptText = text.substring(startIdx, endIdx);

      const bigIdeaMatch = conceptText.match(/Big Idea:\s*(.+)/);
      const bigIdea = bigIdeaMatch ? bigIdeaMatch[1].trim() : '';
      const styleMatch = conceptText.match(/Style:\s*(.+)/);
      const style = styleMatch ? styleMatch[1].trim() : '';

      let scenePattern;
      if (mode === 'manual') {
        // 🔥 FIXED: [Sequence #1 - Frame #1] (0-2s) 형식 지원
        // \[? = 선택적 여는 대괄호, #? = 선택적 #, [^\(]* = ( 전까지 모든 문자 (Frame #1] 같은 부분)
        scenePattern = /\[?(?:S#|Scene|Sequence|Frame)\s*#?(\d+)[^\(]*\(([^)]+)\)/gi;
      } else {
        // Auto 모드: #* S#N (Time) 또는 #* Sequence N (Time) 등 지원
        scenePattern = /#*\s*(?:S#|Scene|Sequence|Frame)\s*(\d+).*?\(([^)]+)\)/gi;
      }

      const sceneMatches = [...conceptText.matchAll(scenePattern)];
      const conceptData = {
        concept_name: conceptName,
        big_idea: bigIdea,
        style: style
      };

      for (let j = 0; j < sceneMatches.length; j++) {
        // 🔥 Force sequential numbering to prevent gaps (e.g. 1,2,4,5 -> 1,2,3,4)
        const sceneNum = j + 1;
        const originalSceneNum = parseInt(sceneMatches[j][1]); // Keep explicit ref if needed debugging
        const timecode = sceneMatches[j][2].trim();
        const sceneStartIdx = sceneMatches[j].index;
        const sceneEndIdx = j < sceneMatches.length - 1 ? sceneMatches[j + 1].index : conceptText.length;
        const sceneText = conceptText.substring(sceneStartIdx, sceneEndIdx);

        const visualDescMatch = sceneText.match(/Visual Description:\s*(.+?)(?=JSON|###|S#\d+|$)/s);
        const visualDescription = visualDescMatch ? visualDescMatch[1].trim() : '';
        const jsonBlocks = extractJSONBlocks(sceneText);

        if (jsonBlocks.length >= 3) {
          try {
            const imagePromptJSON = JSON.parse(jsonBlocks[0]);
            const motionPromptJSON = JSON.parse(jsonBlocks[1]);
            const copyJSON = JSON.parse(jsonBlocks[2]);

            conceptData[`scene_${sceneNum}`] = {
              title: `Scene ${sceneNum}`,
              timecode: timecode,
              visual_description: visualDescription,
              image_prompt: imagePromptJSON,
              motion_prompt: motionPromptJSON,
              copy: copyJSON
            };
          } catch (e) {
            console.error(`JSON 파싱 실패 (씬 ${sceneNum}) - 정규식 블록 파싱 에러, Nuclear Parser 시도:`, e.message);

            // 🔥 정규식 블록 파싱 실패 시 Nuclear Parser로 폴백
            const anyJsons = extractAnyJSON(sceneText);
            if (anyJsons.length >= 3) {
              try {
                const imagePromptJSON = JSON.parse(anyJsons[0]);
                const motionPromptJSON = JSON.parse(anyJsons[1]);
                const copyJSON = JSON.parse(anyJsons[2]);

                conceptData[`scene_${sceneNum}`] = {
                  title: `Scene ${sceneNum}`,
                  timecode: timecode,
                  visual_description: visualDescription,
                  image_prompt: imagePromptJSON,
                  motion_prompt: motionPromptJSON,
                  copy: copyJSON
                };
                console.log(`[parseUnifiedConceptJSON] ☢️ Nuclear Parser로 씬 ${sceneNum} 복구 성공 (Fallback)`);
              } catch (nuclearError) {
                console.error(`[parseUnifiedConceptJSON] Nuclear Parser 복구조차 실패 (씬 ${sceneNum}):`, nuclearError.message);
              }
            } else {
              console.error(`[parseUnifiedConceptJSON] Nuclear Parser 복구 실패 - JSON 블록 부족 (Found: ${anyJsons.length})`);
            }
          }
        } else {
          // 🔥 Fallback: 정규식 실패 시 Nuclear parser 시도
          const anyJsons = extractAnyJSON(sceneText);
          if (anyJsons.length >= 3) {
            try {
              // 보통 순서대로 image, motion, copy임 (프롬프트 구조상)
              const imagePromptJSON = JSON.parse(anyJsons[0]);
              const motionPromptJSON = JSON.parse(anyJsons[1]);
              const copyJSON = JSON.parse(anyJsons[2]);

              conceptData[`scene_${sceneNum}`] = {
                title: `Scene ${sceneNum}`,
                timecode: timecode,
                visual_description: visualDescription,
                image_prompt: imagePromptJSON,
                motion_prompt: motionPromptJSON,
                copy: copyJSON
              };
              console.log(`[parseUnifiedConceptJSON] ☢️ Nuclear Parser로 씬 ${sceneNum} 복구 성공`);
            } catch (e) {
              console.error(`[parseUnifiedConceptJSON] Nuclear Parser 복구 실패 (씬 ${sceneNum}):`, e);
            }
          } else {
            console.warn(`[parseUnifiedConceptJSON] ⚠️ 씬 ${sceneNum} JSON 블록 부족 (Found: ${jsonBlocks.length}, Nuclear: ${anyJsons.length})`);
          }
        }
      }

      concepts.push(conceptData);
    }

    return { concepts };
  } catch (error) {
    console.error('[parseUnifiedConceptJSON] 오류:', error);
    return null;
  }
}

function extractJSONBlocks(text) {
  const jsonBlocks = [];
  const backtickPattern = /```(?:json|python)?\s*\n([\s\S]*?)\n```/g;
  let backtickMatches = [...text.matchAll(backtickPattern)];
  const plainJSONPattern = /(?:^|\n)JSON\s*\n(\{[\s\S]*?\n\})\s*(?=\n(?:JSON|###|```|S#\d+|$))/gm;
  let plainMatches = [...text.matchAll(plainJSONPattern)];
  const copyPattern = /(?:^|\n)JSON\s*\n```copy\s*\n([\s\S]*?)\n```/gm;
  let copyMatches = [...text.matchAll(copyPattern)];

  const allMatches = [];
  backtickMatches.forEach(match => {
    const content = match[1].trim();
    if (content.startsWith('{')) {
      allMatches.push({ index: match.index, content: content, type: 'backtick' });
    }
  });
  plainMatches.forEach(match => {
    allMatches.push({ index: match.index, content: match[1].trim(), type: 'plain' });
  });
  copyMatches.forEach(match => {
    const copyText = match[1].trim();
    const copyJSON = JSON.stringify({ copy: copyText });
    allMatches.push({ index: match.index, content: copyJSON, type: 'copy' });
  });
  allMatches.sort((a, b) => a.index - b.index);
  allMatches.forEach(match => {
    jsonBlocks.push(match.content);
  });
  return jsonBlocks;
}

// 🔥 Nuclear Option: Generic JSON Extractor (Fallback)
function extractAnyJSON(text) {
  const jsonObjects = [];
  let braceCount = 0;
  let startIndex = -1;
  let inString = false;
  let escape = false;

  // Simple parser to find top-level balanced braces
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (char === '\\' && !escape) {
        escape = true;
      } else if (char === '"' && !escape) {
        inString = false;
      } else {
        escape = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (braceCount === 0) startIndex = i;
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && startIndex !== -1) {
        const potentialJson = text.substring(startIndex, i + 1);
        try {
          // Validate if it is parseable JSON
          JSON.parse(potentialJson);
          jsonObjects.push(potentialJson);
        } catch (e) {
          // Ignore invalid JSON fragments
        }
        startIndex = -1; // Reset
      }
    }
  }
  return jsonObjects;
}

export { parseUnifiedConceptJSON, extractJSONBlocks };

// ============================================================
// 진행률 추적
// ============================================================

async function updateSession(sessionId, updateData) {
  if (!sessionId || sessionId === 'undefined') {
    console.warn('[storyboard-init] updateSession skipped: sessionId is invalid', { sessionId });
    return false;
  }
  try {
    if (updateData.progress) {
      sessionStore.updateProgress(sessionId, updateData.progress);
    }
    if (updateData.status) {
      sessionStore.updateStatus(sessionId, updateData.status, updateData.result, updateData.error);
    }
    return true;
  } catch (error) {
    console.error('[updateSession] Error:', error);
    return false;
  }
}

function calculateProgress(phase, stepProgress = 0) {
  const phases = {
    GEMINI: { start: 0, weight: 20 },   // 0-20%
    IMAGE: { start: 20, weight: 80 }    // 20-100%
  };
  const phaseInfo = phases[phase];
  if (!phaseInfo) return 0;
  return Math.floor(phaseInfo.start + (phaseInfo.weight * stepProgress / 100));
}

// ============================================================
// 자동화 함수
// ============================================================
async function generateImage(imagePrompt, sceneNumber, conceptId, username, projectId, personUrl, productImageUrl, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[generateImage] 씬 ${sceneNumber} 시도 ${attempt}/${maxRetries} (컨셉: ${conceptId}, 프로젝트: ${projectId}, 인물: ${personUrl ? '있음' : '없음'}, 제품: ${productImageUrl ? '있음' : '없음'})`);

      const response = await fetch(`${API_BASE}/api/storyboard-render-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': username
        },
        body: JSON.stringify({
          imagePrompt,
          sceneNumber,
          conceptId,
          projectId,  // 🔥 추가: S3 업로드를 위한 projectId
          personUrl,   // 🔥 추가: 인물 합성용 URL
          productImageUrl // 🔥 추가: 제품/로고 합성용 URL
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      console.log(`[generateImage] 응답:`, JSON.stringify(result));

      const imageUrl = result.url; // API returns S3 URL in 'url' field

      // 🔥 fallback 이미지 체크 - 재시도
      if (result.fallback === true || !imageUrl || imageUrl.includes('via.placeholder.com')) {
        console.log(`[generateImage] ⚠️ 씬 ${sceneNumber} fallback 이미지 감지 - 재시도 필요`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
          continue;
        }
        throw new Error('이미지 생성 실패 (fallback)');
      }

      if (!result.success || !imageUrl) throw new Error('이미지 생성 실패');

      console.log(`[generateImage] ✅ 씬 ${sceneNumber} 성공: ${imageUrl.substring(0, 60)}...`);
      return imageUrl;

    } catch (error) {
      console.error(`[generateImage] ❌ 씬 ${sceneNumber} 시도 ${attempt} 실패:`, error.message);
      if (attempt >= maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
    }
  }
  throw new Error('이미지 생성 최대 재시도 초과');
}

// 🔥 엔진별 지원 duration 로드
function loadEngineDuration() {
  try {
    const enginesPath = path.join(process.cwd(), 'config', 'engines.json');
    if (!fs.existsSync(enginesPath)) {
      console.warn('[loadEngineDuration] engines.json 파일이 없습니다. 기본값 6초 사용');
      return '6';
    }
    const enginesData = JSON.parse(fs.readFileSync(enginesPath, 'utf8'));

    // 🔥 수정: currentEngine에서 model 이름 가져오기
    const currentModel = enginesData.currentEngine?.imageToVideo?.model;

    if (!currentModel) {
      console.warn('[loadEngineDuration] 현재 엔진 모델이 없습니다. 기본값 6초 사용');
      return '6';
    }

    // 🔥 수정: availableEngines에서 현재 모델의 supportedDurations 찾기
    const availableEngines = enginesData.availableEngines?.imageToVideo || [];
    const currentEngineConfig = availableEngines.find(engine => engine.model === currentModel);

    if (!currentEngineConfig) {
      console.warn(`[loadEngineDuration] ${currentModel} 엔진 설정을 찾을 수 없습니다. 기본값 6초 사용`);
      return '6';
    }

    const supportedDurations = currentEngineConfig.supportedDurations;

    console.log('[loadEngineDuration] 🔍 엔진 정보:', {
      model: currentModel,
      supportedDurations: supportedDurations,
      foundIn: 'availableEngines'
    });

    if (!supportedDurations || !Array.isArray(supportedDurations) || supportedDurations.length === 0) {
      console.warn('[loadEngineDuration] ⚠️ supportedDurations가 없거나 빈 배열입니다. 기본값 6초 사용');
      return '6';
    }

    const duration = String(supportedDurations[0]);
    console.log(`[loadEngineDuration] ✅ 엔진 duration: ${duration}초 (${currentModel})`);
    return duration;
  } catch (error) {
    console.error('[loadEngineDuration] 오류:', error.message);
    console.error('[loadEngineDuration] 스택:', error.stack);
    return '6'; // fallback
  }
}

async function generateVideo(imageUrl, motionPrompt, sceneNumber, formData) {
  // 🔥 동적으로 duration 로드
  const duration = loadEngineDuration();

  console.log(`[generateVideo] 씬 ${sceneNumber} - imageUrl: ${imageUrl.substring(0, 60)}..., duration: ${duration}초`);

  const response = await fetch(`${API_BASE}/api/image-to-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl,
      prompt: motionPrompt?.prompt || 'smooth camera movement',
      negativePrompt: motionPrompt?.negative_prompt || 'blurry',
      duration: duration, // 🔥 수정: 동적 로드
      formData
    })
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (!result.success || !result.task?.taskId) throw new Error('비디오 생성 실패');
  return result.task.taskId;
}

async function pollVideoStatus(taskId, sceneNumber, sessionId, currentVideoIndex, totalVideos, maxAttempts = 120) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  console.log(`[pollVideoStatus] 🚀 폴링 시작: ${taskId} (${currentVideoIndex}/${totalVideos})`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const apiKey = process.env.FREEPIK_API_KEY || process.env.VITE_FREEPIK_API_KEY;

      // 🔥 동적 URL 생성 - engines.json의 현재 imageToVideo 엔진 사용
      const statusUrl = getImageToVideoStatusUrl(taskId);

      console.log(`[pollVideoStatus] 🔥 사용 중인 상태 조회 URL: ${statusUrl}`);

      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'x-freepik-api-key': apiKey,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        // 404가 아닌 경우에만 로그 출력 (404는 일시적일 수 있음)
        if (response.status !== 404) {
          console.log(`[pollVideoStatus] ⚠️ HTTP ${response.status} (시도 ${attempt}/${maxAttempts})`);
        } else if (attempt <= 3 || attempt % 12 === 0) {
          // 404는 처음 3번과 1분마다만 로그
          console.log(`[pollVideoStatus] ⏳ 대기 중... (시도 ${attempt}/${maxAttempts}, ${Math.floor(attempt * 5 / 60)}분 경과)`);
        }
        await sleep(5000);
        continue;
      }

      const result = await response.json();
      const status = result.data?.status?.toUpperCase();

      // 🔥 로그 추가: 상태 출력 (30초마다)
      if (attempt % 6 === 0) {
        console.log(`[pollVideoStatus] 📊 상태: ${status} (${Math.floor(attempt * 5 / 60)}분 ${(attempt * 5) % 60}초 경과)`);

        const videoProgress = ((currentVideoIndex - 1) / totalVideos) * 100;
        const session = sessionStore.getSession(sessionId);
        if (session) {
          await updateSession(sessionId, {
            progress: {
              phase: 'VIDEO',
              percentage: calculateProgress('VIDEO', videoProgress),
              currentStep: `비디오 ${currentVideoIndex}/${totalVideos} 생성 중... (${Math.floor(attempt * 5 / 60)}분 경과)`
            }
          });
        }
      }

      if (status === 'COMPLETED') {
        if (result.data?.generated?.length > 0) {
          const videoUrl = result.data.generated[0];
          console.log(`[pollVideoStatus] ✅ 완료: ${taskId.substring(0, 8)}... → ${videoUrl.substring(0, 50)}...`);
          return videoUrl;
        }
      }

      if (status === 'FAILED' || status === 'ERROR') {
        console.error(`[pollVideoStatus] ❌ 실패: ${taskId}`);
        throw new Error('비디오 생성 실패');
      }

      await sleep(5000);
    } catch (error) {
      if (error.message === '비디오 생성 실패') throw error;

      // 네트워크 에러 등은 재시도
      if (attempt % 12 === 0) {
        console.log(`[pollVideoStatus] ⚠️ 에러 발생, 재시도 중... (${attempt}/${maxAttempts})`);
      }
      await sleep(5000);
    }
  }

  console.error(`[pollVideoStatus] ❌ 타임아웃: ${taskId} (${Math.floor(maxAttempts * 5 / 60)}분 경과)`);
  throw new Error('비디오 폴링 타임아웃');
}

// ============================================================
// 메인 함수
// ============================================================

async function processStoryboardAsync(body, username, sessionId) {
  const startTime = Date.now();

  try {
    const usageCheck = checkUsageLimit(username);
    if (!usageCheck.allowed) {
      await updateSession(sessionId, {
        status: 'error',
        error: { message: usageCheck.message },
        progress: { phase: 'ERROR', percentage: 0, currentStep: usageCheck.message }
      });
      return;
    }

    const {
      brandName, industryCategory, productServiceCategory, productServiceName,
      videoLength, videoPurpose, coreTarget, coreDifferentiation,
      aspectRatio, aspectRatioCode, imageUpload, mode, userdescription
    } = body;

    console.log("🔥 [SERVER] BODY RECEIVED:", body);
    console.log("🔥 [SERVER] userdescription =", userdescription);

    // 🔥 씬 개수 사전 계산 (Gemini에 전달하기 위해)
    const sceneCountPerConcept = getSceneCount(videoLength);
    console.log(`[storyboard-init] 📊 계산된 씬 개수: ${videoLength} → ${sceneCountPerConcept}개`);

    await updateSession(sessionId, {
      progress: {
        phase: 'GEMINI',
        percentage: calculateProgress('GEMINI', 0),
        currentStep: 'Gemini API 호출 준비 중...'
      }
    });


    // PHASE 1: Gemini (0-15%)
    // 🔥 엔진별 프롬프트 파일 경로 (enginePromptHelper 사용)
    const promptFilePath = getPromptFilePath(
      mode === 'manual' ? 'manual' : 'auto',
      videoPurpose
    );
    if (!fs.existsSync(promptFilePath)) {
      throw new Error(`프롬프트 파일을 찾을 수 없습니다: ${promptFilePath}`);
    }
    console.log(`[storyboard-init] 📄 프롬프트 로드: ${promptFilePath}`);

    let promptTemplate = fs.readFileSync(promptFilePath, 'utf-8');
    const promptVariables = {
      brandName: brandName || '',
      industryCategory: industryCategory || '',
      productServiceCategory: productServiceCategory || '',
      productServiceName: productServiceName || '',
      videoPurpose: videoPurpose || 'product',
      videoLength: videoLength || '10초',
      sceneCountPerConcept: sceneCountPerConcept, // 🔥 명시적으로 씬 개수 전달
      coreTarget: coreTarget || '',
      coreDifferentiation: coreDifferentiation || '',
      videoRequirements: body.videoRequirements || '없음',
      brandLogo: (imageUpload && imageUpload.url && (videoPurpose === 'service' || videoPurpose === 'brand')) ? '업로드됨' : '없음',
      productImage: (imageUpload && imageUpload.url && (videoPurpose === 'product' || videoPurpose === 'conversion' || videoPurpose === 'education')) ? '업로드됨' : '없음',
      aspectRatioCode: mapAspectRatio(aspectRatioCode || aspectRatio),
      userdescription: userdescription || ''
    };
    console.log("[DEBUG] RECEIVED userdescription:", userdescription);

    // 🔥 v4.3: 필수 변수 런타임 주입 (사용자 프롬프트 가이드 강조)
    let runtimeInjection = '\n\n[INPUT: CLIENT BRIEF]\nAnalyze the following input variables:\n';
    let isInjectionNeeded = false;

    // 필수 체크 변수 구성
    const mandatoryTags = mode === 'manual'
      ? ['videoLength', 'aspectRatioCode', 'videoPurpose', 'userdescription']
      : ['videoPurpose', 'videoLength', 'aspectRatioCode', 'brandName', 'coreTarget', 'coreDifferentiation'];

    mandatoryTags.forEach(tag => {
      const tagExists = promptTemplate.includes(`{${tag}}`);
      if (!tagExists) {
        isInjectionNeeded = true;
      }
      // Brief 섹션 구성
      if (mode === 'manual') {
        const labelMap = {
          videoLength: 'Video Length',
          aspectRatioCode: 'Aspect Ratio',
          videoPurpose: 'Purpose',
          userdescription: 'Description'
        };
        runtimeInjection += `${labelMap[tag] || tag}: {${tag}}\n`;
      } else {
        runtimeInjection += `${tag} : {${tag}}\n`;
      }
    });

    if (isInjectionNeeded) {
      console.warn(`[storyboard-init] ⚠️ 프롬프트 템플릿 내 필수 변수 누락 감지. 런타임 주입을 실행합니다.`);
      promptTemplate += runtimeInjection;
    }

    for (const [key, value] of Object.entries(promptVariables)) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      promptTemplate = promptTemplate.replace(placeholder, value);
    }

    // Gemini 호출 시작 (1%)
    await updateSession(sessionId, {
      progress: {
        phase: 'GEMINI',
        percentage: 1,
        currentStep: 'Gemini 모델에 프롬프트 전송 중...'
      }
    });

    // 천천히 진행률 증가 (1% -> 10%)
    setTimeout(() => {
      updateSession(sessionId, {
        progress: {
          phase: 'GEMINI',
          percentage: 10,
          currentStep: 'Gemini 응답 대기 중...'
        }
      });
    }, 500);

    const geminiResponse = await safeCallGemini(promptTemplate, {
      label: 'UNIFIED-storyboard-init',
      maxRetries: 3,
      isImageComposition: false
    });

    const fullOutput = geminiResponse.text;

    // Gemini 완료 (20%)
    await updateSession(sessionId, {
      progress: {
        phase: 'GEMINI',
        percentage: 20,
        currentStep: '스토리보드 데이터 파싱 완료'
      }
    });

    // 🔥 응답 저장 (엔진별 폴더에 저장)
    // generatePromptKey로 올바른 promptKey 생성
    const { generatePromptKey } = await import('../src/utils/enginePromptHelper.js');
    const promptKey = generatePromptKey(mode === 'manual' ? 'manual' : 'auto', videoPurpose);
    console.log(`[storyboard-init] 💾 Gemini 응답 저장 중... (promptKey: ${promptKey})`);

    // 🔥 sessionId가 있을 때만 저장 진행 (undefined 방지)
    if (sessionId) {
      // v4.3: 사용된 프롬프트 버전 타임스탬프도 함께 기록
      const promptVersionTimestamp = await getLatestPromptTimestamp(mode, videoPurpose);
      saveGeminiResponse(promptKey, 'storyboard_unified', {
        ...body,
        promptVersionTimestamp // 🔥 응답-프롬프트 종속성 핵심 데이터
      }, fullOutput);
    } else {
      console.warn('[storyboard-init] sessionId가 없어 응답 저장을 건너뜁니다.');
    }

    const compositingScenes = detectProductCompositingScenes(fullOutput, videoPurpose);
    const mcJson = parseUnifiedConceptJSON(fullOutput, mode);
    console.log('[DEBUG] 📊 Gemini JSON 전체 구조:');
    console.log(JSON.stringify(mcJson, null, 2));
    console.log('[DEBUG] concepts 개수:', mcJson.concepts?.length);
    if (mcJson.concepts && mcJson.concepts[0]) {
      console.log('[DEBUG] concepts[0] 키 목록:', Object.keys(mcJson.concepts[0]));
    }
    if (!mcJson || !mcJson.concepts || mcJson.concepts.length === 0) throw new Error('JSON 파싱 실패');

    console.log('[storyboard-init] ✅ Gemini 파싱 성공:', mcJson.concepts.length, '개 컨셉');

    // PHASE 2: 이미지 생성 (15-40%)
    await updateSession(sessionId, {
      progress: {
        phase: 'IMAGE',
        percentage: calculateProgress('IMAGE', 0),
        currentStep: '이미지 생성 준비 중...'
      }
    });

    const styles = [];
    for (let conceptIdx = 0; conceptIdx < mcJson.concepts.length; conceptIdx++) {
      const concept = mcJson.concepts[conceptIdx];
      const images = [];

      for (let sceneNum = 1; sceneNum <= sceneCountPerConcept; sceneNum++) {
        const sceneKey = `scene_${sceneNum}`;
        const scene = concept[sceneKey];
        if (!scene) continue;

        try {
          // 🔥 engines.json에서 현재 엔진의 기본 파라미터 로드
          let engineDefaults = {};
          try {
            const enginesPath = path.join(process.cwd(), 'config', 'engines.json');
            if (fs.existsSync(enginesPath)) {
              const enginesData = JSON.parse(fs.readFileSync(enginesPath, 'utf8'));
              const currentModel = enginesData.currentEngine?.textToImage?.model;
              const availableEngines = enginesData.availableEngines?.textToImage || [];
              const currentEngine = availableEngines.find(e => e.model === currentModel);
              if (currentEngine?.parameters) {
                engineDefaults = { ...currentEngine.parameters };
                delete engineDefaults.aspect_ratio; // aspect_ratio는 별도 처리
              }
            }
          } catch (err) {
            console.warn('[storyboard-init] engines.json 로드 실패, 기본값 사용:', err.message);
          }

          const imagePrompt = {
            ...engineDefaults, // 🔥 엔진별 기본 파라미터 우선
            ...scene.image_prompt, // 🔥 Gemini 생성 파라미터로 덮어쓰기
            // 🔥 [FIX] 사용자 선택 비율 강제 적용 (AI 제안 무시)
            aspect_ratio: mapAspectRatio(body.aspectRatioCode || body.aspectRatio || 'widescreen_16_9')
          };
          console.log('[DEBUG] imagePrompt before generateImage:', {
            concept: conceptIdx + 1,
            sceneNum,
            prompt: scene.image_prompt?.prompt,
            engineDefaults: Object.keys(engineDefaults)
          });
          const imageUrl = await generateImage(
            imagePrompt,
            sceneNum,
            conceptIdx + 1,
            username,
            body.projectId,
            body.personSelection, // 🔥 인물 합성 정보 전달
            imageUpload && imageUpload.url ? imageUpload.url : null // 🔥 제품 이미지 URL 전달
          );
          console.log(`[storyboard-init] 🖼️ 씬 ${sceneNum} 이미지 생성 완료: ${imageUrl}`);
          images.push({
            sceneNumber: sceneNum,
            imageUrl: imageUrl,
            videoUrl: null,
            title: scene.title || `씬 ${sceneNum}`,
            prompt: scene.image_prompt?.prompt || '',
            motionPrompt: scene.motion_prompt,
            copy: scene.copy?.copy || '',
            status: 'image_done'
          });

          const progress = ((conceptIdx * sceneCountPerConcept + sceneNum) / (mcJson.concepts.length * sceneCountPerConcept)) * 100;
          await updateSession(sessionId, {
            progress: {
              phase: 'IMAGE',
              percentage: calculateProgress('IMAGE', progress),
              currentStep: `이미지 ${sceneNum}/${sceneCountPerConcept} 생성 완료 (컨셉 ${conceptIdx + 1})`
            }
          });
        } catch (error) {
          console.error(`이미지 생성 실패 (씬 ${sceneNum}):`, error);
          images.push({
            sceneNumber: sceneNum,
            imageUrl: null,
            videoUrl: null,
            status: 'image_failed',
            error: error.message
          });
        }
      }

      styles.push({
        id: conceptIdx + 1,
        conceptId: conceptIdx + 1,
        conceptName: concept.concept_name,
        big_idea: concept.big_idea || '',
        style: concept.style || '',
        images: images
      });

      // 🔥 추가: 컨셉 완료마다 프로젝트에 중간 저장
      if (body.projectId && username) {
        try {
          const partialStoryboard = {
            success: false, // 아직 완료 아님
            styles: styles,
            metadata: {
              phase: 'IMAGE',
              progress: calculateProgress('IMAGE', ((conceptIdx + 1) / mcJson.concepts.length) * 100),
              generatedAt: new Date().toISOString(),
              status: 'in_progress'
            }
          };

          await fetch(`${API_BASE}/api/projects/${body.projectId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'x-username': username
            },
            body: JSON.stringify({
              storyboard: partialStoryboard,
              formData: body
            })
          });

          console.log(`[storyboard-init] 💾 이미지 단계 중간 저장 완료 (컨셉 ${conceptIdx + 1}/${mcJson.concepts.length})`);
        } catch (saveError) {
          console.error('[storyboard-init] 중간 저장 실패:', saveError);
        }
      }
    }

    // 🔥 v4.1: 이미지 생성 완료 (100%)
    await updateSession(sessionId, {
      progress: {
        phase: 'IMAGE',
        percentage: 100,
        currentStep: `모든 이미지 생성 완료 (${styles.length}개 컨셉)`
      }
    });

    console.log(`[storyboard-init] ✅ 이미지 생성 완료 - 총 ${styles.reduce((sum, s) => sum + s.images.length, 0)}개 이미지`);

    // 🔥 v4.1: 영상 생성 및 합성 로직 제거됨
    // Step4에서 사용자가 선택적으로 영상 변환 수행
    const finalVideos = [];

    // 🔥 v4.1: 완료 (이미지 세트 모드)
    const compositingInfo = analyzeCompositingInfo(body, compositingScenes);

    const totalImages = styles.reduce((sum, s) => sum + s.images.length, 0);

    // Section 3 (Audio & Editing Guide) 파싱
    const audioEditingGuide = parseAudioEditingGuide(fullOutput);

    const metadata = {
      promptFile: promptFilePath,
      promptFileName: path.basename(promptFilePath),
      mode: mode || 'auto',
      videoPurpose,
      videoLength,
      sceneCountPerConcept,
      aspectRatio: mapAspectRatio(aspectRatio || aspectRatioCode),
      generatedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
      geminiModel: "gemini-2.5-flash",
      brandName,
      totalConcepts: styles.length,
      totalImages: totalImages,
      compositingScenes: compositingScenes.length,
      hasImageUpload: !!(imageUpload && imageUpload.url),
      compositingInfo: compositingInfo,
      workflowMode: 'image_only',  // 🔥 v4.1: 이미지만 생성
      audioEditingGuide: audioEditingGuide  // Section 3 정보 추가
    };

    // 🔥🔥 사용 횟수 차감 (중요: 단일 소스 사용)
    incrementUsage(username);

    const finalStoryboard = {
      success: true,
      styles,
      finalVideos: [],  // 🔥 v4.1: 빈 배열 (Step4에서 생성)
      imageSetMode: true,  // 🔥 v4.1: 신규 플래그
      metadata,
      compositingInfo,
      fullOutput: fullOutput,
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    // 🔥 v4.1: 이미지 세트 생성 완료
    await updateSession(sessionId, {
      status: 'completed',
      progress: {
        phase: 'COMPLETE',
        percentage: 100,
        currentStep: `✅ 이미지 세트 생성 완료! ${totalImages}개 이미지 (${styles.length}개 컨셉)`
      },
      result: finalStoryboard
    });

    // 🔥 신규 추가 (2025-11-24): 프로젝트에 스토리보드 저장
    if (body.projectId && username) {
      try {
        console.log(`[storyboard-init] 📁 프로젝트에 스토리보드 저장 시작: ${body.projectId}`);

        const saveResponse = await fetch(`${API_BASE}/api/projects/${body.projectId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-username': username
          },
          body: JSON.stringify({
            storyboard: finalStoryboard,
            formData: body
          })
        });

        if (saveResponse.ok) {
          const saveResult = await saveResponse.json();
          console.log(`[storyboard-init] ✅ 프로젝트 저장 성공:`, {
            projectId: body.projectId,
            stylesCount: finalStoryboard.styles?.length,
            finalVideosCount: finalStoryboard.finalVideos?.length
          });
        } else {
          const errorText = await saveResponse.text();
          console.error(`[storyboard-init] ❌ 프로젝트 저장 실패 (${saveResponse.status}):`, errorText);
        }
      } catch (saveError) {
        console.error('[storyboard-init] ❌ 프로젝트 저장 오류:', saveError);
        // 저장 실패해도 전체 프로세스는 성공으로 처리
      }
    }

    console.log('[storyboard-init] ✅ 이미지 세트 생성 완료! (v4.1 워크플로우)');


  } catch (error) {
    console.error('[storyboard-init] ❌ 오류 발생:', error);
    await updateSession(sessionId, {
      status: 'error',
      error: { message: error.message || '오류 발생', stack: error.stack },
      progress: {
        phase: 'ERROR',
        percentage: 0,
        currentStep: '오류: ' + (error.message || '알 수 없는 오류')
      }
    });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const username = req.headers['x-username'] || 'anonymous';
  const sessionId = req.body.sessionId || `session_${Date.now()}_${username}`;

  // 🔥 추가: 세션 즉시 생성 및 상태 체크
  let session = sessionStore.getSession(sessionId);
  if (!session) {
    console.log(`[storyboard-init] 🆕 세션 생성: ${sessionId}`);
    sessionStore.createSession(sessionId, {
      username: username,
      formData: req.body,
      startedAt: Date.now()
    });
  } else {
    console.log(`[storyboard-init] ✅ 기존 세션 확인: ${sessionId} (상태: ${session.status})`);

    // 🔥 이미 완료되었거나 진행 중인 경우 중복 실행 방지
    if (session.status === 'completed' || session.status === 'in_progress') {
      console.log(`[storyboard-init] ⏭️ 이미 ${session.status} 상태인 세션입니다. 백그라운드 프로세스를 다시 시작하지 않습니다.`);
      return res.status(200).json({
        success: true,
        sessionId: sessionId,
        status: session.status,
        message: '기존 세션이 이미 진행 중이거나 완료되었습니다.'
      });
    }

    // 에러 상태였거나 다른 경우라면 재시도 허용 (세션 초기화 후 재시작)
    sessionStore.updateSession(sessionId, {
      status: 'in_progress',
      error: null,
      progress: { phase: 'INIT', percentage: 0, currentStep: '프로세스 재시작 중...' }
    });
  }

  res.status(202).json({
    success: true,
    sessionId: sessionId,
    message: '🚀 전체 자동화 파이프라인 시작'
  });

  processStoryboardAsync(req.body, username, sessionId).catch(err => {
    console.error('[storyboard-init] 백그라운드 처리 실패:', err);
  });
}

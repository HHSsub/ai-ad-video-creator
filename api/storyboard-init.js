const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const jitter = ms=>Math.round(ms*(0.7+Math.random()*0.6));

function retryable(e){
  const c = e?.status;
  const m = (e?.message||'').toLowerCase();
  if([429,500,502,503,504].includes(c)) return true;
  if(m.includes('overload')||m.includes('quota')||m.includes('timeout')||m.includes('fetch')) return true;
  return false;
}

// 🔥 수정: 다중 사용자 대응 Gemini 호출 함수
async function callGeminiWithKeyManager(prompt, label, sessionId = 'default'){
  const keyResult = storyboardKeyManager.selectKeyForStoryboard(sessionId);
  
  if (!keyResult) {
    throw new Error(`${label} 실패: 사용 가능한 Gemini API 키가 없습니다`);
  }

  const { key: apiKey, index: keyIndex } = keyResult;
  
  // Step1 또는 Step2 마킹
  if (label.includes('STEP1')) {
    storyboardKeyManager.markStep1Start(keyIndex, sessionId);
  } else if (label.includes('STEP2')) {
    storyboardKeyManager.markStep2Start(keyIndex, sessionId);
  }

  try {
    console.log(`[callGeminiWithKeyManager] ${label} 세션=${sessionId} 키=${keyIndex} 시작`);
    
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 🔥 NEW: 스마트 딜레이 (키 개수에 따라 조정)
    const dynamicDelay = storyboardKeyManager.keys.length >= 3 ? 1000 : 3000;
    if (label.includes('STEP2')) {
      console.log(`[callGeminiWithKeyManager] Step1→Step2 간격 조정: ${dynamicDelay}ms`);
      await sleep(dynamicDelay);
    }

    let attempt = 0;
    const maxAttempts = storyboardKeyManager.keys.length >= 2 ? 6 : 8; // 키가 많으면 재시도 줄임
    let lastError = null;

    // 재시도 루프 (키별로 최적화)
    for (; attempt < maxAttempts; attempt++) {
      try {
        console.log(`[callGeminiWithKeyManager] ${label} 키=${keyIndex} 시도=${attempt+1}/${maxAttempts}`);
        
        const model = genAI.getGenerativeModel({
          model: attempt < 4 ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite' // 4회 실패 후 fallback
        });
        
        const startTime = Date.now();
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const processingTime = Date.now() - startTime;
        
        console.log(`[callGeminiWithKeyManager] ${label} 키=${keyIndex} 성공 ${processingTime}ms (len=${text.length})`);
        
        return { 
          text, 
          model: attempt < 4 ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite',
          took: processingTime, 
          attempts: attempt + 1,
          keyIndex,
          sessionId
        };
        
      } catch (e) {
        lastError = e;
        console.warn(`[callGeminiWithKeyManager] ${label} 키=${keyIndex} 시도=${attempt+1} 실패: ${e.message}`);
        
        if (!retryable(e)) {
          throw e; // 재시도 불가능한 오류
        }
        
        // Rate Limit 감지시 다른 키로 전환 시도
        if (e.message.includes('429') || e.message.includes('overload')) {
          const altKeyResult = storyboardKeyManager.selectKeyForStoryboard(sessionId + '_retry');
          if (altKeyResult && altKeyResult.index !== keyIndex) {
            console.log(`[callGeminiWithKeyManager] ${label} Rate Limit → 키 ${keyIndex}에서 ${altKeyResult.index}로 전환`);
            // 키 변경하고 재시도
            const altApiKey = altKeyResult.key;
            const altGenAI = new GoogleGenerativeAI(altApiKey);
            const altModel = altGenAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
            
            try {
              await sleep(2000); // 키 전환시 추가 대기
              const altResult = await altModel.generateContent(prompt);
              const altText = altResult.response.text();
              console.log(`[callGeminiWithKeyManager] ${label} 키 전환 성공: ${altKeyResult.index}`);
              
              return {
                text: altText,
                model: 'gemini-2.5-flash',
                took: Date.now() - startTime,
                attempts: attempt + 1,
                keyIndex: altKeyResult.index,
                sessionId,
                keySwitched: true
              };
            } catch (altError) {
              console.warn(`[callGeminiWithKeyManager] ${label} 키 전환도 실패: ${altError.message}`);
            }
          }
        }
        
        // 지수 백오프
        const delay = jitter(1500 * Math.pow(1.5, attempt));
        console.log(`[callGeminiWithKeyManager] ${label} ${delay}ms 후 재시도...`);
        await sleep(delay);
      }
    }
    
    throw lastError || new Error(`${label} 최대 재시도 초과 (키=${keyIndex})`);
    
  } finally {
    // 🔥 중요: 에러든 성공이든 반드시 키 사용 완료 처리는 마지막에 수행
    // 여기서는 Step1, Step2 개별 완료가 아닌 전체 세션 완료시에만 처리하도록 변경
  }
}

/* =========================================================
   기존 PRODUCT COMPOSITING SCENE 감지 함수 - 변경 없음
========================================================= */

function detectProductCompositingScenes(storyboardText, videoPurpose) {
  const compositingScenes = [];
  
  const explicitPattern = /\[PRODUCT COMPOSITING SCENE\]/gi;
  const explicitMatches = storyboardText.match(explicitPattern);
  
  if (explicitMatches) {
    console.log(`[detectProductCompositingScenes] 명시적 PRODUCT COMPOSITING SCENE 발견: ${explicitMatches.length}개`);
    
    let searchPos = 0;
    storyboardText.replace(explicitPattern, (match, offset) => {
      const beforeText = storyboardText.slice(0, offset);
      const sceneMatches = beforeText.match(/S#(\d+)/g);
      if (sceneMatches && sceneMatches.length > 0) {
        const lastScene = sceneMatches[sceneMatches.length - 1];
        const sceneNumber = parseInt(lastScene.replace('S#', ''), 10);
        compositingScenes.push({
          sceneNumber,
          explicit: true,
          context: 'PRODUCT_COMPOSITING_SCENE'
        });
        console.log(`[detectProductCompositingScenes] Scene ${sceneNumber}에서 명시적 합성 지점 발견`);
      }
      return match;
    });
  } else {
    console.log(`[detectProductCompositingScenes] 명시적 지점 없음, 영상 목적(${videoPurpose})에 따른 자동 감지`);
    
    if (videoPurpose === '구매 전환') {
      compositingScenes.push({
        sceneNumber: 2,
        explicit: false,
        context: 'AUTO_PURCHASE_CONVERSION'
      });
    } else {
      const sceneMatches = storyboardText.match(/S#(\d+)/g);
      if (sceneMatches && sceneMatches.length > 0) {
        const lastSceneMatch = sceneMatches[sceneMatches.length - 1];
        const lastSceneNumber = parseInt(lastSceneMatch.replace('S#', ''), 10);
        compositingScenes.push({
          sceneNumber: lastSceneNumber,
          explicit: false,
          context: 'AUTO_BRAND_AWARENESS'
        });
      }
    }
  }
  
  return compositingScenes;
}

/* =========================================================
   기존 프롬프트 빌더들 - 변경 없음
========================================================= */

function buildStep1Prompt(fd, videoLengthSeconds, sceneCountPerConcept){
  if(!INPUT_SECOND_PROMPT) throw new Error('input_second_prompt.txt 누락');

  let p = INPUT_SECOND_PROMPT
    .replaceAll('{brandName}', String(fd.brandName||''))
    .replaceAll('{industryCategory}', String(fd.industryCategory||''))
    .replaceAll('{productServiceCategory}', String(fd.productServiceCategory||''))
    .replaceAll('{productServiceName}', String(fd.productServiceName||''))
    .replaceAll('{videoPurpose}', String(fd.videoPurpose||''))
    .replaceAll('{videoLength}', String(fd.videoLength|| (videoLengthSeconds+'초')))
    .replaceAll('{coreTarget}', String(fd.coreTarget||''))
    .replaceAll('{coreDifferentiation}', String(fd.coreDifferentiation||''))
    .replaceAll('{videoRequirements}', String(fd.videoRequirements||''))
    .replaceAll('{brandLogo}', fd.brandLogo ? '업로드됨':'없음')
    .replaceAll('{productImage}', fd.productImage ? '업로드됨':'없음')
    .replaceAll('{aspectRatioCode}', mapAspectRatio(fd))
    .replaceAll('{videoLengthSeconds}', String(videoLengthSeconds))
    .replaceAll('{targetSceneCount}', String(sceneCountPerConcept))
    .replaceAll('{duration}', String(videoLengthSeconds))
    .replaceAll('{scene_count}', String(sceneCountPerConcept));

  return p;
}

function extractConceptBlocks(raw){
  if(!raw) return [];
  
  const patterns = [
    /\*\*\s*(\d+)\.\s*컨셉:\s*([^\*\n]+?)\s*\*\*/g,
    /\*\*\s*컨셉\s*(\d+):\s*([^\*\n]+?)\s*\*\*/g,
    /\*\*\s*(\d+)\s*\.\s*([^\*\n]+?)\s*\*\*/g,
    /## \s*(\d+)\.\s*컨셉:\s*([^\n]+)/g,
    /### \s*(\d+)\.\s*컨셉:\s*([^\n]+)/g,
    /(\d+)\.\s*컨셉:\s*([^\n\*]+)/g,
    /\*\*\s*(\d+)\s*[\.:]?\s*([가-힣\w\s]+?)\s*\*\*/g
  ];
  
  const matches = [];
  
  for (const pattern of patterns) {
    let m;
    pattern.lastIndex = 0;
    
    while ((m = pattern.exec(raw)) !== null) {
      const idx = parseInt(m[1], 10);
      const name = (m[2] || '').trim();
      
      if (idx >= 1 && idx <= 6 && name.length > 0) {
        matches.push({ 
          idx, 
          name, 
          start: m.index,
          fullMatch: m[0]
        });
        console.log(`[extractConceptBlocks] 패턴 발견: ${idx}. ${name} (pos: ${m.index})`);
      }
    }
    
    if (matches.length >= 3) break;
  }
  
  console.log(`[extractConceptBlocks] 총 ${matches.length}개 컨셉 헤더 발견`);
  
  if (matches.length === 0) {
    console.warn('[storyboard-init][Z2M] 🔥 컨셉 헤더 패턴 미검출 - 자동 생성 모드');
    return generateFallbackConcepts();
  }
  
  matches.sort((a, b) => a.start - b.start);
  
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    cur.block = raw.slice(cur.start, next ? next.start : raw.length).trim();
  }
  
  const conceptMap = new Map();
  for (const c of matches) {
    if (c.idx >= 1 && c.idx <= 6 && !conceptMap.has(c.idx)) {
      conceptMap.set(c.idx, {
        concept_id: c.idx, 
        concept_name: c.name, 
        raw_block: c.block
      });
    }
  }
  
  const out = [];
  for (let i = 1; i <= 6; i++) {
    if (conceptMap.has(i)) {
      out.push(conceptMap.get(i));
    }
  }
  
  if (out.length < 6) {
    console.warn(`[extractConceptBlocks] 추출된 컨셉 수 ${out.length}/6 -> 자동 생성으로 채움`);
    const fallbackConcepts = generateFallbackConcepts();
    
    for (let i = 1; i <= 6; i++) {
      if (!out.find(o => o.concept_id === i)) {
        const fallback = fallbackConcepts.find(f => f.concept_id === i);
        if (fallback) {
          out.push(fallback);
        }
      }
    }
  }
  
  out.sort((a, b) => a.concept_id - b.concept_id);
  
  console.log(`[extractConceptBlocks] 최종 컨셉 수: ${out.length}/6`);
  return out;
}

function generateFallbackConcepts() {
  return [
    {
      concept_id: 1,
      concept_name: "욕망의 시각화",
      raw_block: "타겟 오디언스의 심리 깊숙한 곳에 내재된 근원적 욕구를 감각적이고 상징적인 비주얼로 구현합니다."
    },
    {
      concept_id: 2,
      concept_name: "이질적 조합의 미학",
      raw_block: "브랜드나 제품의 속성과 전혀 관련 없어 보이는 시각적, 청각적, 서사적 요소를 의도적으로 충돌시켜 시청자의 예측을 파괴합니다."
    },
    {
      concept_id: 3,
      concept_name: "핵심 가치의 극대화",
      raw_block: "브랜드가 가진 가장 강력하고 본질적인 핵심 가치 하나만을 선택하여, 그것이 세상의 유일한 법칙인 것처럼 시각적/서사적으로 극단까지 밀어붙입니다."
    },
    {
      concept_id: 4,
      concept_name: "기회비용의 시각화",
      raw_block: "제품/서비스를 사용했을 때의 이점이 아닌, 사용하지 않았을 때 발생하는 손해를 구체적이고 현실감 있게 보여주는 네거티브 접근 방식입니다."
    },
    {
      concept_id: 5,
      concept_name: "트렌드 융합",
      raw_block: "타겟이 열광하는 사회문화적 트렌드(밈, 챌린지, AI 등)를 브랜드 메시지와 자연스럽게 융합합니다."
    },
    {
      concept_id: 6,
      concept_name: "파격적 반전",
      raw_block: "시청자가 특정 장르의 클리셰를 따라가도록 유도하다가, 결말 부분에서 모든 예상을 뒤엎는 파격적인 반전을 통해 브랜드 메시지를 극적으로 각인시킵니다."
    }
  ];
}

function buildFinalPrompt(phase1Output, conceptBlocks, fd, sceneCountPerConcept){
  if(!FINAL_PROMPT) throw new Error('final_prompt.txt 누락');
  const videoLengthSeconds = parseVideoLengthSeconds(fd.videoLength);
  const aspectRatioCode = mapAspectRatio(fd);

  const conceptsForPrompt = conceptBlocks
    .map(c=>`- (${c.concept_id}) ${c.concept_name}: ${c.raw_block.slice(0,400)}`)
    .join('\n');

  const override = `
[OVERRIDE MULTI-CONCEPT JSON OUTPUT – IGNORE ANY PREVIOUS SINGLE "scenes" SPEC]

Return EXACTLY ONE VALID JSON object:

{
  "project_meta":{
    "brand":"${fd.brandName||''}",
    "product_or_category":"${fd.productServiceName||fd.productServiceCategory||''}",
    "industry":"${fd.industryCategory||''}",
    "target":"${fd.coreTarget||''}",
    "purpose":"${fd.videoPurpose||''}",
    "differentiation":"${fd.coreDifferentiation||''}",
    "video_length_seconds":${videoLengthSeconds},
    "aspect_ratio":"${aspectRatioCode}",
    "logo_provided": ${fd.brandLogo? 'true':'false'},
    "product_image_provided": ${fd.productImage? 'true':'false'}
  },
  "concepts":[
    {
      "concept_id":1,
      "concept_name":"<must match original concept 1 name>",
      "image_prompts":[
        {
          "scene_number":1,
          "timecode":"00:00-00:02",
          "image_prompt":{
            "prompt":"[English, 7-part Flux Engine format, ends with camera sentence]",
            "negative_prompt":"blurry, low quality, watermark, logo, text, cartoon, distorted",
            "num_images":1,
            "image":{"size":"${aspectRatioCode}"},
            "styling":{
              "style":"photo/cinematic/etc.",
              "color":"color/vibrant/monochrome/etc.",
              "lighting":"natural/dramatic/soft/etc."
            },
            "guidance_scale":7.5,
            "seed":12345,
            "filter_nsfw":true
          },
          "motion_prompt":{"prompt":"[English, dynamic action only]"},
          "duration_seconds":2
        }
      ]
    }
  ]
}

MANDATORY RULES:
- EXACTLY 6 concepts.
- EACH concept has EXACTLY ${sceneCountPerConcept} scenes (no more, no less).
- All scene_number inside a concept = 1..${sceneCountPerConcept}.
- Distinct prompts across concepts.
- high-fidelity tokens; each prompt ends with camera sentence.
- Seeds: 5-digit (10000-99999) unique per (concept_id, scene_number).
- Output ONLY JSON.
- Root keys ONLY: project_meta, concepts.

REFERENCE CONCEPT MATERIAL:
${conceptsForPrompt}
[END OVERRIDE]`;

  return `${FINAL_PROMPT}\n\n${override}`;
}

function parseMultiConceptJSON(raw){
  if(!raw) return null;
  const first = raw.indexOf('{');
  const last  = raw.lastIndexOf('}');
  if(first<0 || last<0 || last<=first) return null;
  const slice = raw.slice(first, last+1);
  try{
    const obj = JSON.parse(slice);
    if(Array.isArray(obj.concepts) && obj.concepts.length===6){
      for(const concept of obj.concepts){
        if(!Array.isArray(concept.image_prompts) || concept.image_prompts.length<1){
          console.warn('[storyboard-init][Z2M] image_prompts missing in concept', concept.concept_id);
          return null;
        }
        for(const s of concept.image_prompts){
          if(!s.image_prompt || !s.motion_prompt){
            console.warn('[storyboard-init][Z2M] image_prompt/motion_prompt missing in scene', s.scene_number);
            return null;
          }
        }
      }
      return obj;
    }
    console.warn('[storyboard-init][Z2M] JSON concepts 형식 불완전');
    return obj;
  }catch(e){
    console.warn('[storyboard-init][Z2M] JSON 파싱 실패:', e.message);
    return null;
  }
}

function buildStylesFromConceptJson(conceptJson, sceneCountPerConcept, compositingScenes, formData){
  if(!conceptJson?.concepts) return [];
  
  return conceptJson.concepts.map(c=>{
    let arr = Array.isArray(c.image_prompts)? c.image_prompts : [];
    
    if(arr.length < sceneCountPerConcept && arr.length>0){
      const last = arr[arr.length-1];
      while(arr.length < sceneCountPerConcept){
        arr.push({...last, scene_number: arr.length+1, image_prompt:{...last.image_prompt, seed: Math.floor(10000 + Math.random()*90000)}});
      }
    }
    
    if(arr.length === 0){
      for(let i=1;i<=sceneCountPerConcept;i++){
        arr.push({
          scene_number:i,
          timecode:`00:${String((i-1)*2).padStart(2,'0')}-00:${String(i*2).padStart(2,'0')}`,
          image_prompt:{
            prompt:`Concept ${c.concept_name||'Concept'} placeholder scene ${i}. Insanely detailed, hyper-realistic, sharp focus, 8K, micro-details, cinematic lighting, ends with: Shot by ARRI Alexa Mini with a 50mm lens.`,
            negative_prompt:"blurry, low quality, watermark, logo, text, cartoon, distorted",
            num_images:1,
            image:{ size:'widescreen_16_9' },
            styling:{ style:'photo', color:'color', lighting:'natural' },
            guidance_scale:7.5,
            seed: Math.floor(10000 + Math.random()*90000),
            filter_nsfw:true
          },
          motion_prompt:{ prompt:'Subtle camera drift.'},
          duration_seconds:2
        });
      }
    }
    
    arr.sort((a,b)=>(a.scene_number||0)-(b.scene_number||0));
    
    const imagePrompts = arr.map(sc=>{
      const isCompositingScene = compositingScenes.some(cs => cs.sceneNumber === sc.scene_number);
      
      return {
        sceneNumber: sc.scene_number,
        title: `Scene ${sc.scene_number}`,
        duration: sc.duration_seconds || 2,
        prompt: sc.image_prompt?.prompt || 'Fallback prompt, insanely detailed, micro-details, hyper-realistic textures, visible skin pores, 8K, sharp focus. Shot by ARRI Alexa Mini with a 50mm lens.',
        negative_prompt: sc.image_prompt?.negative_prompt || "blurry, low quality, watermark, logo, text, cartoon, distorted",
        styling: sc.image_prompt?.styling || { style:"photo", color:"color", lighting:"natural" },
        size: sc.image_prompt?.image?.size || "widescreen_16_9",
        guidance_scale: sc.image_prompt?.guidance_scale || 7.5,
        seed: sc.image_prompt?.seed || Math.floor(10000 + Math.random()*90000),
        filter_nsfw: sc.image_prompt?.filter_nsfw !== undefined ? sc.image_prompt.filter_nsfw : true,
        motion_prompt: sc.motion_prompt?.prompt || "Subtle camera drift.",
        timecode: sc.timecode || "",
        isCompositingScene: isCompositingScene,
        compositingInfo: isCompositingScene ? {
          needsProductImage: formData.productImageProvided || false,
          needsBrandLogo: formData.brandLogoProvided || false,
          compositingContext: compositingScenes.find(cs => cs.sceneNumber === sc.scene_number)?.context || 'unknown'
        } : null
      };
    });

    return {
      concept_id: c.concept_id,
      style: c.concept_name,
      name: c.concept_name,
      summary: c.summary || `Generated concept ${c.concept_name}`,
      keywords: [],
      imagePrompts: imagePrompts
    };
  });
}

/* =========================================================
   메인 핸들러 (다중 사용자 대응)
========================================================= */

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const t0=Date.now();
  
  // 🔥 NEW: 세션 ID 생성 (다중 사용자 구분)
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  let selectedKeyIndex = null;
  
  console.log('================ [storyboard-init][다중사용자] START ================');
  console.log(`[storyboard-init] 세션 시작: ${sessionId}`);
  console.log(`[storyboard-init] 현재 키 사용 현황:`, storyboardKeyManager.getUsageStats());

  try{
    const { formData } = req.body || {};
    if(!formData) return res.status(400).json({error:'formData required'});
    if(!INPUT_SECOND_PROMPT) throw new Error('input_second_prompt.txt 누락');
    if(!FINAL_PROMPT)        throw new Error('final_prompt.txt 누락');

    // 🔥 NEW: API 키 가용성 체크
    if (storyboardKeyManager.keys.length === 0) {
      console.error(`[storyboard-init] 세션 ${sessionId}: 사용 가능한 Gemini API 키가 없음`);
      throw new Error('사용 가능한 Gemini API 키가 없습니다. 환경변수를 확인해주세요.');
    }

    const videoLengthSeconds = parseVideoLengthSeconds(formData.videoLength);
    const sceneCountPerConcept = calcSceneCountPerConcept(videoLengthSeconds);

    console.log(`[storyboard-init] 세션 ${sessionId}: videoLengthSeconds=${videoLengthSeconds} sceneCountPerConcept=${sceneCountPerConcept}`);

    /* STEP1 - 다중 사용자 대응 */
    const step1Prompt = buildStep1Prompt(formData, videoLengthSeconds, sceneCountPerConcept);
    console.log(`[storyboard-init] 세션 ${sessionId}: STEP1 promptLen=${step1Prompt.length}`);
    
    const step1 = await callGeminiWithKeyManager(step1Prompt, 'STEP1', sessionId);
    selectedKeyIndex = step1.keyIndex;
    const phase1_output = step1.text;

    const compositingScenes = detectProductCompositingScenes(phase1_output, formData.videoPurpose);
    console.log(`[storyboard-init] 세션 ${sessionId}: 감지된 합성 씬:`, compositingScenes);

    const conceptBlocks = extractConceptBlocks(phase1_output);

    /* STEP2 - 같은 키 사용 권장 */
    const step2Prompt = buildFinalPrompt(phase1_output, conceptBlocks, formData, sceneCountPerConcept);
    console.log(`[storyboard-init] 세션 ${sessionId}: STEP2 promptLen=${step2Prompt.length}`);
    
    const step2 = await callGeminiWithKeyManager(step2Prompt, 'STEP2', sessionId);
    const mcJson = parseMultiConceptJSON(step2.text);

    let styles=[];
    if(mcJson && Array.isArray(mcJson.concepts) && mcJson.concepts.length===6){
      styles = buildStylesFromConceptJson(mcJson, sceneCountPerConcept, compositingScenes, formData);
      console.log(`[storyboard-init] 세션 ${sessionId}: multi-concept JSON 파싱 성공 (6 concepts)`);
    } else {
      console.warn(`[storyboard-init] 세션 ${sessionId}: multi-concept JSON 미구현 → placeholder 구성`);
      styles = conceptBlocks.map(c=>{
        const imagePrompts=[];
        for(let i=1;i<=sceneCountPerConcept;i++){
          const isCompositingScene = compositingScenes.some(cs => cs.sceneNumber === i);
          imagePrompts.push({
            sceneNumber:i,
            title:`Scene ${i}`,
            duration:2,
            prompt:`${c.concept_name} placeholder scene ${i}. Insanely detailed, hyper-realistic, 8K, sharp focus, cinematic lighting. Shot by ARRI Alexa Mini with a 50mm lens.`,
            negative_prompt:"blurry, low quality, watermark, logo, text, cartoon, distorted",
            styling:{ style:"photo", color:"color", lighting:"natural" },
            size:"widescreen_16_9",
            guidance_scale:7.5,
            seed: Math.floor(10000 + Math.random()*90000),
            filter_nsfw:true,
            motion_prompt:"Subtle camera drift.",
            timecode:`00:${String((i-1)*2).padStart(2,'0')}-00:${String(i*2).padStart(2,'0')}`,
            isCompositingScene: isCompositingScene,
            compositingInfo: isCompositingScene ? {
              needsProductImage: formData.productImageProvided || false,
              needsBrandLogo: formData.brandLogoProvided || false,
              compositingContext: compositingScenes.find(cs => cs.sceneNumber === i)?.context || 'fallback'
            } : null
          });
        }
        return {
          concept_id: c.concept_id,
          style: c.concept_name,
          name: c.concept_name,
          summary: 'Placeholder (JSON fallback)',
          keywords: [],
          imagePrompts
        };
      });
    }

    if(styles.length!==6){
      console.warn(`[storyboard-init] 세션 ${sessionId}: styles length !=6 최종 보정`);
      const existing = new Set(styles.map(s=>s.concept_id));
      for(let i=1;i<=6;i++){
        if(!existing.has(i)){
          const imagePrompts=[];
          for(let k=1;k<=sceneCountPerConcept;k++){
            const isCompositingScene = compositingScenes.some(cs => cs.sceneNumber === k);
            imagePrompts.push({
              sceneNumber:k,
              title:`Scene ${k}`,
              duration:2,
              prompt:`Concept ${i} auto-filled scene ${k}. Insanely detailed, hyper-realistic, 8K, sharp focus, cinematic lighting. Shot by RED Komodo with a 50mm lens.`,
              negative_prompt:"blurry, low quality, watermark, logo, text, cartoon, distorted",
              styling:{ style:"photo", color:"color", lighting:"natural" },
              size:"widescreen_16_9",
              guidance_scale:7.5,
              seed: Math.floor(10000 + Math.random()*90000),
              filter_nsfw:true,
              motion_prompt:"Subtle camera drift.",
              timecode:`00:${String((k-1)*2).padStart(2,'0')}-00:${String(k*2).padStart(2,'0')}`,
              isCompositingScene: isCompositingScene,
              compositingInfo: isCompositingScene ? {
                needsProductImage: formData.productImageProvided || false,
                needsBrandLogo: formData.brandLogoProvided || false,
                compositingContext: compositingScenes.find(cs => cs.sceneNumber === k)?.context || 'auto_filled'
              } : null
            });
          }
          styles.push({
            concept_id:i,
            style:`Concept ${i}`,
            name:`Concept ${i}`,
            summary:'Auto-filled',
            keywords:[],
            imagePrompts
          });
        }
      }
      styles.sort((a,b)=>a.concept_id-b.concept_id);
    }

    // 🔥 NEW: 세션 완료 처리
    if (selectedKeyIndex !== null) {
      storyboardKeyManager.markSessionComplete(selectedKeyIndex, sessionId);
    }

    const processingTime = Date.now() - t0;
    console.log(`[storyboard-init] 세션 ${sessionId}: 처리 완료 ${processingTime}ms`);
    console.log(`[storyboard-init] 최종 키 사용 현황:`, storyboardKeyManager.getUsageStats());

    res.status(200).json({
      success:true,
      styles,
      imagePrompts: styles[0]?.imagePrompts || [],
      compositingInfo: {
        scenes: compositingScenes,
        hasProductImage: formData.productImageProvided || false,
        hasBrandLogo: formData.brandLogoProvided || false,
        productImageData: formData.productImage || null,
        brandLogoData: formData.brandLogo || null
      },
      metadata:{
        sessionId,
        videoLengthSeconds,
        sceneCountPerConcept,
        totalImagesExpected: styles.length * sceneCountPerConcept,
        availableApiKeys: storyboardKeyManager.keys.length,
        usedKeyIndex: selectedKeyIndex,
        totalMs: processingTime,
        step1Model: step1.model,
        step2Model: step2.model,
        multiConceptJsonParsed: !!(mcJson && mcJson.concepts),
        conceptsDetectedFromStep1: conceptBlocks.length,
        z2multi:true,
        conceptBlocksGenerated: conceptBlocks.length === 0 ? 'fallback_auto_generated' : 'extracted_from_gemini',
        compositingScenesDetected: compositingScenes.length,
        compositingEnabled: compositingScenes.length > 0 && (formData.productImageProvided || formData.brandLogoProvided),
        // 🔥 NEW: 다중 사용자 관련 메타데이터
        multiUserStats: {
          sessionId,
          keySelected: selectedKeyIndex,
          keyPoolSize: storyboardKeyManager.keys.length,
          step1Attempts: step1.attempts,
          step2Attempts: step2.attempts,
          keySwitched: step1.keySwitched || step2.keySwitched || false,
          currentKeyUsage: storyboardKeyManager.getUsageStats()
        }
      }
    });

  }catch(e){
    console.error(`[storyboard-init] 세션 ${sessionId} 오류:`, e);
    
    // 🔥 NEW: 오류 시에도 키 해제
    if (selectedKeyIndex !== null) {
      storyboardKeyManager.markSessionComplete(selectedKeyIndex, sessionId);
    }
    
    res.status(500).json({
      success:false,
      error:e.message,
      sessionId,
      availableApiKeys: storyboardKeyManager.keys.length,
      keyUsageStats: storyboardKeyManager.getUsageStats()
    });
  }finally{
    console.log(`================ [storyboard-init] 세션 ${sessionId} END ================`);
  }
}// api/storyboard-init.js - 다중 사용자 대응 Gemini API 키 분배 시스템

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

/* =========================================================
   다중 사용자 대응 API 키 관리 시스템
========================================================= */

// 🔥 NEW: 다중 Gemini API 키 풀
const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.VITE_GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5
].filter(Boolean);

// 🔥 NEW: 스마트 키 관리자 (storyboard-init용)
class StoryboardApiKeyManager {
  constructor(keys) {
    this.keys = keys.filter(Boolean);
    this.usage = new Map(); // keyIndex -> { step1: timestamp, step2: timestamp, concurrent: count }
    
    console.log(`[StoryboardApiKeyManager] 초기화: ${this.keys.length}개 키 사용 가능`);
    
    if (this.keys.length === 0) {
      console.error('[StoryboardApiKeyManager] ❌ 사용 가능한 Gemini API 키가 없습니다!');
    }
  }
  
  // Step1과 Step2를 연속으로 사용할 최적의 키 선택
  selectKeyForStoryboard(sessionId = 'default') {
    if (this.keys.length === 0) return null;
    if (this.keys.length === 1) return { key: this.keys[0], index: 0 };
    
    const now = Date.now();
    let bestIndex = 0;
    let minScore = Infinity;
    
    // 각 키의 부하 점수 계산
    for (let i = 0; i < this.keys.length; i++) {
      const usage = this.usage.get(i) || { step1: 0, step2: 0, concurrent: 0 };
      
      // 점수 = 동시사용 * 10000 + 최근 사용으로부터의 시간 페널티
      const recentUsage = Math.max(usage.step1, usage.step2);
      const timePenalty = Math.max(0, 30000 - (now - recentUsage)); // 30초 이내 사용시 페널티
      const score = usage.concurrent * 10000 + timePenalty;
      
      if (score < minScore) {
        minScore = score;
        bestIndex = i;
      }
    }
    
    console.log(`[StoryboardApiKeyManager] 세션 ${sessionId}: 키 ${bestIndex} 선택 (점수: ${minScore})`);
    return { key: this.keys[bestIndex], index: bestIndex };
  }
  
  // Step1 시작
  markStep1Start(keyIndex, sessionId = 'default') {
    if (!this.usage.has(keyIndex)) {
      this.usage.set(keyIndex, { step1: 0, step2: 0, concurrent: 0 });
    }
    this.usage.get(keyIndex).step1 = Date.now();
    this.usage.get(keyIndex).concurrent++;
    console.log(`[StoryboardApiKeyManager] 세션 ${sessionId}: 키 ${keyIndex} Step1 시작 (동시: ${this.usage.get(keyIndex).concurrent})`);
  }
  
  // Step2 시작 (Step1과 같은 키 권장)
  markStep2Start(keyIndex, sessionId = 'default') {
    if (this.usage.has(keyIndex)) {
      this.usage.get(keyIndex).step2 = Date.now();
      console.log(`[StoryboardApiKeyManager] 세션 ${sessionId}: 키 ${keyIndex} Step2 시작`);
    }
  }
  
  // 세션 완료 (Step1, Step2 모두 끝남)
  markSessionComplete(keyIndex, sessionId = 'default') {
    if (this.usage.has(keyIndex)) {
      this.usage.get(keyIndex).concurrent = Math.max(0, this.usage.get(keyIndex).concurrent - 1);
      console.log(`[StoryboardApiKeyManager] 세션 ${sessionId}: 키 ${keyIndex} 완료 (동시: ${this.usage.get(keyIndex).concurrent})`);
    }
  }
  
  // 현재 사용 현황
  getUsageStats() {
    const stats = {};
    for (let i = 0; i < this.keys.length; i++) {
      const usage = this.usage.get(i) || { step1: 0, step2: 0, concurrent: 0 };
      stats[`key_${i}`] = {
        concurrent: usage.concurrent,
        lastStep1: usage.step1 ? new Date(usage.step1).toISOString() : 'never',
        lastStep2: usage.step2 ? new Date(usage.step2).toISOString() : 'never'
      };
    }
    return stats;
  }
}

// 글로벌 키 매니저
const storyboardKeyManager = new StoryboardApiKeyManager(GEMINI_API_KEYS);

/* =========================================================
   기존 코드 (텍스트 로더 등) - 변경 없음
========================================================= */

function loadTxt(name){
  const p = path.resolve(process.cwd(),'public',name);
  if(!fs.existsSync(p)){
    console.error(`[storyboard-init][Z2M] 템플릿 누락: ${name} (${p})`);
    return null;
  }
  const txt = fs.readFileSync(p,'utf-8');
  console.log(`[storyboard-init][Z2M] 템플릿 로드: ${name} (${txt.length} chars)`);
  return txt;
}

const INPUT_SECOND_PROMPT = loadTxt('input_second_prompt.txt'); // STEP1
const FINAL_PROMPT        = loadTxt('final_prompt.txt');        // STEP2 (JSON)

/* =========================================================
   기존 유틸 함수들 - 변경 없음
========================================================= */

function parseVideoLengthSeconds(raw){
  if(raw == null) return 10;
  if(typeof raw === 'number') return raw;
  const m = String(raw).match(/\d+/);
  if(!m) return 10;
  const n = parseInt(m[0],10);
  return (isNaN(n)||n<=0)?10:n;
}

function calcSceneCountPerConcept(sec){
  const n = Math.floor(sec/2);
  return n<1?1:n;
}

function mapAspectRatio(formData){
  const v = (formData?.videoAspectRatio || formData?.aspectRatio || '').toString().trim().toLowerCase();
  if(['9:16','vertical','portrait'].includes(v)) return 'vertical_9_16';
  if(['1:1','square'].includes(v)) return 'square_1_1';
  if(['4:5','portrait_4_5','4:5portrait'].includes(v)) return 'portrait_4_5';
  return 'widescreen_16_9';
}

const sleep = ms=>new Promise(r

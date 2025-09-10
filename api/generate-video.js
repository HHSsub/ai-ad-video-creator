export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { selectedStyle, selectedImages, formData, targetTotalDuration } = req.body;

    if (!selectedStyle || !selectedImages || selectedImages.length === 0) {
      return res.status(400).json({ 
        error: 'Selected style and images are required' 
      });
    }

    console.log('영상 생성 요청:', {
      style: selectedStyle,
      imageCount: selectedImages.length,
      targetDuration: targetTotalDuration || formData?.videoLength,
      brandName: formData?.brandName
    });

    const freepikApiKey = process.env.FREEPIK_API_KEY || 
                          process.env.REACT_APP_FREEPIK_API_KEY || 
                          process.env.VITE_FREEPIK_API_KEY;

    if (!freepikApiKey) {
      throw new Error('Freepik API key not found');
    }

    // 영상 길이 계산
    const totalSeconds = parseInt(targetTotalDuration || formData?.videoLength || 30);
    const imageCount = selectedImages.length;
    const segmentDuration = Math.max(2, Math.floor(totalSeconds / imageCount)); // 최소 2초

    console.log('영상 길이 계산:', {
      총길이: totalSeconds + '초',
      이미지수: imageCount + '개',
      세그먼트길이: segmentDuration + '초'
    });

    const videoSegments = [];
    const failedSegments = [];

    // 각 이미지를 비디오로 변환
    for (let i = 0; i < selectedImages.length; i++) {
      const image = selectedImages[i];
      
      console.log(`비디오 ${i + 1}/${selectedImages.length} 생성 중: ${image.title}`);

      try {
        // 각 세그먼트에 계산된 길이 적용
        const videoResult = await generateVideoFromImage(
          image, 
          freepikApiKey, 
          formData, 
          segmentDuration // 계산된 세그먼트 길이 전달
        );
        
        if (videoResult.success) {
          videoSegments.push({
            segmentId: `segment-${i + 1}`,
            sceneNumber: i + 1,
            originalImage: image,
            taskId: videoResult.taskId,
            videoUrl: videoResult.videoUrl, // 완료된 경우
            status: videoResult.status,
            duration: segmentDuration, // 요청된 길이
            prompt: generateVideoPrompt(image, formData),
            createdAt: new Date().toISOString()
          });
        } else {
          throw new Error(videoResult.error || 'Video generation failed');
        }

      } catch (error) {
        console.error(`비디오 ${i + 1} 생성 실패:`, error.message);
        
        failedSegments.push({
          segmentId: `segment-${i + 1}`,
          sceneNumber: i + 1,
          originalImage: image,
          error: error.message,
          status: 'failed',
          duration: segmentDuration
        });
      }

      // API 호출 간격 조정 (레이트 리미팅 방지)
      if (i < selectedImages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 실제 총 시간 계산
    const actualTotalDuration = videoSegments.reduce((sum, segment) => sum + segment.duration, 0);
    
    const response = {
      success: true,
      videoProject: {
        projectId: `project-${Date.now()}`,
        brandName: formData?.brandName || 'Unknown',
        selectedStyle: selectedStyle,
        totalSegments: selectedImages.length,
        successfulSegments: videoSegments.length,
        failedSegments: failedSegments.length,
        requestedDuration: totalSeconds,
        actualDuration: actualTotalDuration,
        segmentDuration: segmentDuration,
        status: failedSegments.length === 0 ? 'all_completed' : 'partial_completed',
        createdAt: new Date().toISOString()
      },
      videoSegments: videoSegments,
      failedSegments: failedSegments,
      durationInfo: {
        requested: totalSeconds,
        actual: actualTotalDuration,
        perSegment: segmentDuration,
        segments: selectedImages.length,
        note: `각 세그먼트는 ${segmentDuration}초로 설정되어 총 ${actualTotalDuration}초 영상이 생성됩니다.`
      },
      compilationGuide: {
        tool: 'FFmpeg',
        command: generateFFmpegCommand(videoSegments),
        instruction: '생성된 비디오 세그먼트들을 하나의 영상으로 합칩니다.',
        estimated_final_size: `${Math.ceil(actualTotalDuration * 10)}MB`,
        resolution: '1920x1080'
      },
      metadata: {
        apiProvider: 'Freepik',
        model: 'minimax-hailuo-02-768p',
        generatedAt: new Date().toISOString(),
        processingTime: 'Variable (depends on queue)',
        note: 'Video generation is asynchronous. Check status using task IDs.'
      }
    };

    console.log('영상 생성 프로젝트 완료:', {
      총세그먼트: response.videoProject.totalSegments,
      성공: response.videoProject.successfulSegments,
      실패: response.videoProject.failedSegments,
      요청시간: response.videoProject.requestedDuration + '초',
      실제시간: response.videoProject.actualDuration + '초'
    });

    res.status(200).json(response);

  } catch (error) {
    console.error('영상 생성 중 전체 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * 이미지를 비디오로 변환하는 함수 (수정된 길이 지원)
 */
async function generateVideoFromImage(image, apiKey, formData, segmentDuration) {
  try {
    // 이미지 URL 검증
    if (!image.url) {
      throw new Error('Image URL is required for video generation');
    }

    // 비디오 생성을 위한 프롬프트 생성
    const videoPrompt = generateVideoPrompt(image, formData);

    console.log('비디오 생성 요청:', {
      imageUrl: image.url,
      prompt: videoPrompt.substring(0, 100) + '...',
      duration: segmentDuration
    });

    // Freepik Image-to-Video API 호출 (수정된 길이 적용)
    const response = await fetch('https://api.freepik.com/v1/ai/image-to-video/minimax-hailuo-02-768p', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-freepik-api-key': apiKey
      },
      body: JSON.stringify({
        prompt: videoPrompt,
        first_frame_image: image.url,
        duration: segmentDuration >= 6 ? 10 : 6, // Freepik API는 6초 또는 10초만 허용
        webhook_url: null // 웹훅은 사용하지 않음
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`비디오 생성 API 오류 (${response.status}):`, errorText);
      throw new Error(`Video API failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('비디오 생성 API 응답:', result);

    if (result.data && result.data.task_id) {
      // 비동기 작업이므로 task_id 반환
      // 실제 비디오는 별도 폴링으로 확인 필요
      return {
        success: true,
        taskId: result.data.task_id,
        status: 'IN_PROGRESS',
        videoUrl: null, // 나중에 폴링으로 획득
        requestedDuration: segmentDuration
      };
    } else {
      throw new Error('Invalid video generation response');
    }

  } catch (error) {
    console.error('비디오 생성 실패:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 이미지와 폼 데이터를 기반으로 비디오 프롬프트 생성 (길이 정보 포함)
 */
function generateVideoPrompt(image, formData) {
  const basePrompt = image.prompt || image.title || 'commercial advertisement scene';
  
  const motionKeywords = [
    'smooth camera movement',
    'professional cinematography', 
    'commercial video style',
    'high quality motion',
    'brand commercial'
  ];

  // 브랜드명과 산업 카테고리 추가
  const brandElements = [];
  if (formData?.brandName) {
    brandElements.push(formData.brandName);
  }
  if (formData?.industryCategory) {
    brandElements.push(formData.industryCategory);
  }

  // 영상 목적에 따른 스타일 조정
  let styleKeywords = [];
  if (formData?.videoPurpose === '브랜드 인지도 강화') {
    styleKeywords = ['memorable', 'impactful', 'brand focused'];
  } else if (formData?.videoPurpose === '구매 전환') {
    styleKeywords = ['persuasive', 'product focused', 'call to action'];
  } else if (formData?.videoPurpose === '신제품 출시') {
    styleKeywords = ['innovative', 'new', 'exciting reveal'];
  }

  // 영상 길이에 따른 페이싱 조정
  const totalDuration = parseInt(formData?.videoLength || 30);
  let pacingKeywords = [];
  if (totalDuration <= 15) {
    pacingKeywords = ['fast paced', 'quick cuts', 'dynamic'];
  } else if (totalDuration <= 30) {
    pacingKeywords = ['medium paced', 'smooth transitions'];
  } else {
    pacingKeywords = ['slow paced', 'cinematic', 'detailed'];
  }

  // 최종 프롬프트 구성
  const finalPrompt = [
    basePrompt,
    ...motionKeywords,
    ...brandElements,
    ...styleKeywords,
    ...pacingKeywords,
    `${formData?.videoLength} commercial advertisement`,
    'no text overlay', // 텍스트는 후처리에서 추가
    'professional lighting',
    '1920x1080 resolution'
  ].filter(Boolean).join(', ');

  return finalPrompt;
}

/**
 * 비디오 세그먼트들을 합치기 위한 FFmpeg 명령어 생성 (수정된 길이 지원)
 */
function generateFFmpegCommand(videoSegments) {
  if (!videoSegments || videoSegments.length === 0) {
    return 'No video segments available';
  }

  // 완료된 비디오만 필터링
  const completedVideos = videoSegments.filter(segment => 
    segment.videoUrl && segment.status === 'completed'
  );

  if (completedVideos.length === 0) {
    return 'No completed videos available for compilation';
  }

  // 입력 파일들
  const inputs = completedVideos.map((segment, index) => 
    `-i "segment_${index + 1}.mp4"`
  ).join(' ');

  // 연결 필터 (각 세그먼트의 길이 고려)
  const filterInputs = completedVideos.map((_, index) => `[${index}:v]`).join('');
  const audioInputs = completedVideos.map((_, index) => `[${index}:a]`).join('');
  
  const filter = `${filterInputs}concat=n=${completedVideos.length}:v=1:a=1[outv][outa]`;

  // 총 예상 길이 계산
  const totalExpectedDuration = completedVideos.reduce((sum, segment) => sum + (segment.duration || 5), 0);

  return `ffmpeg ${inputs} -filter_complex "${filter}" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -preset medium -crf 23 -t ${totalExpectedDuration} final_video.mp4`;
}

/**
 * 비디오 상태 확인을 위한 별도 함수 (폴링용)
 */
export async function checkVideoStatus(taskId, apiKey) {
  try {
    const response = await fetch(`https://api.freepik.com/v1/ai/image-to-video/minimax-hailuo-02-768p/${taskId}`, {
      method: 'GET',
      headers: {
        'x-freepik-api-key': apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.data) {
      return {
        taskId: taskId,
        status: result.data.status,
        videoUrl: result.data.result && result.data.result.length > 0 
          ? result.data.result[0].url 
          : null,
        progress: result.data.progress || 0,
        duration: result.data.result && result.data.result.length > 0
          ? result.data.result[0].duration
          : null
      };
    }

    return { taskId, status: 'UNKNOWN', videoUrl: null };

  } catch (error) {
    console.error(`Status check failed for task ${taskId}:`, error);
    return { taskId, status: 'ERROR', videoUrl: null, error: error.message };
  }
}

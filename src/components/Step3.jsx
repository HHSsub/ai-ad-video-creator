import React, { useState, useEffect } from 'react';

const Step3 = ({ formData, storyboard, onPrev, setIsLoading, isLoading }) => {
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const [videoProject, setVideoProject] = useState(null);
  const [videoProgress, setVideoProgress] = useState({});
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoError, setVideoError] = useState(null);

  // 스타일 선택 핸들러
  const handleStyleSelect = (styleData) => {
    setSelectedStyle(styleData);
    // 해당 스타일의 모든 이미지를 기본 선택
    setSelectedImages(styleData.images || []);
  };

  // 개별 이미지 선택/해제 핸들러
  const handleImageToggle = (imageId) => {
    setSelectedImages(prev => {
      if (prev.some(img => img.id === imageId)) {
        return prev.filter(img => img.id !== imageId);
      } else {
        const imageToAdd = selectedStyle.images.find(img => img.id === imageId);
        return [...prev, imageToAdd];
      }
    });
  };

  // 영상 생성 시작
  const handleGenerateVideo = async () => {
    if (selectedImages.length === 0) {
      alert('최소 1개 이상의 이미지를 선택해주세요.');
      return;
    }

    setIsGeneratingVideo(true);
    setVideoError(null);
    setVideoProgress({});

    try {
      console.log('영상 생성 시작:', {
        style: selectedStyle.style,
        imageCount: selectedImages.length
      });

      // 영상 생성 API 호출
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedStyle: selectedStyle.style,
          selectedImages: selectedImages,
          formData: formData
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `서버 오류: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '영상 생성에 실패했습니다.');
      }

      console.log('영상 생성 프로젝트 시작:', data.videoProject);
      setVideoProject(data);

      // 비디오 생성 상태 폴링 시작
      if (data.videoSegments && data.videoSegments.length > 0) {
        startVideoPolling(data.videoSegments);
      }

    } catch (error) {
      console.error('영상 생성 실패:', error);
      setVideoError(error.message);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // 비디오 생성 상태 폴링
  const startVideoPolling = async (videoSegments) => {
    const taskIds = videoSegments
      .filter(segment => segment.taskId)
      .map(segment => segment.taskId);

    if (taskIds.length === 0) {
      console.log('폴링할 task ID가 없습니다.');
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        console.log('비디오 상태 확인 중...');
        
        const response = await fetch('/api/video-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ taskIds }),
        });

        if (!response.ok) {
          throw new Error(`상태 확인 실패: ${response.status}`);
        }

        const statusData = await response.json();
        
        if (statusData.success) {
          setVideoProgress(statusData);

          // 모든 비디오가 완료되었거나 더 이상 진행되지 않으면 폴링 중단
          if (statusData.allCompleted || 
              (statusData.summary.failed + statusData.summary.completed === statusData.summary.total)) {
            console.log('비디오 생성 완료 또는 중단:', statusData.summary);
            clearInterval(pollInterval);
          }
        }

      } catch (error) {
        console.error('상태 확인 중 오류:', error);
        // 에러가 계속 발생하면 폴링 중단
        clearInterval(pollInterval);
      }
    }, 10000); // 10초마다 확인

    // 최대 10분 후 폴링 중단
    setTimeout(() => {
      clearInterval(pollInterval);
      console.log('폴링 타임아웃');
    }, 600000);
  };

  // 스타일 갤러리 컴포넌트
  const StyleGallery = () => {
    if (!storyboard || storyboard.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-500">생성된 스토리보드가 없습니다.</p>
        </div>
      );
    }

    return (
      <div className="mb-8">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">
          📋 스타일별 스토리보드 갤러리
        </h3>
        <p className="text-gray-600 mb-6">
          원하는 스타일을 선택하여 영상으로 제작하세요.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {storyboard.map((styleData, index) => (
            <div
              key={index}
              className={`border-2 rounded-lg overflow-hidden cursor-pointer transition-all duration-300 ${
                selectedStyle?.style === styleData.style
                  ? 'border-blue-500 shadow-lg ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
              }`}
              onClick={() => handleStyleSelect(styleData)}
            >
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b">
                <h4 className="font-semibold text-gray-800">{styleData.style}</h4>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-sm text-gray-600">
                    {styleData.images?.length || 0}개 이미지
                  </p>
                  {styleData.status === 'fallback' && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                      대체이미지
                    </span>
                  )}
                </div>
              </div>
              
              <div className="p-4">
                {styleData.images && styleData.images.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {styleData.images.slice(0, 4).map((image, imgIndex) => (
                      <div key={imgIndex} className="aspect-video bg-gray-100 rounded overflow-hidden">
                        <img
                          src={image.url || image.thumbnail}
                          alt={image.title || `${styleData.style} 이미지 ${imgIndex + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                        <div className="hidden w-full h-full bg-gray-200 items-center justify-center">
                          <span className="text-gray-500 text-xs">이미지 로드 실패</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-100 rounded flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm">이미지 없음</p>
                    </div>
                  </div>
                )}
                
                {styleData.images && styleData.images.length > 4 && (
                  <p className="text-center text-sm text-gray-500 mt-2">
                    +{styleData.images.length - 4}개 더보기
                  </p>
                )}
              </div>

              {selectedStyle?.style === styleData.style && (
                <div className="bg-blue-50 px-4 py-2 border-t">
                  <p className="text-sm text-blue-700 font-medium flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    선택된 스타일
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 선택된 스타일의 상세 이미지 컴포넌트
  const DetailedImageSelection = () => {
    if (!selectedStyle) return null;

    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-800">
            🎬 {selectedStyle.style} - 이미지 선택
          </h3>
          <div className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded">
            {selectedImages.length}개 선택됨
          </div>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg mb-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-blue-800">영상 생성 정보</h4>
              <p className="text-sm text-blue-700 mt-1">
                선택된 {selectedImages.length}개 이미지가 각각 {Math.ceil(parseInt(formData.videoLength) / selectedImages.length)}초 분량의 비디오로 변환됩니다.
                총 예상 영상 길이: {formData.videoLength}
              </p>
            </div>
          </div>
        </div>

        {selectedStyle.searchQuery && (
          <p className="text-sm text-gray-600 mb-4">
            🔍 검색어: {selectedStyle.searchQuery}
          </p>
        )}

        {selectedStyle.images && selectedStyle.images.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {selectedStyle.images.map((image, index) => {
              const isSelected = selectedImages.some(img => img.id === image.id);
              
              return (
                <div
                  key={image.id || index}
                  className={`border-2 rounded-lg overflow-hidden cursor-pointer transition-all duration-300 ${
                    isSelected
                      ? 'border-green-500 shadow-lg ring-2 ring-green-200'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                  }`}
                  onClick={() => handleImageToggle(image.id)}
                >
                  <div className="aspect-video bg-gray-100 relative">
                    <img
                      src={image.url || image.thumbnail}
                      alt={image.title || `이미지 ${index + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                    <div className="hidden absolute inset-0 bg-gray-200 items-center justify-center">
                      <span className="text-gray-500 text-sm">이미지 로드 실패</span>
                    </div>
                    
                    {/* 선택 표시 오버레이 */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-green-500 bg-opacity-20 flex items-center justify-center">
                        <div className="bg-green-500 text-white rounded-full p-2">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )}
                    
                    {/* 이미지 번호 */}
                    <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                      #{index + 1}
                    </div>

                    {/* 예상 지속 시간 */}
                    <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                      {image.duration || Math.ceil(parseInt(formData.videoLength) / selectedStyle.images.length)}초
                    </div>
                  </div>
                  
                  <div className="p-3">
                    <h4 className="font-medium text-gray-900 text-sm truncate mb-1">
                      {image.title || `Scene ${index + 1}`}
                    </h4>
                    
                    {/* 에러 표시 */}
                    {image.error && (
                      <p className="text-xs text-red-500 mb-1">오류: {image.error}</p>
                    )}

                    {/* 대체 이미지 표시 */}
                    {image.isFallback && (
                      <span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded mb-1">
                        대체이미지
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>이 스타일에는 사용 가능한 이미지가 없습니다.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 영상 생성 진행 상황 표시
  const VideoGenerationProgress = () => {
    if (!videoProject) return null;

    return (
      <div className="mb-8 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
        <h3 className="text-xl font-semibold text-purple-800 mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          🎬 영상 생성 진행 상황
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-white p-4 rounded shadow-sm">
            <div className="text-sm text-gray-600">총 세그먼트</div>
            <div className="text-xl font-bold text-gray-800">{videoProject.videoProject?.totalSegments || 0}</div>
          </div>
          <div className="bg-white p-4 rounded shadow-sm">
            <div className="text-sm text-gray-600">완료된 비디오</div>
            <div className="text-xl font-bold text-green-600">{videoProgress.summary?.completed || 0}</div>
          </div>
          <div className="bg-white p-4 rounded shadow-sm">
            <div className="text-sm text-gray-600">진행 중</div>
            <div className="text-xl font-bold text-blue-600">{videoProgress.summary?.inProgress || 0}</div>
          </div>
        </div>

        {/* 진행률 바 */}
        {videoProgress.summary && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>전체 진행률</span>
              <span>{Math.round((videoProgress.summary.completed / videoProgress.summary.total) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${Math.round((videoProgress.summary.completed / videoProgress.summary.total) * 100)}%` 
                }}
              ></div>
            </div>
          </div>
        )}

        {/* 완료된 비디오들 */}
        {videoProgress.completedVideos && videoProgress.completedVideos.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-800 mb-2">✅ 완료된 비디오 세그먼트</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {videoProgress.completedVideos.map((video, index) => (
                <div key={video.taskId} className="bg-white p-3 rounded shadow-sm">
                  <video 
                    src={video.videoUrl} 
                    controls 
                    className="w-full h-20 object-cover rounded mb-2"
                    muted
                    playsInline
                  />
                  <div className="text-xs text-gray-600">
                    세그먼트 {index + 1} | {video.duration}초
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FFmpeg 명령어 (모든 비디오가 완료되었을 때) */}
        {videoProgress.allCompleted && videoProject.compilationGuide && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
            <h4 className="font-medium text-green-800 mb-2">🎉 모든 비디오 완료! 최종 합치기 가이드</h4>
            <div className="text-sm text-green-700 mb-2">
              아래 FFmpeg 명령어를 사용하여 개별 비디오들을 하나로 합칠 수 있습니다:
            </div>
            <code className="block bg-gray-100 p-2 rounded text-xs break-all">
              {videoProject.compilationGuide.command}
            </code>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            3단계: 스타일 선택 및 영상 생성
          </h2>
          <p className="text-gray-600">
            생성된 스토리보드에서 원하는 스타일을 선택하고, 
            해당 스타일의 이미지들을 영상으로 변환해보세요.
          </p>
        </div>

        {/* 스타일 갤러리 */}
        <StyleGallery />

        {/* 선택된 스타일의 상세 이미지 */}
        <DetailedImageSelection />

        {/* 영상 생성 진행 상황 */}
        <VideoGenerationProgress />

        {/* 선택 요약 */}
        {selectedStyle && (
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <h4 className="font-medium text-blue-900 mb-2">📝 선택 요약</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <p><strong>선택된 스타일:</strong> {selectedStyle.style}</p>
              <p><strong>선택된 이미지:</strong> {selectedImages.length}개</p>
              <p><strong>예상 영상 길이:</strong> {formData.videoLength}</p>
              <p><strong>브랜드:</strong> {formData.brandName}</p>
              {videoProject && (
                <p><strong>생성 상태:</strong> {videoProject.videoProject?.status || '대기 중'}</p>
              )}
            </div>
          </div>
        )}

        {/* 에러 표시 */}
        {videoError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <strong>영상 생성 오류:</strong>
                <p className="mt-1">{videoError}</p>
              </div>
            </div>
          </div>
        )}

        {/* 액션 버튼들 */}
        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
          <button
            onClick={onPrev}
            className="flex items-center px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            이전 단계
          </button>

          <div className="flex gap-3">
            {!videoProject && (
              <button
                onClick={handleGenerateVideo}
                disabled={!selectedStyle || selectedImages.length === 0 || isGeneratingVideo}
                className="flex items-center px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {isGeneratingVideo ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    영상 생성 중...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    🎬 영상 생성 시작 ({selectedImages.length}개)
                  </>
                   )}
              </button>
            )}

            {videoProject && (
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
              >
                새로 시작
              </button>
            )}
          </div>
        </div>

        {/* 사용 안내 */}
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-yellow-800">영상 생성 가이드</h4>
              <div className="text-sm text-yellow-700 mt-1">
                <p>1. 스타일 선택 → 2. 이미지 선택 → 3. 영상 생성 → 4. 완료 후 다운로드</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step3;
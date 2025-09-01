// src/components/Step3.jsx
// Freepik 이미지가 포함된 최종 스토리보드 및 CapCut JSON 생성

import React, { useState, useEffect } from 'react';
import { generateFinalPrompt } from '../mappings';

const Step3 = ({ formData, classificationResult, storyboardData, onBack, onRestart }) => {
  const [finalPrompt, setFinalPrompt] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (formData && storyboardData) {
      generateFinalJSON();
    }
  }, [formData, storyboardData]);

  /**
   * Freepik 결과를 포함한 최종 CapCut JSON 생성
   */
  const generateFinalJSON = async () => {
    setIsGenerating(true);
    
    try {
      // Freepik 결과를 포함하여 최종 프롬프트 생성
      const prompt = generateFinalPrompt(formData, storyboardData);
      setFinalPrompt(prompt);
    } catch (error) {
      console.error('JSON 생성 오류:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * JSON을 클립보드에 복사
   */
  const copyToClipboard = async () => {
    if (!finalPrompt) return;

    try {
      await navigator.clipboard.writeText(JSON.stringify(finalPrompt, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (error) {
      console.error('클립보드 복사 실패:', error);
      // 폴백: 텍스트 선택
      const textArea = document.createElement('textarea');
      textArea.value = JSON.stringify(finalPrompt, null, 2);
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  /**
   * Freepik 이미지 갤러리 컴포넌트
   */
  const FreepikImageGallery = () => {
    if (!storyboardData?.imageResults) return null;

    return (
      <div className="mb-8">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Freepik 생성 이미지 ({storyboardData.statistics.successfulImages}/{storyboardData.statistics.totalScenes})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {storyboardData.imageResults.map((image, index) => (
            <div key={image.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="aspect-video bg-gray-100 relative">
                {image.imageUrl ? (
                  <>
                    <img 
                      src={image.imageUrl}
                      alt={image.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                    <div className="hidden absolute inset-0 bg-gray-200 items-center justify-center">
                      <span className="text-gray-500 text-sm">이미지 로드 실패</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm">이미지 없음</p>
                    </div>
                  </div>
                )}
                
                {/* 장면 번호 오버레이 */}
                <div className="absolute top-2 left-2 bg-blue-600 text-white text-sm font-bold px-2 py-1 rounded">
                  장면 {image.sceneNumber}
                </div>
                
                {/* 상태 표시 */}
                <div className="absolute top-2 right-2">
                  {image.status === 'completed' ? (
                    <div className="bg-green-500 text-white text-xs px-2 py-1 rounded">
                      ✓ 성공
                    </div>
                  ) : (
                    <div className="bg-red-500 text-white text-xs px-2 py-1 rounded">
                      ✗ 실패
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-4">
                <h4 className="font-medium text-gray-900 mb-2 truncate" title={image.title}>
                  {image.title}
                </h4>
                <p className="text-sm text-gray-600 mb-2 line-clamp-2" title={image.searchQuery}>
                  검색어: {image.searchQuery}
                </p>
                
                {/* 태그 표시 */}
                                {/* 태그 표시 */}
                {image.tags && image.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {image.tags.slice(0, 3).map((tag, tagIndex) => (
                      <span key={tagIndex} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                        {tag}
                      </span>
                    ))}
                    {image.tags.length > 3 && (
                      <span className="text-xs text-gray-500">+{image.tags.length - 3} 더보기</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 통계 정보 */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Freepik 자료 통계</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-blue-600 font-medium">총 장면:</span>
              <span className="ml-1">{storyboardData.statistics.totalScenes}개</span>
            </div>
            <div>
              <span className="text-red-600 font-medium">비디오:</span>
              <span className="ml-1">{storyboardData.statistics.videosFound}개</span>
            </div>
            <div>
              <span className="text-blue-600 font-medium">이미지:</span>
              <span className="ml-1">{storyboardData.statistics.imagesFound}개</span>
            </div>
            <div>
              <span className="text-green-600 font-medium">성공:</span>
              <span className="ml-1">{storyboardData.statistics.successfulResources}개</span>
            </div>
            <div>
              <span className="text-purple-600 font-medium">총 길이:</span>
              <span className="ml-1">{storyboardData.finalVideo.totalDuration}초</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /**
   * 스토리보드 상세 정보 컴포넌트
   */
  const StoryboardDetails = () => {
    if (!finalPrompt?.storyboard) return null;

    return (
      <div className="mb-8">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          스토리보드 구성 ({finalPrompt.storyboard.length}장면)
        </h3>

        <div className="space-y-4">
          {finalPrompt.storyboard.map((scene, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center">
                  <div className="bg-blue-600 text-white text-sm font-bold px-3 py-1 rounded-full mr-3">
                    {scene.scene}
                  </div>
                  <h4 className="font-semibold text-gray-900">{scene.title}</h4>
                </div>
                <div className="text-sm text-gray-500">
                  {scene.duration}
                </div>
              </div>

              <p className="text-gray-700 mb-3">{scene.description}</p>

              {/* 시각적 자산 정보 (Freepik 이미지) */}
              {scene.visualAssets && (
                <div className="bg-gray-50 rounded p-3 mb-3">
                  <h5 className="text-sm font-medium text-gray-800 mb-2">연결된 Freepik 이미지:</h5>
                  <div className="flex items-center space-x-3">
                    {scene.visualAssets.imageUrl && (
                      <img 
                        src={scene.visualAssets.imageUrl}
                        alt={`장면 ${scene.scene}`}
                        className="w-16 h-10 object-cover rounded border"
                      />
                    )}
                    <div className="text-sm text-gray-600">
                      <p>검색어: {scene.visualAssets.searchQuery}</p>
                      <p>상태: {scene.visualAssets.status === 'completed' ? '✓ 성공' : '✗ 실패'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 키워드 및 스타일 정보 */}
              <div className="flex flex-wrap items-center justify-between text-sm">
                <div>
                  <span className="text-gray-600 mr-2">키워드:</span>
                  {scene.keywords.map((keyword, i) => (
                    <span key={i} className="inline-block bg-gray-100 text-gray-700 px-2 py-1 rounded mr-1 mb-1">
                      {keyword}
                    </span>
                  ))}
                </div>
                <div className="text-gray-500">
                  전환: {scene.transition}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /**
   * JSON 미리보기 컴포넌트
   */
  const JSONPreview = () => {
    if (!finalPrompt) return null;

    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
            <svg className="w-6 h-6 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h4a1 1 0 011 1v2h4a1 1 0 110 2h-1v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6H5a1 1 0 110-2h4zM8 6v10h8V6H8z" />
            </svg>
            완성된 영상 정보 및 편집 가이드
          </h3>

          <button
            onClick={copyToClipboard}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              copied 
                ? 'bg-green-600 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {copied ? '✓ 복사됨!' : 'JSON 복사'}
          </button>
        </div>

        {/* JSON 요약 정보 */}
        <div className="bg-purple-50 rounded-lg p-4 mb-4">
          <h4 className="font-medium text-purple-900 mb-2">Freepik 영상 제작 정보</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
            <div>
              <span className="text-purple-600 font-medium">프로젝트:</span>
              <span className="ml-1">{finalPrompt.project_info.brand_name}</span>
            </div>
            <div>
              <span className="text-purple-600 font-medium">세그먼트:</span>
              <span className="ml-1">{finalPrompt.final_video.segments_count}개</span>
            </div>
            <div>
              <span className="text-purple-600 font-medium">총 길이:</span>
              <span className="ml-1">{finalPrompt.final_video.total_duration}초</span>
            </div>
            <div>
              <span className="text-purple-600 font-medium">해상도:</span>
              <span className="ml-1">{finalPrompt.final_video.resolution}</span>
            </div>
          </div>
          
          {/* Freepik 연동 상태 */}
          <div className="p-3 bg-white rounded border">
            <h5 className="text-sm font-medium text-gray-800 mb-2">Freepik 자료 상태:</h5>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full mr-2 bg-red-500"></div>
                <span className="text-gray-600">비디오: {finalPrompt.freepik_integration.videos_count}개</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full mr-2 bg-blue-500"></div>
                <span className="text-gray-600">이미지: {finalPrompt.freepik_integration.images_count}개</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full mr-2 bg-green-500"></div>
                <span className="text-gray-600">총 자료: {finalPrompt.freepik_integration.total_resources}개</span>
              </div>
            </div>
          </div>
        </div>

        {/* 비디오 편집 가이드 */}
        <div className="bg-yellow-50 rounded-lg p-4 mb-4">
          <h4 className="font-medium text-yellow-900 mb-2">🎬 영상 편집 가이드</h4>
          <div className="text-sm text-yellow-800">
            <p className="mb-2"><strong>추천 도구:</strong> FFmpeg, DaVinci Resolve, Adobe Premiere Pro</p>
            <p className="mb-2"><strong>편집 순서:</strong></p>
            <ol className="list-decimal list-inside ml-4 space-y-1">
              <li>각 비디오 세그먼트를 순서대로 타임라인에 배치</li>
              <li>장면 전환 효과 추가 (크로스페이드 추천)</li>
              <li>배경음악 및 텍스트 오버레이 추가</li>
              <li>최종 렌더링 (1080p, MP4 형식)</li>
            </ol>
          </div>
        </div>

        {/* JSON 코드 표시 */}
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
            <span className="text-gray-300 text-sm font-mono">freepik_video_project.json</span>
            <span className="text-gray-400 text-xs">
              {JSON.stringify(finalPrompt).length.toLocaleString()} characters
            </span>
          </div>
          <pre className="p-4 text-sm text-gray-300 font-mono overflow-x-auto max-h-96 overflow-y-auto">
            {JSON.stringify(finalPrompt, null, 2)}
          </pre>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            3단계: 최종 스토리보드 및 JSON 생성
          </h2>
          <p className="text-gray-600">
            Freepik API로 생성된 이미지와 함께 CapCut API 호출용 JSON이 완성되었습니다.
          </p>
        </div>

        {isGenerating ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">최종 JSON을 생성하고 있습니다...</p>
          </div>
        ) : (
          <>
            {/* Freepik 이미지 갤러리 */}
            <FreepikImageGallery />

            {/* 스토리보드 상세 정보 */}
            <StoryboardDetails />

            {/* JSON 미리보기 */}
            <JSONPreview />
          </>
        )}

        {/* 액션 버튼들 */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={onBack}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isGenerating}
          >
            이전 단계
          </button>

          <div className="flex gap-3">
            <button
              onClick={onRestart}
              className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
              disabled={isGenerating}
            >
              새로 시작
            </button>

            {finalPrompt && (
              <button
                onClick={() => {
                  // 실제 비디오 편집 도구로 내보내기 또는 가이드 표시
                  console.log('Freepik 영상 제작 프로젝트:', finalPrompt);
                  alert('모든 영상 소스가 준비되었습니다! 편집 도구를 사용하여 최종 영상을 완성하세요.');
                }}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                영상 편집 시작하기
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
              <h4 className="text-sm font-medium text-yellow-800">Freepik 완전 통합 안내</h4>
              <p className="text-sm text-yellow-700 mt-1">
                1. 'JSON 복사' 버튼을 눌러 모든 프로젝트 정보를 복사하세요.<br/>
                2. 각 비디오 세그먼트 URL을 확인하고 순서대로 다운로드하세요.<br/>
                3. FFmpeg나 영상 편집 프로그램으로 세그먼트들을 하나로 합치세요.<br/>
                4. 배경음악, 텍스트 오버레이를 추가하여 최종 광고 영상을 완성하세요.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step3;
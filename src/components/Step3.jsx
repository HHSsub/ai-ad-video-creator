import React, { useState } from 'react';

const Step3 = ({ formData, storyboard, onBack, onRestart, onNext }) => {
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);

  // 스타일 선택 핸들러
  const handleStyleSelect = (styleData) => {
    setSelectedStyle(styleData);
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

  // 다음 단계로 진행
  const handleNextStep = () => {
    if (selectedImages.length === 0) {
      alert('최소 1개 이상의 이미지를 선택해주세요.');
      return;
    }
    
    // 선택된 이미지 정보를 다음 단계로 전달
    onNext({
      selectedStyle: selectedStyle.style,
      selectedImages: selectedImages,
      formData: formData
    });
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
          스타일별 컨셉 이미지 갤러리
        </h3>
        <p className="text-gray-600 mb-6">
          원하는 스타일을 클릭하여 상세 이미지를 확인하고 선택하세요.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {storyboard.map((styleData, index) => (
            <div
              key={index}
              className={`border-2 rounded-lg overflow-hidden cursor-pointer transition-all duration-300 ${
                selectedStyle?.style === styleData.style
                  ? 'border-blue-500 shadow-lg'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => handleStyleSelect(styleData)}
            >
              <div className="bg-gray-50 px-4 py-3 border-b">
                <h4 className="font-semibold text-gray-800">{styleData.style}</h4>
                <p className="text-sm text-gray-600">
                  {styleData.images?.length || 0}개 이미지
                </p>
                {styleData.error && (
                  <p className="text-xs text-red-500 mt-1">오류: {styleData.error}</p>
                )}
              </div>
              
              <div className="p-4">
                {styleData.images && styleData.images.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {styleData.images.slice(0, 4).map((image, imgIndex) => (
                      <div key={imgIndex} className="aspect-video bg-gray-100 rounded overflow-hidden">
                        <img
                          src={image.preview || image.url}
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
                  <p className="text-sm text-blue-700 font-medium">선택된 스타일</p>
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
            {selectedStyle.style} - 상세 이미지 선택
          </h3>
          <div className="text-sm text-gray-600">
            {selectedImages.length}개 선택됨
          </div>
        </div>

        {selectedStyle.searchQuery && (
          <p className="text-sm text-gray-600 mb-4">
            검색어: {selectedStyle.searchQuery}
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
                      ? 'border-green-500 shadow-lg'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleImageToggle(image.id)}
                >
                  <div className="aspect-video bg-gray-100 relative">
                    <img
                      src={image.preview || image.url}
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
                  </div>
                  
                  <div className="p-3">
                    <h4 className="font-medium text-gray-900 text-sm truncate mb-1">
                      {image.title || `이미지 ${index + 1}`}
                    </h4>
                    
                    {/* 태그 표시 */}
                    {image.tags && image.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {image.tags.slice(0, 2).map((tag, tagIndex) => (
                          <span
                            key={tagIndex}
                            className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                        {image.tags.length > 2 && (
                          <span className="text-xs text-gray-500">+{image.tags.length - 2}</span>
                        )}
                      </div>
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

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            3단계: 스타일 선택 및 이미지 갤러리
          </h2>
          <p className="text-gray-600">
            생성된 다양한 스타일 중에서 원하는 것을 선택하고, 
            해당 스타일의 이미지들 중에서 영상에 사용할 이미지를 골라주세요.
          </p>
        </div>

        {/* 스타일 갤러리 */}
        <StyleGallery />

        {/* 선택된 스타일의 상세 이미지 */}
        <DetailedImageSelection />

        {/* 선택 요약 */}
        {selectedStyle && (
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <h4 className="font-medium text-blue-900 mb-2">선택 요약</h4>
            <div className="text-sm text-blue-800">
              <p>선택된 스타일: <strong>{selectedStyle.style}</strong></p>
              <p>선택된 이미지: <strong>{selectedImages.length}개</strong></p>
              <p>예상 영상 길이: <strong>{formData.videoLength}</strong></p>
            </div>
          </div>
        )}

        {/* 액션 버튼들 */}
        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
          <button
            onClick={onBack}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            이전 단계
          </button>

          <div className="flex gap-3">
            <button
              onClick={onRestart}
              className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              새로 시작
            </button>

            <button
              onClick={handleNextStep}
              disabled={!selectedStyle || selectedImages.length === 0}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              선택 완료 ({selectedImages.length}개)
            </button>
          </div>
        </div>

        {/* 사용 안내 */}
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-yellow-800">이미지 선택 가이드</h4>
              <p className="text-sm text-yellow-700 mt-1">
                1. 먼저 원하는 스타일을 클릭하여 선택하세요.<br/>
                2. 선택된 스타일의 상세 이미지들이 아래에 표시됩니다.<br/>
                3. 영상에 사용할 이미지들을 클릭하여 선택하세요.<br/>
                4. 최소 1개 이상의 이미지를 선택한 후 '선택 완료' 버튼을 누르세요.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step3;

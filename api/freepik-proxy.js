export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-freepik-api-key');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { searchQuery, count = 5 } = req.body;

    // API 키 확인
    const API_KEY = process.env.FREEPIK_API_KEY || 
                    process.env.REACT_APP_FREEPIK_API_KEY || 
                    process.env.VITE_FREEPIK_API_KEY;

    console.log('=== Freepik Proxy Debug ===');
    console.log('환경변수 확인:', {
      hasFreepikKey: !!process.env.FREEPIK_API_KEY,
      hasReactKey: !!process.env.REACT_APP_FREEPIK_API_KEY,
      hasViteKey: !!process.env.VITE_FREEPIK_API_KEY,
      finalKey: API_KEY ? `${API_KEY.substring(0, 8)}...` : 'NOT_FOUND'
    });

    if (!API_KEY) {
      return res.status(500).json({
        error: 'Freepik API key not found',
        success: false,
        debug: {
          availableEnvVars: Object.keys(process.env).filter(key => 
            key.includes('FREEPIK') || key.includes('API')
          )
        }
      });
    }

    if (!searchQuery || typeof searchQuery !== 'string') {
      return res.status(400).json({
        error: 'Valid searchQuery is required',
        success: false
      });
    }

    // Freepik API 호출 (올바른 파라미터 형식 사용)
    const apiUrl = 'https://api.freepik.com/v1/resources';
    const params = new URLSearchParams({
      locale: 'en-US',
      page: '1',
      limit: Math.min(count, 20).toString(), // 최대 20개
      order: 'relevance', // relevance 또는 recent
      term: searchQuery.trim() // 검색어 (term 파라미터 사용)
    });

    // 필터 추가 (올바른 형식)
    const filters = {
      content_type: ['photo'], // photo, vector, psd, ai
      orientation: ['horizontal', 'vertical']
    };

    // 필터를 별도 파라미터로 추가
    Object.entries(filters).forEach(([key, values]) => {
      values.forEach(value => {
        params.append(`filters[${key}]`, value);
      });
    });

    const fullUrl = `${apiUrl}?${params.toString()}`;
    console.log('API 호출 URL:', fullUrl);
    console.log('API 키 (앞 8자):', API_KEY.substring(0, 8) + '...');

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-freepik-api-key': API_KEY, // 올바른 헤더명
        'User-Agent': 'AI-Ad-Creator/1.0'
      }
    });

    console.log('API 응답 상태:', response.status);
    console.log('API 응답 헤더:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Freepik API 오류:', errorText);
      
      let errorMessage = `API Error ${response.status}`;
      let errorDetails = errorText;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || errorMessage;
        errorDetails = errorJson;
      } catch (e) {
        // JSON 파싱 실패시 원본 텍스트 사용
      }
      
      return res.status(response.status).json({
        error: errorMessage,
        details: errorDetails,
        success: false,
        statusCode: response.status,
        debug: {
          url: fullUrl,
          headers: {
            'x-freepik-api-key': `${API_KEY.substring(0, 8)}...`
          }
        }
      });
    }

    const data = await response.json();
    console.log('API 응답 구조:', {
      hasData: !!data.data,
      dataLength: data.data?.length || 0,
      totalResults: data.total || 0,
      sampleItem: data.data?.[0] ? {
        id: data.data[0].id,
        hasImage: !!data.data[0].image,
        hasThumbnails: !!data.data[0].thumbnails
      } : 'NO_DATA'
    });
    
    // 응답 데이터 처리
    if (data && data.data && Array.isArray(data.data)) {
      const images = data.data.map((item, index) => {
        // 다양한 이미지 URL 패턴 지원
        let imageUrl = null;
        let thumbnailUrl = null;

        // 이미지 URL 우선순위
        if (item.image) {
          imageUrl = item.image.source?.url || item.image.url;
        }
        
        // 썸네일 URL 우선순위  
        if (item.thumbnails) {
          thumbnailUrl = item.thumbnails.large?.url || 
                        item.thumbnails.medium?.url || 
                        item.thumbnails.small?.url;
        }

        // 썸네일이 없으면 원본 이미지 사용
        if (!thumbnailUrl && imageUrl) {
          thumbnailUrl = imageUrl;
        }

        return {
          id: item.id || `freepik-${index}`,
          title: item.title || `Freepik Image ${index + 1}`,
          url: imageUrl,
          thumbnail: thumbnailUrl,
          tags: Array.isArray(item.tags) ? item.tags : [],
          premium: !!item.premium,
          description: item.description || '',
          author: item.author || 'Freepik'
        };
      }).filter(img => img.url); // URL이 있는 이미지만 필터링

      const result = {
        success: true,
        images,
        total: data.total || images.length,
        searchQuery,
        page: 1,
        limit: count,
        apiInfo: {
          provider: 'Freepik API v1',
          timestamp: new Date().toISOString(),
          responseHeaders: Object.fromEntries(response.headers.entries())
        }
      };

      console.log(`성공: ${images.length}개 이미지 반환`);
      return res.status(200).json(result);
      
    } else {
      console.log('이미지 없음 - API 응답:', data);
      return res.status(200).json({
        success: true,
        images: [],
        total: 0,
        searchQuery,
        message: 'No images found',
        debug: {
          apiResponse: data
        }
      });
    }

  } catch (error) {
    console.error('Proxy 전체 오류:', error);
    console.error('오류 스택:', error.stack);
    
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      success: false,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

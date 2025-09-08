export default async function handler(req, res) {
  // CORS 설정 (더 완전한 CORS 헤더 추가)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-freepik-api-key');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // OPTIONS 요청 처리 (preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // POST 메서드만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { searchQuery, count = 5 } = req.body;

    // 환경 변수 확인 (여러 형태의 키 지원)
    const API_KEY = process.env.FREEPIK_API_KEY || 
                    process.env.REACT_APP_FREEPIK_API_KEY || 
                    process.env.VITE_FREEPIK_API_KEY;

    if (!API_KEY) {
      console.error('사용 가능한 환경 변수:', Object.keys(process.env).filter(key => key.includes('FREEPIK')));
      return res.status(500).json({
        error: 'FREEPIK API KEY not configured',
        success: false,
        availableKeys: Object.keys(process.env).filter(key => key.includes('FREEPIK'))
      });
    }

    // 검색어 검증
    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
      return res.status(400).json({
        error: 'Valid searchQuery is required',
        success: false
      });
    }

    // Freepik API 엔드포인트 (최신 v1 API 사용)
    const apiUrl = 'https://api.freepik.com/v1/resources';
    
    // 쿼리 파라미터 구성 (올바른 형식으로 수정)
    const params = new URLSearchParams({
      locale: 'en-US',
      page: '1',
      limit: Math.min(Math.max(1, parseInt(count)), 20).toString(), // 1-20 사이로 제한
      order: 'latest',
      term: searchQuery.trim() // 'term' 파라미터 사용
    });

    // 필터 추가 (JSON 문자열로 전달)
    const filters = {
      content_type: ['photo'],
      orientation: ['horizontal', 'vertical'],
      people: ['none', 'one', 'group']
    };
    params.append('filters', JSON.stringify(filters));

    const fullUrl = `${apiUrl}?${params.toString()}`;
    console.log('Freepik API 호출:', fullUrl);
    console.log('사용 중인 API 키 (앞 10자):', API_KEY.substring(0, 10) + '...');

    // Freepik API 호출 (올바른 헤더 사용)
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-freepik-api-key': API_KEY, // 올바른 헤더명 사용
        'User-Agent': 'AI-Ad-Video-Creator/1.0'
      }
    });

    console.log('Freepik API 응답 상태:', response.status);
    console.log('Freepik API 응답 헤더:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Freepik API 오류 응답:', errorText);
      
      let errorMessage = `Freepik API error: ${response.status}`;
      
      // 구체적인 오류 메시지 제공
      if (response.status === 401) {
        errorMessage = 'Invalid API key or authentication failed';
      } else if (response.status === 403) {
        errorMessage = 'API key permissions insufficient or quota exceeded';
      } else if (response.status === 400) {
        errorMessage = 'Invalid request parameters';
      } else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded';
      }
      
      return res.status(response.status).json({
        error: errorMessage,
        details: errorText,
        success: false,
        statusCode: response.status
      });
    }

    const data = await response.json();
    console.log('Freepik API 응답 데이터 구조:', {
      hasData: !!data.data,
      dataLength: data.data?.length || 0,
      totalResults: data.total || 0
    });
    
    // 응답 데이터 처리 (더 안전한 데이터 처리)
    if (data && data.data && Array.isArray(data.data)) {
      const images = data.data.map((item, index) => {
        // 이미지 URL 추출 (다양한 형태 지원)
        const imageUrl = item.image?.source?.url || 
                         item.image?.url || 
                         item.thumbnails?.large?.url ||
                         item.url;
        
        const thumbnailUrl = item.thumbnails?.medium?.url || 
                            item.thumbnails?.small?.url || 
                            item.thumbnails?.large?.url ||
                            imageUrl;

        return {
          id: item.id || `freepik-${index}`,
          title: item.title || `Freepik Image ${index + 1}`,
          url: imageUrl,
          thumbnail: thumbnailUrl,
          tags: Array.isArray(item.tags) ? item.tags : [],
          premium: !!item.premium,
          author: item.author || 'Unknown',
          description: item.description || ''
        };
      }).filter(img => img.url); // URL이 있는 이미지만 필터링

      const result = {
        success: true,
        images,
        total: data.total || images.length,
        searchQuery,
        page: 1,
        limit: count,
        api_info: {
          provider: 'Freepik API v1',
          timestamp: new Date().toISOString(),
          quota_used: response.headers.get('x-ratelimit-remaining') ? 
            (100 - parseInt(response.headers.get('x-ratelimit-remaining'))) : 'unknown'
        }
      };

      console.log(`성공: ${images.length}개 이미지 반환`);
      return res.status(200).json(result);
      
    } else {
      console.log('검색 결과 없음 또는 잘못된 응답 구조');
      return res.status(200).json({
        success: true,
        images: [],
        total: 0,
        searchQuery,
        message: 'No images found for this search query',
        api_response: data // 디버깅용
      });
    }

  } catch (error) {
    console.error('Freepik Proxy 전체 오류:', error);
    console.error('오류 스택:', error.stack);
    
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      success: false,
      timestamp: new Date().toISOString()
    });
  }
}

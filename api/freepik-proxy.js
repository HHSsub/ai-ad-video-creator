export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 처리 (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST 메서드만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { searchQuery, count = 5 } = req.body;

    // 환경 변수 확인
    if (!process.env.FREEPIK_API_KEY) {
      return res.status(500).json({
        error: 'FREEPIK_API_KEY not configured',
        success: false
      });
    }

    // Freepik API 호출
    const url = 'https://api.freepik.com/v1/resources';
    const params = new URLSearchParams({
      locale: 'en-US',
      page: '1',
      limit: count.toString(),
      order: 'latest',
      filters: JSON.stringify({
        content_type: ['photo'],
        orientation: ['horizontal', 'vertical'],
        people: ['none', 'one', 'group']
      })
    });

    // 검색어가 있으면 추가
    if (searchQuery && searchQuery.trim()) {
      params.append('term', searchQuery.trim());
    }

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Freepik-API-Key': process.env.FREEPIK_API_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Freepik API Error:', response.status, errorText);
      
      return res.status(response.status).json({
        error: `Freepik API error: ${response.status}`,
        details: errorText,
        success: false
      });
    }

    const data = await response.json();
    
    // 응답 데이터 처리
    if (data && data.data && Array.isArray(data.data)) {
      const images = data.data.map(item => ({
        id: item.id,
        title: item.title || 'Freepik Image',
        url: item.image?.source?.url || item.thumbnails?.large?.url,
        thumbnail: item.thumbnails?.medium?.url || item.thumbnails?.small?.url,
        tags: item.tags || [],
        premium: item.premium || false
      })).filter(img => img.url); // URL이 있는 이미지만 필터링

      return res.status(200).json({
        success: true,
        images,
        total: data.total || images.length,
        searchQuery
      });
    } else {
      return res.status(200).json({
        success: true,
        images: [],
        total: 0,
        searchQuery,
        message: 'No images found'
      });
    }

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      success: false
    });
  }
}

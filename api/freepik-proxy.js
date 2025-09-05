// api/freepik-proxy.js
export default async function handler(request, response) {
    // CORS 헤더 설정
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  
    // Preflight 요청 처리
    if (request.method === 'OPTIONS') {
      return response.status(200).json({}, corsHeaders);
    }
  
    // POST 요청만 허용
    if (request.method !== 'POST') {
      return response.status(405).json({ 
        error: 'Method not allowed. Use POST.' 
      }, corsHeaders);
    }
  
    try {
      const { searchQuery, count = 5 } = request.body;
      
      // API 키 확인
      if (!process.env.FREEPIK_API_KEY) {
        return response.status(500).json({ 
          error: 'FREEPIK_API_KEY environment variable is not set',
          success: false 
        }, corsHeaders);
      }
  
      console.log(`Freepik API 호출: ${searchQuery}`);
  
      // Freepik API 호출
      const freepikUrl = new URL('https://api.freepik.com/v1/resources');
      freepikUrl.searchParams.append('locale', 'en-US');
      freepikUrl.searchParams.append('page', '1');
      freepikUrl.searchParams.append('limit', count.toString());
      freepikUrl.searchParams.append('term', searchQuery);
      freepikUrl.searchParams.append('filters', JSON.stringify({
        content_type: ['photo', 'vector'],
        orientation: 'horizontal'
      }));
  
      const freepikResponse = await fetch(freepikUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Freepik-API-Key': process.env.FREEPIK_API_KEY,
          'User-Agent': 'Vercel-Function/1.0'
        }
      });
  
      if (!freepikResponse.ok) {
        const errorText = await freepikResponse.text();
        console.error('Freepik API 오류:', freepikResponse.status, errorText);
        
        return response.status(freepikResponse.status).json({
          error: `Freepik API error: ${freepikResponse.status} - ${freepikResponse.statusText}`,
          details: errorText,
          success: false
        }, corsHeaders);
      }
  
      const data = await freepikResponse.json();
      console.log(`Freepik 응답: ${data.data?.length || 0}개 이미지`);
  
      // 이미지 데이터 가공
      const processedImages = (data.data || []).map(item => ({
        id: item.id || Math.random().toString(36).substr(2, 9),
        url: item.image?.source?.url || item.thumbnails?.large?.url || '',
        preview: item.thumbnails?.medium?.url || item.thumbnails?.small?.url || '',
        title: item.title || 'Untitled Image',
        tags: Array.isArray(item.tags) ? item.tags : []
      }));
  
      return response.status(200).json({
        success: true,
        images: processedImages,
        total: data.total || processedImages.length,
        searchQuery: searchQuery
      }, corsHeaders);
  
    } catch (error) {
      console.error('프록시 함수 오류:', error);
      
      return response.status(500).json({
        error: 'Internal server error',
        message: error.message,
        success: false
      }, corsHeaders);
    }
  }
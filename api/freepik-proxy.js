export default async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
  
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    try {
      const { searchQuery, count = 5 } = req.body;
      
      if (!process.env.FREEPIK_API_KEY) {
        return res.status(500).json({ error: 'Freepik API key not configured' });
      }
  
      const url = 'https://api.freepik.com/v1/resources';
      const params = new URLSearchParams({
        locale: 'en-US',
        page: '1',
        limit: count.toString(),
        term: searchQuery,
        filters: JSON.stringify({
          content_type: ['photo', 'vector'],
          orientation: 'horizontal',
          people_number: 'none'
        })
      });
  
      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Freepik-API-Key': process.env.FREEPIK_API_KEY
        }
      });
  
      if (!response.ok) {
        throw new Error(`Freepik API error: ${response.status}`);
      }
  
      const data = await response.json();
      
      const processedImages = data.data?.map(item => ({
        id: item.id,
        url: item.image?.source?.url || item.thumbnails?.large?.url,
        preview: item.thumbnails?.medium?.url || item.thumbnails?.small?.url,
        title: item.title || 'Untitled',
        tags: item.tags || []
      })) || [];
  
      res.status(200).json({
        success: true,
        images: processedImages,
        total: data.total || 0
      });
  
    } catch (error) {
      console.error('Freepik proxy error:', error);
      res.status(500).json({ 
        error: error.message || 'Internal server error',
        success: false 
      });
    }
  }
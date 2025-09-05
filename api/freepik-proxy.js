export default async function handler(req, res) {
    // CORS 설정
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
        return res.status(500).json({ 
          error: 'FREEPIK_API_KEY not configured',
          success: false 
        });
      }
  
      const url = `https://api.freepik.com/v1/resources`;
      const params = new URLSearchParams({
        locale: 'en-US',
        page: '1',
        limit: count.toString(),
        term: searchQuery
      });
  
      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'X-Freepik-API-Key': process.env.FREEPIK_API_KEY,
          'Accept': 'application/json'
        }
      });
  
      if (!response.ok) {
        throw new Error(`Freepik API error: ${response.status}`);
      }
  
      const data = await response.json();
      
      const images = (data.data || []).map(item => ({
        id: item.id,
        url: item.image?.source?.url || item.thumbnails?.large?.url,
        preview: item.thumbnails?.medium?.url,
        title: item.title || 'Untitled',
        tags: item.tags || []
      }));
  
      res.status(200).json({
        success: true,
        images: images
      });
  
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ 
        error: error.message,
        success: false 
      });
    }
  }
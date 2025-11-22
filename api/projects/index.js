import fs from 'fs';
import path from 'path';

const PROJECTS_DIR = path.join(process.cwd(), 'config', 'projects');

if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const username = req.headers['x-username'] || 'anonymous';
      const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
      
      const projects = files
        .map(file => {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf8'));
            return { id: file.replace('.json', ''), ...data };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter(p => p.username === username || username === 'admin');

      return res.status(200).json({ success: true, projects });
    }

    if (req.method === 'POST') {
      const { projectId, ...projectData } = req.body;
      if (!projectId) {
        return res.status(400).json({ error: 'projectId required' });
      }

      const projectFile = path.join(PROJECTS_DIR, `${projectId}.json`);
      fs.writeFileSync(projectFile, JSON.stringify(projectData, null, 2), 'utf8');

      console.log(`[projects] ✅ 프로젝트 생성: ${projectId}`);
      return res.status(200).json({ success: true, projectId });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[projects] ❌ 오류:', error);
    return res.status(500).json({ error: error.message });
  }
}

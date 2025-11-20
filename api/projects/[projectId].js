/**
 * API: 프로젝트 모드 업데이트
 * PATCH /api/projects/:projectId
 */

import fs from 'fs';
import path from 'path';

const PROJECTS_DIR = path.join(process.cwd(), 'config', 'projects');

// projects 폴더 생성
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { projectId } = req.query;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  const projectFile = path.join(PROJECTS_DIR, `${projectId}.json`);

  try {
    // GET: 프로젝트 조회
    if (req.method === 'GET') {
      if (!fs.existsSync(projectFile)) {
        return res.status(404).json({ error: 'Project not found' });
      }
      const data = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
      return res.status(200).json({ success: true, project: data });
    }

    // PATCH: 프로젝트 업데이트
    if (req.method === 'PATCH') {
      const { mode, ...otherUpdates } = req.body;

      let projectData = {};
      if (fs.existsSync(projectFile)) {
        projectData = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
      }

      // 업데이트
      if (mode !== undefined) projectData.mode = mode;
      Object.assign(projectData, otherUpdates);
      projectData.updatedAt = new Date().toISOString();

      fs.writeFileSync(projectFile, JSON.stringify(projectData, null, 2), 'utf8');

      console.log(`[projects] ✅ 프로젝트 업데이트: ${projectId}, mode: ${mode}`);
      return res.status(200).json({ success: true, project: projectData });
    }

    // DELETE: 프로젝트 삭제
    if (req.method === 'DELETE') {
      if (fs.existsSync(projectFile)) {
        fs.unlinkSync(projectFile);
        console.log(`[projects] 🗑️ 프로젝트 삭제: ${projectId}`);
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[projects] ❌ 오류:', error);
    return res.status(500).json({ error: error.message });
  }
}

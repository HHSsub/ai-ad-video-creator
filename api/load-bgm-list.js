import 'dotenv/config';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const UNIVERSAL_FOLDER_NAME = '범용';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = {
  fetchedAt: 0,
  data: null
};

function getDriveClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('Google service account credentials are missing in .env');
  }
  const jwt = new google.auth.JWT(clientEmail, null, privateKey, SCOPES);
  return google.drive({ version: 'v3', auth: jwt });
}

async function listFolders(drive, parentId) {
  const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id,name)'
  });
  return res.data.files || [];
}

async function listAudioFiles(drive, folderId) {
  // 허용 확장자: mp3, wav, m4a, ogg
  const exts = ['mp3','wav','m4a','ogg'];
  const mimeFilter = exts.map(e => `name contains '.${e}'`).join(' or ');
  // mimeType != folder
  const q = `'${folderId}' in parents and trashed=false and (${mimeFilter})`;
  const res = await drive.files.list({
    q,
    fields: 'files(id,name,mimeType,size)'
  });
  return (res.data.files || []).map(f => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size
  }));
}

async function buildBgmStructure() {
  const rootId = process.env.BGM_DRIVE_ROOT_ID;
  if (!rootId) throw new Error('BGM_DRIVE_ROOT_ID not set in .env');

  const drive = getDriveClient();

  // 1) 하위 폴더 전부 스캔
  const moodFolders = await listFolders(drive, rootId);

  // 2) 각 폴더 내 파일 로드
  const results = [];
  for (const folder of moodFolders) {
    const tracks = await listAudioFiles(drive, folder.id);
    if (tracks.length === 0) continue;
    results.push({
      name: folder.name,
      folderId: folder.id,
      tracks
    });
  }

  // Universal(범용) 이 최상단에 없을 수 있으니 정렬
  results.sort((a,b) => {
    if (a.name === UNIVERSAL_FOLDER_NAME) return -1;
    if (b.name === UNIVERSAL_FOLDER_NAME) return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    moods: results,
    universalMoodName: UNIVERSAL_FOLDER_NAME,
    rootFolderId: rootId
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const now = Date.now();
    if (cache.data && (now - cache.fetchedAt < CACHE_TTL_MS)) {
      return res.status(200).json({ success: true, cached: true, ...cache.data });
    }

    const data = await buildBgmStructure();
    cache = { fetchedAt: now, data };

    res.status(200).json({ success: true, cached: false, ...data });
  } catch (e) {
    console.error('[load-bgm-list] error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
}

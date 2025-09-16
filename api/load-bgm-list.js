import 'dotenv/config';
import { google } from 'googleapis';

const UNIVERSAL_FOLDER_NAME = '범용';
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = {};

function getDriveClient() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Missing Google credentials');
  const jwt = new google.auth.JWT(email, null, key, ['https://www.googleapis.com/auth/drive.readonly']);
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
  const exts = ['mp3','wav','m4a','ogg'];
  const mimeFilter = exts.map(e => `name contains '.${e}'`).join(' or ');
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
  console.log(`[BGM] rootId: ${rootId}`);

  const drive = getDriveClient();

  const moodFolders = await listFolders(drive, rootId);
  console.log(`[BGM] moodFolders found: ${moodFolders.map(f=>`${f.name}(${f.id})`).join(', ')}`);

  const results = [];
  for (const folder of moodFolders) {
    const tracks = await listAudioFiles(drive, folder.id);
    console.log(`[BGM] Folder "${folder.name}" (${folder.id}) has ${tracks.length} tracks: ${tracks.map(t=>t.name).join(', ')}`);
    if (tracks.length === 0) continue;
    results.push({
      name: folder.name,
      folderId: folder.id,
      tracks
    });
  }

  results.sort((a,b) => {
    if (a.name === UNIVERSAL_FOLDER_NAME) return -1;
    if (b.name === UNIVERSAL_FOLDER_NAME) return 1;
    return a.name.localeCompare(b.name);
  });

  console.log(`[BGM] Final moods: ${results.map(r=>`${r.name}(${r.tracks.length})`).join(', ')}`);

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
    console.log("[BGM] API response:", JSON.stringify({ success: true, cached: false, ...data }, null, 2));
  } catch (e) {
    console.error('[load-bgm-list] error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
}

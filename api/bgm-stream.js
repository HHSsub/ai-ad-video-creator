import 'dotenv/config';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

function getDrive() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Missing Google credentials');
  const jwt = new google.auth.JWT(email, null, key, SCOPES);
  return google.drive({ version: 'v3', auth: jwt });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Range');
  res.setHeader('Access-Control-Max-Age','86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error:'id query required' });

  try {
    const drive = getDrive();

    // 파일 메타
    const meta = await drive.files.get({ fileId: id, fields:'id,name,mimeType,size' });
    const size = parseInt(meta.data.size || '0',10);
    const mime = meta.data.mimeType || 'audio/mpeg';

    // 전체 스트림 (Range 미세 구현 필요하면 확장)
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', size || '');
    res.setHeader('Accept-Ranges', 'bytes');

    const dl = await drive.files.get({ fileId: id, alt: 'media' }, { responseType:'stream' });
    dl.data.on('error', err => {
      console.error('Stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    dl.data.pipe(res);

  } catch (e) {
    console.error('[bgm-stream] error:', e);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    }
  }
}

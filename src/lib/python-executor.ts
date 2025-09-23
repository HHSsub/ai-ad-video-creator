import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export class PythonExecutor {
  private projectRoot: string;

  constructor() {
    this.projectRoot = process.cwd();
  }

  async executeCollector(options: {
    maxAds?: number;
    searchQueries?: string[];
  } = {}): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      const scriptPath = path.join(this.projectRoot, 'python_scripts', 'youtube_ads_collector_with_db.py');
      
      // Python 스크립트 실행
      const pythonProcess = spawn('python3', [scriptPath], {
        cwd: this.projectRoot,
        env: {
          ...process.env,
          APIFY_TOKEN: process.env.APIFY_TOKEN,
          SERPAPI_KEY: process.env.SERPAPI_KEY,
          MAX_ADS: options.maxAds?.toString() || '20'
        }
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log(`Python 수집기 출력: ${data}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(`Python 수집기 에러: ${data}`);
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          resolve({ 
            success: false, 
            output, 
            error: errorOutput || `프로세스가 코드 ${code}로 종료됨` 
          });
        }
      });

      // 타임아웃 설정 (5분)
      setTimeout(() => {
        pythonProcess.kill();
        resolve({ 
          success: false, 
          output, 
          error: '실행 시간 초과 (5분)' 
        });
      }, 5 * 60 * 1000);
    });
  }

  async readDatabase(): Promise {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(this.projectRoot, 'youtube_ads.db');

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      
      db.all(`
        SELECT id, title, url, note, search_query, api_source, collected_at, 
               analysis_status, analyzed_at 
        FROM youtube_ads 
        ORDER BY collected_at DESC 
        LIMIT 100
      `, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
        db.close();
      });
    });
  }

  async getStats(): Promise<{
    total_ads: number;
    pending: number;
    completed: number;
    failed: number;
  }> {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(this.projectRoot, 'youtube_ads.db');

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      
      db.get(`
        SELECT 
          COUNT(*) as total_ads,
          SUM(CASE WHEN analysis_status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN analysis_status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN analysis_status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM youtube_ads
      `, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as any);
        }
        db.close();
      });
    });
  }
}
    

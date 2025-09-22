import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: { 
      host: '13.222.179.138', 
      port: 5173, 
      protocol: 'ws' 
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',  // 🔥 localhost로 변경 (같은 서버 내부 통신)
        changeOrigin: true,
        secure: false,
        timeout: 180000, // 🔥 타임아웃 180초로 증가
        proxyTimeout: 120000, // 🔥 프록시 타임아웃 추가 (120초)
        // 🔥 헤더 크기 제한 해결
        headers: {
          'Connection': 'keep-alive',
        },
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('❌ [proxy error]', err.message);
            // 🔥 에러 시 적절한 응답 반환
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: 'Backend server unavailable', 
                message: err.message,
                timestamp: new Date().toISOString()
              }));
            }
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('📤 [proxy req]', req.method, req.url);
            // 🔥 헤더 크기 제한 방지
            proxyReq.removeHeader('if-none-match');
            proxyReq.removeHeader('if-modified-since');
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('📥 [proxy res]', proxyRes.statusCode, req.url);
          });
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  // 🔥 개발 서버 성능 최적화
  optimizeDeps: {
    exclude: ['@google/generative-ai']
  }
});

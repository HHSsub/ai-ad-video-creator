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
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        timeout: 300000, // 🔥 300초로 증가 (5분)
        proxyTimeout: 300000, // 🔥 프록시 타임아웃도 동일하게
        // 🔥 HTTP 설정 최적화
        headers: {
          'Connection': 'keep-alive',
          'Keep-Alive': 'timeout=300, max=1000'
        },
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('❌ [proxy error]', err.message);
            if (!res.headersSent) {
              res.writeHead(500, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              });
              res.end(JSON.stringify({ 
                error: 'Backend server unavailable', 
                message: err.message,
                timestamp: new Date().toISOString(),
                suggestion: 'Backend 서버가 응답하지 않습니다. 서버 상태를 확인해주세요.'
              }));
            }
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('📤 [proxy req]', req.method, req.url);
            // 🔥 대용량 응답 처리를 위한 헤더 설정
            proxyReq.removeHeader('if-none-match');
            proxyReq.removeHeader('if-modified-since');
            proxyReq.setHeader('Accept-Encoding', 'gzip, deflate');
            // 🔥 타임아웃 연장
            proxyReq.setTimeout(300000); // 5분
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('📥 [proxy res]', proxyRes.statusCode, req.url);
            // 🔥 대용량 응답 처리
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
            proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization, x-freepik-api-key';
          });
          // 🔥 프록시 레벨 타임아웃 설정
          proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
            proxyReq.setTimeout(300000);
          });
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 🔥 빌드 시 메모리 최적화
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          utils: ['@google/generative-ai']
        }
      }
    }
  },
  // 🔥 개발 서버 성능 최적화
  optimizeDeps: {
    exclude: ['@google/generative-ai']
  },
  // 🔥 JSON 파싱 크기 제한 증가
  define: {
    global: 'globalThis',
  }
});

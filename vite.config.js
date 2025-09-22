import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: { host: '13.222.179.138', port: 5173, protocol: 'ws' },
    proxy: {
      '/api': {
        target: 'http://13.222.179.138:3000',  // 🔥 외부 IP로 변경
        changeOrigin: true,
        secure: false,
        rewrite: (path) => {
          console.log(`🔥 Proxy rewrite: ${path}`);
          return path;
        },
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('[proxy error]', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[proxy req]', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('[proxy res]', proxyRes.statusCode, req.url);
          });
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});

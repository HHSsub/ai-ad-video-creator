import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ai-ad-video-creator/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})

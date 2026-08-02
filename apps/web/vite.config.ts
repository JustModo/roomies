import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      'node:module': path.resolve(__dirname, 'src/shims/node-module.ts'),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-hls': ['hls.js'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/ws/voice': {
        target: 'http://127.0.0.1:3000',
        ws: true
      },
      '/ws': {
        target: 'http://127.0.0.1:3000',
        ws: true
      },
      '/hls': 'http://127.0.0.1:5123'
    }
  }
});

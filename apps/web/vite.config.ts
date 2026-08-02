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
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws/voice': {
        target: 'http://localhost:3000',
        ws: true
      },
      '/ws': {
        target: 'http://localhost:3000',
        ws: true
      },
      '/hls': 'http://localhost:5123'
    }
  }
});

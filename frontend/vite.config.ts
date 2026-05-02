import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api and /ws to the FastAPI backend so the frontend can use
// same-origin URLs (avoids CORS quirks for the WebSocket).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8000', ws: true, changeOrigin: true },
    },
  },
});

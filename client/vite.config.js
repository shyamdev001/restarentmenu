import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_TARGET || 'http://localhost:5000';

// In development the React app runs on :5173 and forwards API, uploads and
// websocket traffic to the Express server on :5000.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
    port: 5173,
    proxy: {
      '/api': API,
      '/uploads': API,
      '/socket.io': { target: API, ws: true }
    }
  }
});

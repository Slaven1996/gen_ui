import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // '' prefix: also read non-VITE_ vars (DEV_API_TARGET), which never reach client code.
  const env = loadEnv(mode, import.meta.dirname, '');

  return {
    plugins: [
      // Must come before react(): generates src/routeTree.gen.ts from src/routes.
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    server: {
      port: 5173,
      proxy: {
        // Same-origin API in dev: the refresh cookie (SameSite=Strict, Path=/api/auth)
        // just works, and SSE chat streams pass straight through.
        // changeOrigin stays false so the backend's Origin check sees the browser's host.
        '/api': { target: env.DEV_API_TARGET || 'http://localhost:3000', changeOrigin: false },
        // Swagger UI, so http://localhost:5173/docs works in dev too.
        '/docs': { target: env.DEV_API_TARGET || 'http://localhost:3000', changeOrigin: false },
      },
    },
  };
});

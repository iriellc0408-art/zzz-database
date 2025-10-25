// vite.config.js
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      proxy: {
        '/api': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          rewrite: (path) =>
            // ▼▼▼ AI Studioで確認した正しいモデル名 'gemini-2.5-pro' に修正 ▼▼▼
            path.replace(
              /^\/api\/gemini/,
              `/v1beta/models/gemini-2.5-pro:generateContent?key=${env.VITE_GEMINI_API_KEY}`
            ),
        },
      },
    },
  };
});

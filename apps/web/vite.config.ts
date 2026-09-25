import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '')
  return {
    plugins: [react()],
    // Keep the workspace's root .env as the single local configuration source.
    // Only VITE_* values are exposed to browser code by Vite.
    envDir: '../..',
    server: {
      port: 5173,
      proxy: {
        // Forwards /api/* to the API untouched — the API serves /api/* itself
        // (same prefix in prod), so dev and prod share one URL shape.
        '/api': { target: env.API_URL || 'http://localhost:3001', changeOrigin: true },
      },
    },
    define: {
      __DASHBOARD_ONLY__: JSON.stringify(env.VITE_DASHBOARD_ONLY === 'true'),
      // Existing Neon project config uses NEON_AUTH_BASE_URL; allow it to
      // bootstrap the public alias without exposing any server-only values.
      'import.meta.env.VITE_NEON_AUTH_URL': JSON.stringify(env.VITE_NEON_AUTH_URL || env.NEON_AUTH_BASE_URL || ''),
    },
  }
})

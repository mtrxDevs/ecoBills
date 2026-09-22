import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forwards /api/* to the API untouched — the API serves /api/* itself
      // (same prefix in prod), so dev and prod share one URL shape.
      '/api': { target: process.env.API_URL || 'http://localhost:3001', changeOrigin: true },
    },
  },
  define: {
    __DASHBOARD_ONLY__: JSON.stringify(process.env.VITE_DASHBOARD_ONLY === 'true'),
  },
})

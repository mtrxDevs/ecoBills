import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps asset URLs working from any subpath (GitHub Pages project
// sites, Render static, plain file preview of dist).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5174 },
})

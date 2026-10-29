import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // Ensures relative assets work on GitHub Pages (/kpital/) and local preview
  build: {
    emptyOutDir: false,
  },
  server: {
    port: 5173,
  },
})

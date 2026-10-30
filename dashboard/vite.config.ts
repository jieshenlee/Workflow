import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // One .env for the whole project: read VITE_* variables from the repo root.
  envDir: '..',
  server: {
    port: 3000,
    strictPort: true,
  },
})

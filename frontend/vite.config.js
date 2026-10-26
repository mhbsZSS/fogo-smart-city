import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Polling garante hot-reload em bind mounts do Docker no Windows/macOS
    watch: { usePolling: true },
  },
})

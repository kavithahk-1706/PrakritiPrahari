import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    hmr: {
      clientPort: 443 // Ensures hot-module reloading uses secure WebSockets over HTTPS
    }
  }
})

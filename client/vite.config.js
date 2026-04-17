import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true, // Écoute sur tout le réseau local
    proxy: {
      '/api': 'http://localhost:80',
      '/socket.io': {
        target: 'http://localhost:80',
        ws: true
      }
    }
  }
})

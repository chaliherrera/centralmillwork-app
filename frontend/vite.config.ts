import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,  // escucha en 0.0.0.0 — permite acceso desde iPad/celular vía IP local
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Uploads locales: el backend los sirve como estáticos en /uploads/<file>.
      // En prod Express sirve frontend + uploads en el mismo origin, pero en
      // dev Vite necesita este proxy para que los <a href="/uploads/...">
      // de imágenes y PDFs no caigan en el catch-all de la SPA.
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})

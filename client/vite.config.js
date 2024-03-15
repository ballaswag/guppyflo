import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/v1/api/printers': 'http://localhost:9873',
      '/v1/api/settings': 'http://localhost:9873',
      '^/printer.*/.*': 'http://localhost:9873',
    },
  },
  plugins: [react()],
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from "vite-plugin-svgr"

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/v1/api/cameras': 'http://localhost:9873',
      '/v1/api/printers': 'http://localhost:9873',
      '/v1/api/settings': 'http://localhost:9873',
      '^/printer.*/.*': 'http://localhost:9873',
    },
  },
  plugins: [react(), svgr()],
})

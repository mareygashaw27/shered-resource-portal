import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

process.env.BROWSER = 'chrome'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    open: true
  }
})


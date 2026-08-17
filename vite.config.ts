import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** En build, quita dist/imgs (los sprites van al bucket S3 imgs, no al de la app). */
function stripDistImgs(): Plugin {
  return {
    name: 'strip-dist-imgs',
    apply: 'build',
    closeBundle() {
      const imgs = path.resolve('dist/imgs')
      if (fs.existsSync(imgs)) {
        fs.rmSync(imgs, { recursive: true, force: true })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), stripDistImgs()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true,
      interval: 300,
    },
    hmr: {
      host: 'localhost',
      port: 5173,
    },
  },
})


import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    define: {
      'process.env.DAYMON_TELEMETRY_TOKEN': JSON.stringify(process.env.DAYMON_TELEMETRY_TOKEN ?? '')
    },
    build: {
      rollupOptions: {
        external: ['better-sqlite3', 'sqlite-vec', '@huggingface/transformers', 'onnxruntime-node']
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})

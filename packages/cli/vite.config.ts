import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    target: 'node18',
    lib: {
      entry: resolve(__dirname, 'src/chat.ts'),
      formats: ['es'],
      fileName: 'chat'
    },
    rollupOptions: {
      external: [/^node:/, '@ezio/sdk']
    },
    outDir: 'dist',
    sourcemap: true
  },
  test: {
    environment: 'node',
    globals: true
  }
})
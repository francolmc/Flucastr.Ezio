import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    target: 'node18',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: [/^node:/, '@ezio/core']
    },
    outDir: 'dist',
    sourcemap: true
  },
  test: {
    environment: 'node',
    globals: true
  }
})
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    target: 'node18',
    lib: {
      entry: resolve(__dirname, 'src/server.ts'),
      formats: ['es'],
      fileName: 'server'
    },
    rollupOptions: {
      external: [/^node:/, '@ezio/core']
    },
    outDir: 'dist',
    sourcemap: true
  },
  test: {
    environment: 'node',
    globals: true,
    server: {
      deps: {
        external: [/^node:/]
      }
    },
    setupFiles: ['./src/__tests__/vitest-setup.ts']
  }
})

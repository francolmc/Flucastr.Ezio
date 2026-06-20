import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/chat.ts'),
      formats: ['es'],
      fileName: 'chat'
    },
    rollupOptions: {
      external: ['@ezio/sdk'],
      output: {
        globals: {
          '@ezio/sdk': 'EzioSDK'
        }
      }
    },
    target: 'es2022',
    outDir: 'dist'
  }
})

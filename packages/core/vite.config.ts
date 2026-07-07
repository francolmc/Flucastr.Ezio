import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true })
  for (const file of readdirSync(src)) {
    copyFileSync(join(src, file), join(dest, file))
  }
}

export default defineConfig({
  build: {
    target: 'node18',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: [/^node:/]
    },
    outDir: 'dist',
    sourcemap: true
  },
  test: {
    environment: 'node',
    globals: true
  },
  plugins: [{
    name: 'copy-migrations',
    closeBundle() {
      copyDir(resolve(__dirname, 'src/db/migrations'), resolve(__dirname, 'dist/db/migrations'))
    }
  }]
})
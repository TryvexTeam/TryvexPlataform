import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: { include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts'], passWithNoTests: true },
  resolve: { alias: { '@': path.resolve(__dirname) } },
})

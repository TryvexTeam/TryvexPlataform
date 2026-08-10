import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // wa-bridge es JS ESM (proceso aparte, sin build). Sus reglas puras se
  // prueban con el mismo runner que el resto del repo.
  test: { include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts', 'wa-bridge/**/*.test.js'], passWithNoTests: true },
  resolve: { alias: { '@': path.resolve(__dirname) } },
})

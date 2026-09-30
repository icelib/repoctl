import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'website',
    include: ['test/*.test.ts'],
  },
})

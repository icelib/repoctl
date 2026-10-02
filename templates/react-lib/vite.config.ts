import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [react(), dts({ tsconfigPath: './tsconfig.build.json', entryRoot: './src', clearPureImport: true })],
  build: {
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'style',
    },
    rolldownOptions: {
      // Include JSX runtimes and every peer subpath in the external boundary.
      external: id => /^(?:react|react-dom)(?:\/|$)/u.test(id),
      // Counter is a client component; preserve its boundary in bundled RSC consumers.
      output: { banner: '\'use client\';' },
    },
  },
})

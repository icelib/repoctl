import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { writeJson } from '../packaged-template/workspace.mjs'

/** An existing React library fixture, independent of any template registry entry. */
export function createReactLibrary(workspace, major) {
  const root = path.join(workspace, `packages/react${major}-fixture`)
  mkdirSync(path.join(root, 'src'), { recursive: true })
  writeJson(path.join(root, 'package.json'), {
    name: `react${major}-fixture`,
    type: 'module',
    version: '1.0.0',
    private: true,
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    types: './dist/index.d.ts',
    files: ['dist'],
    scripts: { build: 'vite build && tsc -p tsconfig.json', lint: 'eslint .', typecheck: 'tsc --noEmit --emitDeclarationOnly false' },
    peerDependencies: { react: major === 18 ? '>=18.2.0 <19' : '^19.3.0' },
    devDependencies: { '@types/react': major === 18 ? '^18.3.0' : '^19.3.0', '@vitejs/plugin-react': '^6.1.1', 'react': major === 18 ? '>=18.2.0 <19' : '^19.3.0', 'typescript': '^6.0.3', 'vite': '^8.3.2' },
  })
  writeFileSync(path.join(root, 'src/index.tsx'), `import { useState } from 'react'

export function Counter({ initialCount = 0 }: { initialCount?: number }) {
  const [count, setCount] = useState(initialCount)
  return (
    <section>
      <output aria-label="Count">{count}</output>
      <button type="button" onClick={() => setCount(count + 1)}>Increase</button>
    </section>
  )
}
`)
  writeFileSync(path.join(root, 'vite.config.ts'), `import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: 'src/index.tsx', formats: ['es'], fileName: 'index' },
    rolldownOptions: { external: ['react', 'react/jsx-runtime'] },
  },
})
`)
  writeFileSync(path.join(root, 'eslint.config.js'), 'import { defineEslintConfig } from \'repoctl/tooling\'\n\nexport default await defineEslintConfig()\n')
  writeJson(path.join(root, 'tsconfig.json'), { compilerOptions: { target: 'ES2022', jsx: 'react-jsx', rootDir: 'src', module: 'ESNext', moduleResolution: 'Bundler', strict: true, declaration: true, emitDeclarationOnly: true, outDir: 'dist', skipLibCheck: true }, include: ['src'] })
  return root
}

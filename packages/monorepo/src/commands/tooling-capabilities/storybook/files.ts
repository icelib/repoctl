import type { StorybookSettings } from '../settings'
import { subset } from 'semver'
import { version } from '../../../constants'
import { storySource } from './stories'

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

export function storybookFiles(settings: StorybookSettings) {
  const { options, target, workspace, runtimeRange } = settings
  const framework = options.framework === 'vue' ? 'vue3-vite' : 'react-vite'
  const scripts = { 'storybook': 'storybook dev --host 127.0.0.1 --port 6006 --no-open --disable-telemetry', 'build:storybook': 'storybook build --disable-telemetry', 'test:storybook': 'vitest run --config vitest.config.ts', 'test:storybook:install': 'playwright install chromium', 'lint': 'eslint .', 'typecheck': 'tsc --noEmit' }
  const dependencies: Record<string, string> = {
    '@storybook/addon-vitest': '10.6.1',
    [`@storybook/${framework}`]: '10.6.1',
    '@types/node': '^22.0.0',
    '@vitest/browser-playwright': '5.0.3',
    [`@vitejs/plugin-${options.framework}`]: options.framework === 'vue' ? '^6.0.9' : '^6.1.1',
    'eslint': '^10.0.0',
    'playwright': '1.63.0',
    'repoctl': `^${version}`,
    'storybook': '10.6.1',
    'typescript': '^6.0.3',
    'vite': '^8.3.2',
    'vitest': '5.0.3',
    [options.framework]: runtimeRange,
    [target.name]: 'workspace:*',
  }
  if (options.framework === 'react') {
    dependencies['react-dom'] = runtimeRange
    dependencies['@types/react'] = subset(runtimeRange, '>=18 <19') ? '^18.3.0' : '^19.3.0'
    dependencies['@types/react-dom'] = dependencies['@types/react']!
  }
  const files: Record<string, string> = {
    'package.json': json({ name: workspace.name, type: 'module', version: '0.0.0', private: true, scripts, devDependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))) }),
    'vite.config.ts': `import ${options.framework} from '@vitejs/plugin-${options.framework}'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [${options.framework}()] })
`,
    '.storybook/main.ts': `import type { StorybookConfig } from '@storybook/${framework}'

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-vitest'],
  framework: '@storybook/${framework}',
  core: { disableTelemetry: true },
  async viteFinal(config) {
    config.resolve = { ...config.resolve, dedupe: ['${options.framework}'${options.framework === 'react' ? ', \'react-dom\'' : ''}] }
    return config
  },
}

export default config
`,
    '.storybook/preview.ts': `import type { Preview } from '@storybook/${framework}'

const preview: Preview = { parameters: { controls: { expanded: true } } }

export default preview
`,
    '.storybook/vitest.setup.ts': `import { setProjectAnnotations } from '@storybook/${framework}'
import { beforeAll } from 'vitest'
import preview from './preview'

const project = setProjectAnnotations([preview])
beforeAll(project.beforeAll)
`,
    'vitest.config.ts': `import { fileURLToPath } from 'node:url'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: { junit: './test-results/storybook.xml' },
    projects: [{
      extends: true,
      plugins: [storybookTest({ configDir: fileURLToPath(new URL('./.storybook', import.meta.url)), storybookScript: 'pnpm storybook' })],
      test: {
        name: 'storybook',
        setupFiles: ['./.storybook/vitest.setup.ts'],
        browser: { enabled: true, provider: playwright({}), headless: true, instances: [{ browser: 'chromium' }] },
      },
    }],
  },
}))
`,
    [`stories/component.stories.${options.framework === 'vue' ? 'ts' : 'tsx'}`]: storySource(settings),
    'tsconfig.json': json({ compilerOptions: { target: 'ES2022', jsx: 'react-jsx', module: 'ESNext', moduleResolution: 'Bundler', types: ['node'], strict: true, noEmit: true, skipLibCheck: true }, include: ['.storybook/**/*.ts', 'stories/**/*.ts', 'stories/**/*.tsx', 'vitest.config.ts', 'vite.config.ts'] }),
    'eslint.config.js': `import { defineEslintConfig } from 'repoctl/tooling'

export default await defineEslintConfig({ ignores: ['storybook-static/**', 'test-results/**'] })
`,
    '.gitignore': 'node_modules\nstorybook-static\ntest-results\n',
    'README.md': `# ${workspace.name}

Optional Storybook workspace consuming \`${target.name}\`. Library sources, tests and publication files are unchanged.

1. Run \`pnpm install\` at the root and commit the lockfile.
2. Run \`pnpm build:storybook\` to build the library dependency closure and static stories.
3. Install Chromium explicitly with \`pnpm --filter ${workspace.name} test:storybook:install\`.
4. Run \`pnpm test:storybook\` for headless play tests, or \`pnpm --filter ${workspace.name} storybook\` for local component development on port 6006.

\`Default\` and \`Alternate\` document two component states. \`Interaction\` exercises the explicitly selected component and assertion. Edit these stories as the component API changes. This workspace has its own Vitest configuration; the library's existing tests and scripts are preserved. Vitest owns its temporary browser/server and closes them on completion or interruption. Reports are written to \`test-results/storybook.xml\`; static output is \`storybook-static\`. CI uploads both outputs and installs Chromium explicitly. No hosted visual regression service is required.
`,
  }
  return { files: Object.fromEntries(Object.entries(files).map(([file, content]) => [`${workspace.directory}/${file}`, content])), scripts, dependencies }
}

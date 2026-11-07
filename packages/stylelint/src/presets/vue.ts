import type { Config } from 'stylelint'
import { fileURLToPath } from 'node:url'
import upstream from 'stylelint-config-recommended-vue/scss'

const config: Config = {
  ...upstream,
  overrides: (upstream.overrides ?? []).map(override => ({
    ...override,
    extends: [
      fileURLToPath(new URL('../../presets/stylelint-config-recommended-scss.mjs', import.meta.url)),
      'stylelint-config-html',
    ],
  })),
}

export default config

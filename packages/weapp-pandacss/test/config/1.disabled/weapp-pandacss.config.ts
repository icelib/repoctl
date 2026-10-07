import { defineConfig } from '../../..'

export default defineConfig({
  postcss: {
    disabled: false,
    // 数组merge默认行为是直接concat 合并，所以传一个空数组是使用的默认数组
    selectorReplacement: {
      root: [],
      universal: [],
      cascadeLayers: 'a'
    },
    removeNegationPseudoClass: true
  },
  context: {
    pandaConfig: {
      cwd: process.cwd(),
      file: 'path/to/your-panda-config-file'
    }
  }
})

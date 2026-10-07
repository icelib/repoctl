import { defineConfig } from '../../..'

export default defineConfig({
  escapePredicate: Boolean,
  postcss: {
    disabled: true,
    // 数组默认是直接concat 合并，所以传一个空数组是使用的默认数组
    selectorReplacement: {
      root: [],
      universal: []
    }
  }
})

import type { Config } from 'stylelint'
import recommended from 'stylelint-config-recommended-scss'
import plugins from 'stylelint-scss'

// 构建时打包上游实现；运行依赖中的 recommended 已支持 Stylelint 18。
const config: Config = {
  ...recommended,
  extends: ['stylelint-config-recommended'],
  plugins,
  rules: {
    ...recommended.rules,
    // CSS 值解析器无法解析组合 Sass 变量和函数，沿用 SCSS 预设的语法规则边界。
    'value-no-invalid': null,
  },
}

export default config

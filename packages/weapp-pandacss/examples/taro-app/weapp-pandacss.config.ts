import { defineConfig } from 'weapp-pandacss'

// process.env.TARO_ENV !== 'h5' && process.env.TARO_ENV !== 'rn'

export default defineConfig({
  context: {
    escapePredicate: `process.env.TARO_ENV !== 'h5' && process.env.TARO_ENV !== 'rn'`,
  },
})

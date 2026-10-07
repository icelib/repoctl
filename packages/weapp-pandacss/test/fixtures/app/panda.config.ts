import { defineConfig } from '@pandacss/dev'

// *:not(#\#)
export default defineConfig({
  // Whether to use css reset
  // 小程序没有必要使用
  // https://taro-docs.jd.com/docs/envs#processenvtaro_env
  preflight: process.env.TARO_ENV === 'h5',
  include: ['./src/**/*.{js,jsx,ts,tsx}', './pages/**/*.{js,jsx,ts,tsx}'],
  exclude: [],
  theme: {
    extend: {}
  },
  outdir: 'src/styled-system',
  jsxFramework: 'react'
})

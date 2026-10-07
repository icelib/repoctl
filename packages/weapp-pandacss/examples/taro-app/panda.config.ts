import process from 'node:process'
import { defineConfig } from '@pandacss/dev'
// *:not(#\#)
export default defineConfig({
  // Whether to use css reset
  // 小程序没有必要使用
  // https://taro-docs.jd.com/docs/envs#processenvtaro_env
  preflight: process.env.TARO_ENV === 'h5',

  // Where to look for your css declarations
  include: ['./src/**/*.{js,jsx,ts,tsx}'],

  // Files to exclude
  exclude: [],

  // Useful for theme customization
  theme: {
    extend: {},
  },

  // The output directory for your css system
  outdir: 'styled-system',

  // staticCss: {
  //   css: [
  //     {
  //       properties: {
  //         color: ['red.300']
  //       }
  //     }
  //   ]
  // },
  jsxFramework: 'react',
})

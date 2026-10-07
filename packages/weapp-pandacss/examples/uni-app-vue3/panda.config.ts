import { defineConfig } from '@pandacss/dev'

export default defineConfig({
  // Whether to use css reset
  preflight: false,

  // Where to look for your css declarations
  include: ['./src/**/*.{js,jsx,ts,tsx,vue}'],

  // Files to exclude
  exclude: [],

  // Useful for theme customization
  theme: {
    extend: {},
  },

  jsxFramework: 'vue',

  // The output directory for your css system
  outdir: 'styled-system',
})

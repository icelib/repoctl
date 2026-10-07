import path from 'node:path'
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { UnifiedViteWeappTailwindcssPlugin as uvwt } from 'weapp-tailwindcss/vite'
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), uvwt()],
  resolve: {
    alias: [
      {
        find: 'styled-system',
        replacement: path.resolve(__dirname, 'styled-system'),
      },
    ],
  },
  css: {
    postcss: {
      plugins: [
        require('tailwindcss')(),
        require('@pandacss/dev/postcss')(),
        require('weapp-pandacss/postcss')(),
        require('postcss-rem-to-responsive-pixel')({
          // 32 意味着 1rem = 32rpx
          rootValue: 32,
          // 默认所有属性都转化
          propList: ['*'],
          // 转化的单位,可以变成 px / rpx
          transformUnit: 'rpx',
        }),
      ],
    },
  },
})

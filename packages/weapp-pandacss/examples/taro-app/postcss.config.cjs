const process = require('node:process')

const plugins = {
  // 'tailwindcss': {},
  '@pandacss/dev/postcss': {},
}
// https://taro-docs.jd.com/docs/envs#processenvtaro_env
if (process.env.TARO_ENV !== 'h5' && process.env.TARO_ENV !== 'rn') {
  /** @type {import('weapp-pandacss').IPostcssPluginOptions} */
  const options = {}
  plugins['weapp-pandacss/postcss'] = options
}

plugins['postcss-rem-to-responsive-pixel'] = {
  // 32 意味着 1rem = 32rpx
  rootValue: 32,
  // 默认所有属性都转化
  propList: ['*'],
  // 转化的单位,可以变成 px / rpx
  transformUnit: 'rpx',
}

module.exports = {
  plugins,
}

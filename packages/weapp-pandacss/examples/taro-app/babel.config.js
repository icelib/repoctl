// babel-preset-taro 更多选项和默认值：
// https://github.com/NervJS/taro/blob/next/packages/babel-preset-taro/README.md
// https://github.com/NervJS/taro/issues/13773
// REG_SCRIPTS
// export const REG_SCRIPTS = /\.[tj]sx?$/i
// https://github.com/NervJS/taro/blob/9795c09892f8472ee75027a3eac31371d6b4b040/packages/taro-helper/src/constants.ts#L92
// export const REG_SCRIPTS = /\.[tj]sx?$/i
module.exports = {
  presets: [
    ['taro', {
      framework: 'react',
      ts: true,
      // useBuiltIns: 'entry'
      // useBuiltIns: 'usage'
    }]
  ],
  plugins: [
    [
      "import",
      {
        "libraryName": "@nutui/nutui-react-taro",
        "libraryDirectory": "dist/esm",
        "style": 'css',
        "camel2DashComponentName": false
      },
      'nutui-react-taro'
    ]
  ]
}

// linaria 配置详见 https://github.com/callstack/linaria/blob/master/docs/CONFIGURATION.md#options
module.exports = {
  rules: [
    {
      action: require('@linaria/shaker').default,
    },
    {
      test: /node_modules[\/\\](?!@tarojs)/,
      action: 'ignore',
    },
  ],
}

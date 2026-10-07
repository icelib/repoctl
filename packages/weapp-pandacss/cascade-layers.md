# 辅助文档

## 为什么需要 `@csstools/postcss-cascade-layers`

原因在于，`pandacss` 在运行时使用了 `cascade-layers` 的特性来调配选择器的优先级。

而微信小程序和那些旧的浏览器一样，`wxss`不支持 `@layer`，所以要安装这个包。

> - <https://developer.mozilla.org/en-US/docs/Web/CSS/@layer>
> - <https://github.com/chakra-ui/panda/discussions/844>

另外注意在 `postcss.config.js` 中使用 `Object` 去注册 `plugins` 时，要按照从上往下的顺序写:

```js
{
  plugins: {
    '@pandacss/dev/postcss': {},            // [0]
    //  不需要注册它，因为 weapp-pandacss 里面已经包含了
    // '@csstools/postcss-cascade-layers': {}, // [1]
    'weapp-pandacss/postcss': {}            // [2]
  }
}
```

> 具体原因详见 `postcss-load-config` 的加载顺序章节： <https://github.com/postcss/postcss-load-config#ordering>

另外 `@csstools/postcss-cascade-layers` 默认会把 `@layer` 指令按照优先级添加 `:not(#\#)` 选择器来提升优先级。

详见 `https://www.npmjs.com/package/@csstools/postcss-cascade-layers`

这里由于 `:not(#\#)` 有小程序不兼容的字符，所以插件本身把它转换成了 `:not(n)`

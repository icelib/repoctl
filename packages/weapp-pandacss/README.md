# weapp-pandacss

[![codecov](https://codecov.io/gh/sonofmagic/weapp-pandacss/branch/main/graph/badge.svg?token=vnU71Pxj3P)](https://codecov.io/gh/sonofmagic/weapp-pandacss)
![star](https://badgen.net/github/stars/sonofmagic/weapp-pandacss)
![dm0](https://badgen.net/npm/dm/weapp-pandacss)
![license](https://badgen.net/npm/license/weapp-pandacss)

- [weapp-pandacss](#weapp-pandacss)
  - [介绍](#介绍)
  - [快速开始](#快速开始)
    - [pandacss 安装和配置](#pandacss-安装和配置)
      - [0. 安装和初始化 pandacss](#0-安装和初始化-pandacss)
      - [1. 配置 postcss](#1-配置-postcss)
      - [2. 检查你的 panda.config.ts](#2-检查你的-pandaconfigts)
      - [3. 修改 package.json 脚本](#3-修改-packagejson-脚本)
      - [4. 全局 css 注册 pandacss](#4-全局-css-注册-pandacss)
      - [5. 配置的优化与别名](#5-配置的优化与别名)
    - [weapp-pandacss 配置](#weapp-pandacss-配置)
      - [0. 回到 postcss 进行注册](#0-回到-postcss-进行注册)
      - [1. 回到 package.json 添加生成脚本](#1-回到-packagejson-添加生成脚本)
  - [跨平台注意事项](#跨平台注意事项)
  - [小程序预览事项](#小程序预览事项)
  - [高级配置文件](#高级配置文件)
  - [配置项列表](#配置项列表)
  - [参考示例](#参考示例)
  - [Bugs \& Issues](#bugs--issues)

## 介绍

[`pandacss`](https://panda-css.com/) 是个优秀的 `CSS-in-JS` 编译时框架，原子化和 `[jt]sx?` 文件相结合的写法灵活而又令人印象深刻，而 `weapp-pandacss` 就是让你在小程序开发中使用它。

## 快速开始

### pandacss 安装和配置

#### 0. 安装和初始化 pandacss

首先我们需要把 `@pandacss/dev` 这些都安装和配置好，这里我们以 `tarojs` 项目为例：

```bash
npm install -D @pandacss/dev weapp-pandacss postcss # 或者 yarn / pnpm
npx panda init
```

此时会在当前目录生成一个 `panda.config.ts` 和一个包含大量文件的 `styled-system`。

> `panda.config.ts` 是 `pandacss` 的配置文件，`styled-system` 文件夹里的是 `pandacss` 的运行时 `js`。

把 `styled-system` 加入我们的 `.gitignore` 中去。

```diff
# .gitignore
+ styled-system
```

#### 1. 配置 postcss

接着在根目录里，添加一个 `postcss.config.cjs` 文件，写入以下代码注册 `pandacss`:

```js
module.exports = {
  plugins: {
    '@pandacss/dev/postcss': {}
  }
}
```

#### 2. 检查你的 panda.config.ts

生成的配置文件大概长下面这样，尤其注意 `include` 是用来告诉 `pandacss` 从哪些文件中提取原子类的，所以这个配置一定要准确

```ts
import { defineConfig } from "@pandacss/dev"

export default defineConfig({
  // 小程序不需要
  preflight: process.env.TARO_ENV === 'h5',
  // ⚠️这里，假如你使用 vue，记得把 vue 文件格式包括进来！！！
  include: ["./src/**/*.{js,jsx,ts,tsx}"],
  exclude: [],
  theme: {
    extend: {}
  },
  outdir: "styled-system",
})
```

#### 3. 修改 package.json 脚本

然后，我们添加下方 `prepare` 脚本在我们的 `package.json` 的 `scripts` 块中:

```diff
{
  "scripts": {
+    "prepare": "panda codegen",
  }
}
```

这样我们每次重新 `npm i/yarn/pnpm i` 的时候，都会执行这个方法，重新生成 `styled-system`，当然你也可以直接通过 `npm run prepare` 直接执行这个脚本。

#### 4. 全局 css 注册 pandacss

然后在我们的全局样式文件 `src/app.scss` 中注册 `pandacss`:

```css
@layer reset, base, tokens, recipes, utilities;
```

配置好了之后，此时 `pandacss` 在 `h5` 平台已经生效了，你可以 `npm run dev:h5` 在 `h5` 平台初步使用了，但是为了开发体验，我们还有一些优化项要做。

#### 5. 配置的优化与别名

来到根目录的 `tsconfig.json` 添加:

```diff
{
  "compilerOptions": {
    "paths": {
      "@/*": [
        "src/*"
      ],
+      "styled-system/*": [
+        "styled-system/*"
+      ]
    }
  },
  "include": [
    "./src",
    "./types",
    "./config",
+    "styled-system"
  ],
}
```

接着来到 `config/index.ts` 添加 `alias`([参考链接](https://taro-docs.jd.com/docs/config-detail#alias)):

```ts
import path from 'path'

{
  alias: {
    'styled-system': path.resolve(__dirname, '..', 'styled-system')
  },
}
```

这样我们就不需要使用相对路径来使用 `pandacss` 了，同时 `ts` 智能提示也有了，你可以这样使用它:

```ts
import { View, Text } from "@tarojs/components";
import { css } from "styled-system/css";

const styles = css({
  bg: "yellow.200",
  rounded: "9999px",
  fontSize: "90px",
  p: "10px 15px",
  color: "pink.500",
});

export default function Index() {
  return (
    <View className={styles}>
      <Text>Hello world!</Text>
    </View>
  );
}
```

> 此部分参考的官方链接 <https://panda-css.com/docs/installation/postcss>

接下来进入 `weapp-pandacss` 的插件配置，不用担心，相比前面那些繁琐的步骤，这个可简单多了。

### weapp-pandacss 配置

> 记得安装好 `weapp-pandacss` !

#### 0. 回到 postcss 进行注册

回到项目根目录的 `postcss.config.cjs` 注册 `weapp-pandacss`，添加以下配置:

```diff
module.exports = {
  plugins: {
    '@pandacss/dev/postcss': {},
+   'weapp-pandacss/postcss': {}
  }
}
```

#### 1. 回到 package.json 添加生成脚本

然后去 `package.json` 你添加 `prepare` 脚本的地方，加点代码

```diff
{
  "scripts": {
-    "prepare": "panda codegen",
+    "prepare": "panda codegen && weapp-panda codegen",
  }
}
```

> 注意这里必须用 `&&` 而不能用 `&`，`&` 任务执行会并行不会等待，而 `&&` 会等待前一个执行完成再执行后一条命令

然后，你再手动执行一下

```bash
npm run prepare
```

来重新生成 `styled-system`, 此时你会发现 `pandacss` 的命令行输出中多了 `2` 行:

```diff
✔️ `src/styled-system/css`: the css function to author styles
✔️ `src/styled-system/tokens`: the css variables and js function to query your tokens
✔️ `src/styled-system/patterns`: functions to implement apply common layout patterns
✔️ `src/styled-system/jsx`: styled jsx elements for react
+ ✔️ `src/styled-system/weapp-panda`: the core escape function for weapp
+ ✔️ `src/styled-system/helpers.mjs`: inject escape function into helpers
```

这代表着小程序相关的转义逻辑已经被注入进去，此时 `panda css` 生成的类就兼容小程序平台啦，是不是很简单?

当然为了防止你配置失败，我也给出了参考项目: [taro-react-pandacss-template](https://github.com/sonofmagic/taro-react-pandacss-template) 方便进行排查纠错。

## 跨平台注意事项

你可能同时开发 `小程序` 和 `h5` 平台，但是你发现使用 `weapp-pandacss` 之后，`h5` 平台似乎就不行了？

这时候你可以这样配置：

`process.env.TARO_ENV === 'h5'` 的时候，不去加载 `weapp-pandacss/postcss` (根据环境变量动态加载 `postcss` 插件)

同时你也可以执行 `weapp-panda rollback` 把 `css` 方法进行回滚到最原始适配 `h5` 平台的状态。

当然你恢复到小程序版本也只需要执行 `weapp-panda codegen` 就会重新注入了。

## 小程序预览事项

当小程序预览时会出现 `Error: 非法的文件，错误信息：invalid file: pages/index/index.js, 565:24, SyntaxError: Unexpected token . if (variants[key]?.[value])` 错误。

这是因为 `panda` 生成的文件 `cva.mjs` 使用了 [`Optional chaining (?.)`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining)语法，这个语法小程序原生不支持导致的，这种情况可以参考以下的配置：

```ts
// taro 应用中，默认只会处理 [jt]sx? 这类的文件，所以要添加 cjs/mjs 再交给 babel 处理一下
// 假如你使用 pnpm 的话，你还要执行一下 `pnpm add -D babel-loader`, 把 `babel-loader` 提到最外面一层，不然会出现 require.resolve 找不到的问题
// config/index.ts 文件中的 webpackChain 方法，你可以把 mini 和 h5 都加上
chain.merge({
  module: {
    rule: [
      {
        test: /\.[cm]js$/i,
        loader: 'babel-loader'
      }
    ]
  },
})
```

或者你可以开启开发者工具中的 `将JS编译成ES5` 功能再进行预览。

## 高级配置文件

你可以通过 `npx weapp-panda init` 命令在当前目录下创建一个 `weapp-pandacss.config.ts` 配置文件。

这个配置文件可以用来控制转义代码的生成和一部分 `postcss` 插件的行为。

```ts
import { defineConfig } from 'weapp-pandacss'

export default defineConfig({
  postcss: {
    // 转义插件是否生效，这只能控制核心插件的生效情况,而核心插件只是一部分
    // 假如你想让整个插件真正不生效，请在 `postcss.config.cjs` 里进行动态加载判断
    disabled: false,
    // 数组merge默认行为是直接concat 合并，所以传一个空数组是使用的默认数组
    // 转义替换对象
    selectorReplacement: {
      root: [],
      universal: [],
      cascadeLayers: 'a'
    },
    removeNegationPseudoClass: true
  },
  // 生成上下文
  context: {
    // 转义注入判断条件，更改后需要重新生成代码
    escapePredicate: `process.env.TARO_ENV !== 'h5' && process.env.TARO_ENV !== 'rn'`,
    // 插件的 pandaConfig 寻找配置
    pandaConfig: {
      cwd: process.cwd(),
      file: 'path/to/your-panda-config-file'
    }
  }
})
```

当然，你更改相关的配置项之后，要重新执行一下 `npm run prepare` 来生成新的注入转义代码。

## 配置项列表

详见 <https://sonofmagic.github.io/weapp-pandacss/>

## 参考示例

[taro-react-pandacss-template](https://github.com/sonofmagic/taro-react-pandacss-template)

[Taro-app react](./examples/taro-app)

[Taro-app vue3](./examples/taro-app-vue3)

[Uni-app vue3 vite](./examples/uni-app-vue3)

## Bugs & Issues

目前这个插件正在快速的开发中，如果遇到 `Bug` 或者想提出 `Issue`

[欢迎提交到此处](https://github.com/sonofmagic/weapp-pandacss/issues)

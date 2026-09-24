# 使用打包器

## 选择打包器

一般来说，在不同场景下，需要使用不同的打包器，以下是我的选择:

- `webpack` 我不用，因为打出来的产物代码丑，配置复杂
- `rollup` 我最早用的就是这个，现在不用因为要装的包太多了，而且需要你对打包器有一定的理解，在打包复杂需要高度自定义的场景下使用
- `esbuild` 用的少，直接用不是很方便，但是可以基于它做高度自定义(写插件)
- `vite` 在 Vite 8 中默认基于 `rolldown` + `oxc`，假如你需要构建前端组件，这个就是首选，毕竟你也懒得去自己处理各种各样的样式文件吧，比如打包新版本 `vue` 组件，只能使用这个的库模式进行打包。
- `rolldown`/`tsdown` 适合更偏向库构建和工具链场景，但生态兼容面和迁移经验仍然不如 `vite`/`rollup` 成熟，是否采用要看你的实际约束

当前这个仓库已经把通用类库模板收敛到 `tsdown`，组件库则继续使用 `vite` 库模式。

## 过时的方案

:::warning 不推荐继续使用
`tsup` 和 `unbuild` 在这个模板仓库里已经被标记为过时方案，不再作为新项目的推荐构建工具。
:::

- `tsup` 曾经用于部分 TypeScript 包和服务模板，但现在这些模板已经迁移到 `tsdown`。如果旧项目里还有 `tsup.config.ts`，建议改成 `tsdown.config.ts`，并把 `build` / `dev` 脚本切到 `tsdown`。
- `unbuild` 曾经用于库包开发时的 stub 流程，但这里的新模板已经统一使用 `tsdown --watch` 处理开发构建。新项目不要继续引入 `unbuild`。

新建 TypeScript 类库优先使用 `tsdown` 模板；Vue 组件库继续使用 `vite` 库模式。

## tsdown

repoctl 当前的通用类库模板是 [tsdown](https://github.com/icelib/repoctl/tree/main/templates/tsdown)

:::code-group

```ts [tsdown.config.ts]
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  target: 'node18',
})
```

:::

## vite

repoctl 的内置模板之一 [vue-lib](https://github.com/icelib/repoctl/tree/main/templates/vue-lib)

你可以在 [`vite` 库模式官方文档](https://vite.dev/guide/build.html#library-mode) 来查看打包 `vue` 组件的方式

这些能力已经配置在 [vue-lib](https://github.com/icelib/repoctl/tree/main/templates/vue-lib) 中

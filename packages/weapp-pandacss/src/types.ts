import type { loadConfig } from '@pandacss/config'
// @ts-ignore
import type { pluginOptions as CascadeLayersPluginOptions } from '@csstools/postcss-cascade-layers'
// @ts-ignore
import type { pluginOptions as IsPseudoClassPluginOptions } from '@csstools/postcss-is-pseudo-class'

export type PandacssConfigFileOptions = Parameters<typeof loadConfig>[0]

export interface ICreateContextOptions {
  /**
   * @description 转义断言函数
   */
  escapePredicate?: string // ((className: string) => boolean) |
  pandaConfig?: Partial<PandacssConfigFileOptions>
  log?: boolean
}

/**
 * @description 核心插件 `weapp-pandacss/postcss` 的配置项
 */
export interface IPostcssPluginOptions {
  /**
   * @description 是否禁用
   * @default false
   */
  disabled?: boolean
  /**
   * @description 选择器转义替换字符
   */
  selectorReplacement?: {
    /**
     * @description `:not(#\#)` 的转义方案
     * 默认是 `:not(#\#)` -> `:not(n)`
     * @default 'n'
     */
    cascadeLayers?: string
    /**
     * @description `*` 的转义方案
     * 默认是 `*` 展开 -> `view,text`
     * @default `['view', 'text']`
     */
    universal?: string | string[]
    /**
     * @description `:root` 的转义方案
     * 默认是 `:root` -> `page`
     * @default 'page'
     */
    root?: string | string[]
  }
  /**
   * @description 是否去除所有的 `:not(#\#)` 选择器
   * @default true
   */
  removeNegationPseudoClass?: boolean

  /**
   * @description CascadeLayersPluginOptions
   */
  cascadeLayersPluginOptions?: CascadeLayersPluginOptions

  /**
   * @description IsPseudoClassPluginOptions
   */
  isPseudoClassPluginOptions?: IsPseudoClassPluginOptions
}

/**
 * @description 用户在 `weapp-pandacss.config.ts` 文件里定义的配置
 */
export interface UserConfig {
  /**
   * @description postcss 配置
   */
  postcss?: Pick<
    IPostcssPluginOptions,
    'selectorReplacement' | 'removeNegationPseudoClass' | 'disabled'
  >

  /**
   * @description 代码生成器上下文配置
   */
  context?: Pick<ICreateContextOptions, 'escapePredicate' | 'pandaConfig'>
}

import type { Plugin, PluginCreator } from 'postcss'
import type {
  Root,
  Selector,
} from 'postcss-selector-parser'
import selectorParser, { selector as slt, tag,
} from 'postcss-selector-parser'
import { escape } from '@weapp-core/escape'
// @ts-ignore
import createCascadeLayersPlugin from '@csstools/postcss-cascade-layers'
// @ts-ignore
import createIsPseudoClassPlugin from '@csstools/postcss-is-pseudo-class'
import type { IPostcssPluginOptions } from '@/types'
import { createContext, getUserConfig } from '@/core'
import type { Ref } from '@/utils'
import { createSingleExecutionFunction, merge, normalizeString, ref } from '@/utils'
import { escapePostcssPlugin, wrapperPostcssPlugin } from '@/constants'

export function useOptions(options?: IPostcssPluginOptions) {
  // 默认没有默认值了，默认值从异步插件中初始化
  const optionsRef = ref(
    merge.recursive(
      true, // getPostcssPluginDefaults(),
      options,
    ) as Required<IPostcssPluginOptions>,
  )

  // <Required<IPostcssPluginOptions>, Required<IPostcssPluginOptions>[]>
  function mergeOptions(options?: IPostcssPluginOptions) {
    // merge(optionsRef.value, options)
    optionsRef.value = merge.recursive({}, options, optionsRef.value)
  }

  // const srRef = computed(() => {
  //   return optionsRef.value.selectorReplacement
  // })

  // selectorReplacement as Required<
  //   Required<IPostcssPluginOptions>['selectorReplacement']
  // >
  return {
    optionsRef,
    // srRef,
    mergeOptions,
  }
}

export const innerPlugin: PluginCreator<
  Ref<Required<IPostcssPluginOptions>>
> = (optionsRef) => {
  function getSelectorReplacement() {
    return optionsRef?.value.selectorReplacement as Required<
      Required<IPostcssPluginOptions>['selectorReplacement']
    >
  }
  function getRemoveNegationPseudoClass() {
    return optionsRef?.value.removeNegationPseudoClass
  }

  const utilitiesTransformer = selectorParser((selectors) => {
    const sr = getSelectorReplacement()
    selectors.walk((selector) => {
      if (selector.type === 'class') {
        selector.value = escape(selector.value)
      }
      // https://developer.mozilla.org/en-US/docs/Web/CSS/Adjacent_sibling_combinator
      if (selector.type === 'combinator') {
        // ' ', + , > , ~
        // has :not() and ~
        // General sibling combinator

        if (selector.value === '~' && selector.parent) {
          const idx = selector.parent.nodes.indexOf(selector)
          if (idx > -1) {
            const beforeNode = selector.parent.nodes[idx - 1]
            if (beforeNode.type !== 'class') {
              selector.value = '+'
            }
          }
        }
      }
      if (
        selector.type === 'universal'
        && selector.parent?.type === 'selector'
      ) {
        if (Array.isArray(sr.universal)) {
          const parent = selector.parent as Selector
          const idx = parent.nodes.indexOf(selector)
          if (idx > -1) {
            const rests = parent.nodes.slice(idx + 1)
            // root
            const root = parent.parent as Root | undefined
            if (root) {
              const pidx = root.nodes.indexOf(parent)
              if (pidx > -1) {
                root.nodes.splice(
                  pidx,
                  1,
                  ...sr.universal.map((x) => {
                    return slt({
                      nodes: [
                        tag({
                          value: x,
                        }),
                        ...rests,
                      ],
                      value: '',
                    })
                  }),
                )
              }
            }
          }
        }
        else {
          selector.value = sr.universal
        }
      }

      if (selector.type === 'pseudo' && selector.parent) {
        // where case
        if (selector.value === ':where' && selector.parent.parent) {
          // :root,:host
          const vals = selector.nodes.map(x => x.toString())
          vals.length === 2 && vals[0] === ':root' && vals[1] === ':host'
            ? (selector.parent.parent.nodes = [
                tag({
                  value: normalizeString(sr.root),
                }),
              ])
            : (selector.parent.parent.nodes = selector.nodes)
        }
        else if (selector.value === ':root' || selector.value === ':host') {
          selector.parent.nodes = [
            tag({
              value: normalizeString(sr.root),
            }),
          ]
        }
      }
    })
  })

  const atLayerTransformer = selectorParser((selectors) => {
    const removeNegationPseudoClass = getRemoveNegationPseudoClass()
    const sr = getSelectorReplacement()
    selectors.walk((selector) => {
      if (selector.type === 'pseudo' && selector.value === ':not') {
        for (const x of selector.nodes) {
          if (
            x.nodes.length === 1
            && x.nodes[0].type === 'id'
            && x.nodes[0].value === '#'
          ) {
            if (removeNegationPseudoClass) {
              selector.remove()
            }
            else {
              x.nodes = [
                tag({
                  value: sr.cascadeLayers,
                }),
              ]
            }
          }
        }
      }
    })
  })

  return {
    postcssPlugin: escapePostcssPlugin,
    prepare() {
      if (optionsRef?.value.disabled) {
        return {}
      }
      return {
        Declaration(decl) {
          if (optionsRef?.value.disabled) {
            return
          }
          decl.prop = escape(decl.prop)
        },
        Rule(rule) {
          if (optionsRef?.value.disabled) {
            return
          }
          utilitiesTransformer.transformSync(rule, {
            lossless: false,
            updateSelector: true,
          })
        },
        OnceExit(root) {
          if (optionsRef?.value.disabled) {
            return
          }
          root.walkRules(/:not\(#\\#\)/, (rule) => {
            atLayerTransformer.transformSync(rule, {
              lossless: false,
              updateSelector: true,
            })
          })
        },
      }
    },
  }
}

innerPlugin.postcss = true

// https://github.com/csstools/postcss-plugins/blob/main/plugins/postcss-cascade-layers/src/index.ts
// https://github.com/csstools/postcss-plugins/blob/main/plugins/postcss-cascade-layers/src/adjust-selector-specificity.ts
// ':not(#\\#)' raw: :not(#\\\\#)
// 就近原则 postcss options > weapp-pandans.config.ts
export const creator: PluginCreator<IPostcssPluginOptions> = (options) => {
  const { mergeOptions, optionsRef } = useOptions(options)
  // cascadeLayersPluginOptions 和 isPseudoClassPluginOptions
  const cascadeLayersPlugin = createCascadeLayersPlugin(
    optionsRef?.value.cascadeLayersPluginOptions,
  ) as Plugin
  const isPseudoClassPlugin = createIsPseudoClassPlugin(
    optionsRef?.value.isPseudoClassPluginOptions,
  ) as Plugin

  async function codegen() {
    const { config, configFile } = await getUserConfig()
    mergeOptions(config?.postcss)
    const ctx = await createContext({
      configFile,
      ...config?.context,
    })
    await ctx.codegen()
  }

  const codegenOnce = createSingleExecutionFunction(codegen)

  let inited = false
  return {
    postcssPlugin: wrapperPostcssPlugin,
    plugins: [
      async function () {
        if (!inited) {
          try {
            await codegenOnce()
            inited = true
          }
          catch (error) {
            console.log((<Error>error).message)
          }
        }
      },
      cascadeLayersPlugin,
      isPseudoClassPlugin,
      innerPlugin(optionsRef),
    ],
  }
}

creator.postcss = true

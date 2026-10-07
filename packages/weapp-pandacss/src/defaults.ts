import process from 'node:process'
import type { ICreateContextOptions, IPostcssPluginOptions } from '@/types'

export function getCreateContextDefaults(): Required<ICreateContextOptions> {
  return {
    pandaConfig: {
      cwd: process.cwd(),
    },
    log: false,
    escapePredicate: 'true',
  }
}
// 有数组的情况会合并
export function getPostcssPluginDefaults(): Required<IPostcssPluginOptions> {
  return {
    selectorReplacement: {
      cascadeLayers: 'n',
      root: 'page',
      universal: ['view', 'text'], // 'view,text'
    },
    removeNegationPseudoClass: true,
    disabled: false,
    cascadeLayersPluginOptions: {},
    isPseudoClassPluginOptions: {},
  }
}

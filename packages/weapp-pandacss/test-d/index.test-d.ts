import type { PluginCreator } from 'postcss'
import type { UserConfig } from 'weapp-pandacss'
import { expectAssignable, expectType } from 'tsd'
import {
  createContext,
  defineConfig,
  postcssPlugin,
} from 'weapp-pandacss'

expectAssignable<UserConfig>(defineConfig({
  context: {
    escapePredicate: 'true',
  },
}))
expectAssignable<PluginCreator<any>>(postcssPlugin)
expectType<Promise<Awaited<ReturnType<typeof createContext>>>>(createContext())

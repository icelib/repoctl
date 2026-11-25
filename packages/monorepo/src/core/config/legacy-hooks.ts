import { AsyncLocalStorage } from 'node:async_hooks'

const compatibility = new AsyncLocalStorage<boolean | 'release-source'>()

/** Only upgrade and diagnosis may read removed hook fields, to preserve custom setups. */
export const legacyHookConfigEnabled = () => compatibility.getStore() === true
export const withLegacyHookConfig = <T>(read: () => T): T => compatibility.run(true, read)

/** Frozen v5 release sources can retain lint-staged configuration. Never rewrite them. */
export const legacyReleaseSourceConfigEnabled = () => compatibility.getStore() === 'release-source'
export const withLegacyReleaseSourceConfig = <T>(read: () => T): T => compatibility.run('release-source', read)

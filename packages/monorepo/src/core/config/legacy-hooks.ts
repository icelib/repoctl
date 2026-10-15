import { AsyncLocalStorage } from 'node:async_hooks'

const compatibility = new AsyncLocalStorage<boolean>()

/** Only upgrade and diagnosis may read removed hook fields, to preserve custom setups. */
export const legacyHookConfigEnabled = () => compatibility.getStore() === true
export const withLegacyHookConfig = <T>(read: () => T): T => compatibility.run(true, read)

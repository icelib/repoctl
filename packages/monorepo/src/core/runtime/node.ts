import { engines } from '../../../package.json'

export const supportedNodeRange = engines.node
export const defaultNodeVersion = '24.22.1'
export const devContainerNodeVersions = [defaultNodeVersion, '22.23.4', '26.12.1'] as const

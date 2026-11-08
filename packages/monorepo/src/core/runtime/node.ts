import { readFileSync } from 'node:fs'
import path from 'node:path'
import { packageDir } from '../../constants'

const { engines } = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as { engines: { node: string } }

export const supportedNodeRange = engines.node
export const defaultNodeVersion = '24.22.1'
export const devContainerNodeVersions = [defaultNodeVersion, '22.23.4', '26.12.1'] as const

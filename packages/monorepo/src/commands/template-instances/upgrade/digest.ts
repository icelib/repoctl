import { createHash } from 'node:crypto'

export const upgradeDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

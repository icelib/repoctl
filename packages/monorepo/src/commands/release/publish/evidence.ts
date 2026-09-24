import type { PublishedPackage } from '../types'
import { stripVTControlCharacters } from 'node:util'

export function outputText(output: unknown) {
  return output == null ? '' : String(output)
}

export function acceptedFromOutput(output: string, candidates: PublishedPackage[]) {
  const versions = new Set(candidates.map(pkg => `${pkg.name}@${pkg.version}`))
  return stripVTControlCharacters(output).split(/\r?\n|\r/).flatMap((line) => {
    const match = line.trim().match(/^(?:✅\s*)?Published package ((?:@[^\s/]+\/)?[^\s@]+)@(\S+)$/u)
    if (!match || !versions.has(`${match[1]}@${match[2]}`)) {
      return []
    }
    return [{ name: match[1]!, version: match[2]! }]
  })
}

export function isTransientPublishFailure(output: string) {
  return /CA_CREATE_SIGNING_CERTIFICATE_ERROR|\bE(?:429|5\d{2})\b|ERR_PNPM_FETCH_(?:429|5\d{2})\b|EAI_AGAIN|ECONNRESET|ETIMEDOUT|(?:HTTP(?:\/\d(?:\.\d)?)?|status(?:\s+code)?|response(?:\s+code)?)\s*(?:[:=]\s*)?(?:429|5\d{2})\b/i.test(output)
}

export function isPublishConflict(output: string) {
  return /cannot publish over|EPUBLISHCONFLICT|previously published|already exists|status\s*(?::\s*)?409\b/i.test(output)
}

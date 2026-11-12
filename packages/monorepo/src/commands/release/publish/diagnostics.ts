import type { ReleaseOptions } from '../types'
import type { runPublishAttempt } from './command'
import { stripVTControlCharacters } from 'node:util'
import { ReleaseCommandError } from '../errors'
import { getReleaseEnv } from '../shared'

/** 保留有界的子进程失败证据，静默 JSON 发布也能诊断且不暴露凭证。 */
export function publishCommandError(message: string, result: ReturnType<typeof runPublishAttempt>, options: ReleaseOptions) {
  const secrets = Object.entries(getReleaseEnv(options))
    .filter(([key, value]) => /token|secret|password|credential|authorization/i.test(key) && value)
    .map(([, value]) => value!)
    .sort((a, b) => b.length - a.length)
  let output = stripVTControlCharacters([result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'))
  for (const secret of secrets) {
    output = output.replaceAll(secret, '[redacted]')
  }
  output = output
    .replaceAll(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted]')
    .replaceAll(/\bnpm_[a-z0-9]+\b/gi, '[redacted]')
    .replaceAll(/\b(?:gh[pousr]_\w+|github_pat_\w+)\b/g, '[redacted]')
    .trim()
    .slice(-8_000)
  const status = `exit=${result.status ?? 'unknown'}${result.signal ? ` signal=${result.signal}` : ''}`
  return new ReleaseCommandError(`${message} (${status})${output ? `\n${output}` : ''}`, result.status ?? 1)
}

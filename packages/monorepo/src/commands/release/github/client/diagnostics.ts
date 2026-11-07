/** 错误诊断只输出有界白名单字段，隐藏凭证与提交正文。 */
export function formatGitHubApiErrorMessage(data: unknown, statusText: string, token: string | undefined, body: unknown) {
  const submittedBody = typeof body === 'string'
    ? body
    : body && typeof body === 'object' && 'body' in body && typeof body.body === 'string' ? body.body : undefined
  const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()
  const sensitive = [...new Set([token, submittedBody]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .flatMap(value => [value, normalizeWhitespace(value)])
    .flatMap(value => [value, JSON.stringify(value).slice(1, -1)]))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  function safe(value: unknown, limit: number) {
    if (typeof value !== 'string') {
      return ''
    }
    let redacted = value
    for (const secret of sensitive) {
      redacted = redacted.replaceAll(secret, '[redacted]')
    }
    redacted = normalizeWhitespace(redacted)
    for (const secret of sensitive) {
      redacted = redacted.replaceAll(secret, '[redacted]')
    }
    return Array.from(redacted).slice(0, limit).join('')
  }
  const record = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
  const message = safe(record['message'], 240) || safe(statusText, 240) || 'Request failed'
  const details = (Array.isArray(record['errors']) ? record['errors'] : []).slice(0, 4).flatMap((error: unknown) => {
    if (!error || typeof error !== 'object' || Array.isArray(error)) {
      return []
    }
    const fields = ['resource', 'field', 'code', 'message'].flatMap((field) => {
      const value = safe((error as Record<string, unknown>)[field], 120)
      return value ? [`${field}=${value}`] : []
    })
    return fields.length ? [fields.join(', ')] : []
  })
  return details.length ? `${message} [${details.join('; ')}]` : message
}

import { describe, expect, it } from 'vitest'
import { promptTemplateParameters, resolveTemplateParameters } from '../..'

const schema = {
  name: { type: 'string', required: true },
  test: { type: 'boolean', default: true },
  style: { type: 'enum', options: ['css', 'none'], default: 'css' },
  token: { type: 'string', sensitive: true },
} as const
const contract = { ...schema, style: { ...schema.style, options: [...schema.style.options] } }

describe('built template parameter contract', () => {
  it('uses the same strict values and defaults for prompted and supplied inputs', async () => {
    const supplied = { name: 'widget', test: false, style: 'none', token: 'private-value' }
    const direct = resolveTemplateParameters(contract, supplied)
    const prompted = await promptTemplateParameters(contract, {}, async name => supplied[name as keyof typeof supplied])
    expect(prompted).toEqual(direct)
    expect(direct.values).toEqual(supplied)
    expect(direct.report['token']).toBe('[redacted]')
    expect(direct.retained).toEqual({ name: 'widget', test: false, style: 'none' })
    expect(direct.sensitive).toEqual(['token'])
    expect(resolveTemplateParameters(contract, { name: 'widget' }).values).toEqual({ name: 'widget', test: true, style: 'css' })
  })

  it('rejects invalid inputs before any prompt without printing their values', async () => {
    for (const [values, field] of [[{ name: 'ok', test: 'private-value' }, 'test'], [{ name: 'ok', style: 'private-value' }, 'style'], [{ secret: 'private-value' }, 'secret'], [{ name: 'ok', token: { secret: 'private-value' } }, 'token']] as const) {
      let prompts = 0
      const failure = await promptTemplateParameters(contract, values, async () => {
        prompts++
        return ''
      }).catch(error => error)
      expect(failure.message).toContain(`values.${field}`)
      expect(failure.message).not.toContain('private-value')
      expect(prompts).toBe(0)
    }
    expect(() => resolveTemplateParameters(contract, {})).toThrow('values.name')
  })

  it('does not accept schema typos, secret defaults or unsafe field names', () => {
    for (const input of [{ a: { type: 'boolean', default: 'true' } }, { a: { type: 'enum', options: [] } }, { a: { type: 'string', sensitive: true, default: 'private-value' } }, { a: { type: 'string', typo: true } }, JSON.parse('{"__proto__":{"type":"string"}}')]) {
      expect(() => resolveTemplateParameters(input as never)).toThrow('Template parameter parameters.')
    }
  })
})

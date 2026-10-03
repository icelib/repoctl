import type { GeneratorName } from './types'

export const generators = ['vue-component', 'react-component', 'hono-route'] as const

export function generatorIdentity(name: unknown) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || name.length > 80) {
    throw new Error('parameters.name must be a kebab-case name of at most 80 characters.')
  }
  return { name, symbol: name.split('-').map(part => part[0]!.toUpperCase() + part.slice(1)).join('') }
}

export function renderGenerator(generator: GeneratorName, symbol: string, specifier: string) {
  specifier = specifier.replaceAll('\'', '\\\'')
  if (generator === 'vue-component') {
    return {
      extension: 'vue',
      testExtension: 'ts',
      source: `<script setup lang="ts">
withDefaults(defineProps<{ label?: string, disabled?: boolean }>(), { label: '${symbol}', disabled: false })
const emit = defineEmits<{ activate: [] }>()
</script>

<template>
  <button type="button" :disabled="disabled" @click="emit('activate')">
    {{ label }}
  </button>
</template>
`,
      test: `import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import ${symbol} from '${specifier}.vue'

it('renders its label and emits activation', async () => {
  const wrapper = mount(${symbol}, { props: { label: 'Open' } })
  expect(wrapper.text()).toBe('Open')
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('activate')).toHaveLength(1)
  wrapper.unmount()
})

it('prevents activation while disabled', async () => {
  const wrapper = mount(${symbol}, { props: { disabled: true } })
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('activate')).toBeUndefined()
  wrapper.unmount()
})
`,
    }
  }
  if (generator === 'react-component') {
    return {
      extension: 'tsx',
      testExtension: 'tsx',
      source: `export interface ${symbol}Props {
  label?: string
  disabled?: boolean
  onActivate?: () => void
}

export function ${symbol}({ label = '${symbol}', disabled = false, onActivate }: ${symbol}Props) {
  return <button type="button" disabled={disabled} onClick={onActivate}>{label}</button>
}
`,
      test: `import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ${symbol} } from '${specifier}'

afterEach(cleanup)

it('renders its label and calls activation', () => {
  const onActivate = vi.fn()
  render(<${symbol} label="Open" onActivate={onActivate} />)
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  expect(onActivate).toHaveBeenCalledOnce()
})

it('prevents activation while disabled', () => {
  const onActivate = vi.fn()
  render(<${symbol} disabled onActivate={onActivate} />)
  fireEvent.click(screen.getByRole('button'))
  expect(onActivate).not.toHaveBeenCalled()
})
`,
    }
  }
  return {
    extension: 'ts',
    testExtension: 'ts',
    source: `import { Hono } from 'hono'

export const ${symbol} = new Hono().get('/', c => c.json({ message: '${symbol}' }))
`,
    test: `import { expect, it } from 'vitest'
import { ${symbol} } from '${specifier}'

it('responds to GET with its public JSON response', async () => {
  const response = await ${symbol}.request('/')
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ message: '${symbol}' })
})

it('does not accept unsupported methods', async () => {
  const response = await ${symbol}.request('/', { method: 'POST' })
  expect(response.status).toBe(404)
})
`,
  }
}

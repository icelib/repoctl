import type { StorybookSettings } from '../settings'

export const quote = (value: string) => `'${JSON.stringify(value).slice(1, -1).replaceAll('\\"', '"').replaceAll('\'', '\\\'')}'`

function object(value: Record<string, unknown>) {
  return `{ ${Object.entries(value).map(([key, item]) => `${key}: ${typeof item === 'string' ? quote(item) : JSON.stringify(item)}`).join(', ')} }`
}

export function storySource({ options, target }: StorybookSettings) {
  const { framework, example } = options
  const isVue = framework === 'vue'
  const renderer = isVue ? '@storybook/vue3-vite' : '@storybook/react-vite'
  const prop = example.kind === 'prop-update' ? example.prop : ''
  const initial = example.kind === 'prop-update' ? { [prop]: example.initial } : example.args
  const alternate = example.kind === 'prop-update' ? { [prop]: example.updated } : example.alternateArgs
  let imports = ''
  let render = ''
  if (example.kind === 'prop-update') {
    imports = isVue ? 'import { h, ref } from \'vue\'\n' : 'import { useState } from \'react\'\n'
    render = isVue
      ? `  render: args => ({
    setup() {
      const value = ref(${quote(example.initial)})
      return () => h('section', [
        h(TargetComponent, { ...args, ${prop}: value.value }),
        h('button', { type: 'button', onClick: () => { value.value = ${quote(example.updated)} } }, 'Update example state'),
      ])
    },
  }),\n`
      : `  render: function Example(args) {
    const [value, setValue] = useState(${quote(example.initial)})
    return (
      <section>
        <TargetComponent {...args} ${prop}={value} />
        <button type="button" onClick={() => setValue(${quote(example.updated)})}>Update example state</button>
      </section>
    )
  },\n`
  }
  const click = example.kind === 'prop-update' ? { role: 'button', name: 'Update example state' } : example.click
  const locator = 'testId' in click
    ? `canvas.getByTestId(${quote(click.testId)})`
    : `canvas.getByRole(${quote(click.role)}, { name: ${quote(click.name)} })`
  const expected = example.kind === 'prop-update' ? example.updated : example.expectText
  const valueImports = [
    [target.name, `import { ${options.component} as TargetComponent } from ${quote(target.name)}`],
    ['storybook/test', 'import { expect, userEvent, within } from \'storybook/test\''],
    ...(imports ? [[framework, imports.trim()]] : []),
  ].sort(([a], [b]) => a!.localeCompare(b!)).map(([, line]) => line).join('\n')
  return `import type { Meta, StoryObj } from '${renderer}'
${valueImports}

const meta = {
  title: ${quote(`Components/${options.component}`)},
  component: TargetComponent,
} satisfies Meta<typeof TargetComponent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: ${object(initial)} }

export const Alternate: Story = { args: ${object(alternate)} }

export const Interaction: Story = {
  args: ${object(initial)},
${render}  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(${locator})
    await expect(canvas.getByText(${quote(expected)}, { exact: true })).toBeVisible()
  },
}
`
}

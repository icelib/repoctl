import { getCreateContextDefaults, getPostcssPluginDefaults } from '@/defaults'

describe('defaults', () => {
  it('getCreateContextDefaults', () => {
    const config = getCreateContextDefaults()
    expect(config).toBeDefined()
    expect(config.pandaConfig).toBeDefined()
    expect(config.pandaConfig.cwd).toBeDefined()
    expect(config.pandaConfig.cwd).toBe(process.cwd())
  })

  it('getPostcssPluginDefaults', () => {
    const { selectorReplacement, removeNegationPseudoClass } =
      getPostcssPluginDefaults()
    expect(selectorReplacement).toBeDefined()
    expect(selectorReplacement.cascadeLayers).toBeDefined()
    expect(selectorReplacement.root).toBeDefined()
    expect(selectorReplacement.universal).toBeDefined()
    expect(removeNegationPseudoClass).toBe(true)
  })
})

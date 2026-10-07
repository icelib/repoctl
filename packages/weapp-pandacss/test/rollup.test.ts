import { rollup } from 'rollup'
import omit from 'lodash/omit'
import type { OutputChunk, OutputAsset } from 'rollup'
import config from '../rollup.config'

function normalizeOutput(
  outputs: [OutputChunk, ...(OutputChunk | OutputAsset)[]]
) {
  return outputs.map((x) => {
    return omit(x, ['modules', 'facadeModuleId', 'moduleIds'])
  })
}
// diff output changes
// run `jest -u` to update snap
describe.skip('rollup build', () => {
  it('lib build output diff', async () => {
    // const result:RollupBuild[] = []

    const bundle = await rollup({
      input: config.input,
      external: config.external,
      output: config.output,
      plugins: config.plugins
    })
    if (Array.isArray(config.output)) {
      for (let j = 0; j < config.output.length; j++) {
        const { output } = await bundle.generate(config.output[j])
        expect(normalizeOutput(output)).toMatchSnapshot()
      }
    } else if (config.output) {
      const { output } = await bundle.generate(config.output)
      expect(normalizeOutput(output)).toMatchSnapshot()
    }
  })
})

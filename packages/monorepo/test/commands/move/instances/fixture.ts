import fs from 'node:fs/promises'
import { loadTemplateBaseline, writeTemplateSnapshot } from '@icebreakers/monorepo-templates'
import path from 'pathe'
// eslint-disable-next-line antfu/no-import-dist -- Exercise real creation and the delivered instance registry.
import { createNewProject, listTemplateInstances } from '../../../../dist/index.mjs'
import { commit, fixture } from '../fixture'

export { commit, snapshot } from '../fixture'

export async function registeredFixture() {
  const h = await fixture({})
  await createNewProject({ cwd: h.workspace, name: 'packages/old', type: 'tsdown' })
  const [record] = await listTemplateInstances(h.workspace)
  const instance = record!.instance
  const targetDir = path.join(h.workspace, instance.target)
  await fs.writeFile(path.join(targetDir, 'business.txt'), 'Keep the business implementation\n')
  await fs.appendFile(path.join(targetDir, 'src/index.ts'), '\n// Business customization remains local.\n')
  await commit(h.workspace)
  return { ...h, instance, targetDir, registryFile: path.join(h.workspace, '.repoctl/template-instances.json') }
}

export async function nextSource(h: Awaited<ReturnType<typeof registeredFixture>>) {
  const source = path.join(h.root, 'next-package')
  await fs.mkdir(path.join(source, 'templates'), { recursive: true })
  if (h.instance.baseline.status !== 'available') {
    throw new Error('Expected an actual generated instance baseline.')
  }
  await writeTemplateSnapshot(await loadTemplateBaseline(h.workspace, h.instance.baseline.original), path.join(source, 'templates/tsdown'))
  await fs.writeFile(path.join(source, 'package.json'), '{"name":"@icebreakers/monorepo-templates","version":"99.0.0"}\n')
  await fs.writeFile(path.join(source, 'templates/tsdown/upstream.txt'), 'New upstream capability\n')
  return source
}

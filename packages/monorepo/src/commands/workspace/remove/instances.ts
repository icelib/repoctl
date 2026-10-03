import { loadTemplateInstanceRegistry } from '@icebreakers/monorepo-templates'

/** Removal keeps origin records so deleting files cannot silently erase their history. */
export async function removalInstanceNextSteps(workspaceDir: string, target: string) {
  const registry = await loadTemplateInstanceRegistry(workspaceDir)
  return registry.instances
    .filter(instance => instance.target === target || instance.target.startsWith(`${target}/`))
    .map(instance => `Template instance ${instance.id} at ${instance.target} retains its provenance and baselines and will be reported as missing. Inspect it with repo templates instances ${instance.id} --json. Restore the original project from version control or a backup; use a different unowned path for a new project. Removal does not release registered paths.`)
}

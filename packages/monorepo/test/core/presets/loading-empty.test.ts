import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { fixture } from './fixture'

it('resolves empty and invalid preset references without any filesystem discovery', async () => {
  const h = await fixture()
  const cwd = path.join(h.root, 'absent-consumer', 'nested')
  const entry = pathToFileURL(path.resolve(import.meta.dirname, '../../../dist/index.mjs')).href
  const valid = { packageName: '@team/base', version: '1.0.0' }
  const references = [[], null, {}, [{ ...valid, version: '^1.0.0' }], Array.from({ length: 65 }).fill(valid)]
  const script = `
    import fs from 'node:fs';
    import promises from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    const repo = await import(${JSON.stringify(entry)});
    const probes = [];
    const restore = [];
    const patch = (target, name) => {
      const original = target[name];
      restore.push(() => { target[name] = original; });
      const guard = () => { probes.push(name); throw new Error('Unexpected filesystem discovery'); };
      if (name === 'realpath' || name === 'realpathSync') guard.native = guard;
      target[name] = guard;
    };
    for (const name of ['access', 'lstat', 'open', 'readdir', 'readFile', 'realpath', 'stat']) {
      patch(fs, name);
      patch(fs, name + 'Sync');
      patch(promises, name);
    }
    syncBuiltinESMExports();
    try {
      const results = [];
      for (const input of ${JSON.stringify(references)}) {
        results.push(await repo.resolveOrganizationPresets(${JSON.stringify(cwd)}, input));
      }
      const earlyProbes = [...probes];
      let controlError;
      try { await repo.resolveOrganizationPresets(${JSON.stringify(cwd)}, [${JSON.stringify(valid)}]); }
      catch (error) { controlError = String(error); }
      process.stdout.write(JSON.stringify({ results, earlyProbes, controlProbes: probes, controlError }));
    } finally {
      for (const reset of restore) reset();
      syncBuiltinESMExports();
    }
  `
  const execution = await execa(process.execPath, ['--input-type=module', '-e', script], { cwd: h.root, reject: false })
  expect(execution.exitCode, execution.stderr).toBe(0)
  const { results, earlyProbes, controlProbes, controlError } = JSON.parse(execution.stdout)
  expect(earlyProbes).toEqual([])
  expect(controlProbes.length, controlError).toBeGreaterThan(0)
  const empty = { workspaceDir: cwd.replaceAll('\\', '/'), layers: [], inputs: [], locations: [], diagnostics: [] }
  expect(results[0]).toEqual(empty)
  for (const result of results.slice(1)) {
    expect(result).toMatchObject({ ...empty, diagnostics: expect.any(Array) })
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ id: result === results[4] ? 'preset.limit' : 'preset.invalid-reference', status: 'fail' }))
  }
})

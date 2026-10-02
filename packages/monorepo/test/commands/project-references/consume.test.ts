import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { planProjectReferences, syncProjectReferences } from '../../../dist/index.mjs'
import { fixture, settings, sourceRoot, write } from './fixtures'

it('builds a real TS consumer after synchronizing explicit compilation references', async (t) => {
  const root = await fixture(t)
  await settings(root, { enabled: true, relations: [{ source: 'packages/app/tsconfig.json', target: 'packages/lib/tsconfig.json' }] })
  await write(root, 'packages/app/src/index.ts', 'import { value } from "../../lib/src/index.js"\nexport const answer: number = value\n')
  await syncProjectReferences(root)
  await execa(process.execPath, [path.join(sourceRoot, 'node_modules/typescript/bin/tsc'), '--build', 'tsconfig.json'], { cwd: root })
  expect(await fs.readFile(path.join(root, 'packages/app/dist-tsconfig.json/index.d.ts'), 'utf8')).toContain('answer: number')
  expect((await planProjectReferences(root)).action).toBe('unchanged')
})

it('retains the existing Vue typecheck entrypoint and validates an actual SFC through vue-tsc', async (t) => {
  const root = await fixture(t)
  await write(root, 'packages/app/package.json', { name: '@fixture/app', private: true, type: 'module', scripts: { typecheck: 'vue-tsc -b' } })
  await fs.symlink(path.join(sourceRoot, 'templates/vue-lib/node_modules'), path.join(root, 'packages/app/node_modules'), 'junction')
  await write(root, 'packages/app/tsconfig.json', { extends: '../../base.json', compilerOptions: { emitDeclarationOnly: true, outDir: 'dist', rootDir: 'src' }, include: ['src/**/*.ts', 'src/**/*.vue'] })
  await write(root, 'packages/app/src/Example.vue', '<script setup lang="ts">\ndefineProps<{ title: string }>()\n</script>\n<template><p>{{ title }}</p></template>\n')
  const manifest = await fs.readFile(path.join(root, 'packages/app/package.json'), 'utf8')
  const plan = await planProjectReferences(root)
  expect(plan.validation.find(item => item.config === 'packages/app/tsconfig.json')).toEqual({ config: 'packages/app/tsconfig.json', cwd: 'packages/app', command: ['pnpm', 'run', 'typecheck'] })
  await syncProjectReferences(root)
  await execa('pnpm', ['run', 'typecheck'], { cwd: path.join(root, 'packages/app') })
  expect(await fs.readFile(path.join(root, 'packages/app/dist/Example.vue.d.ts'), 'utf8')).toContain('title: string')
  expect(await fs.readFile(path.join(root, 'packages/app/package.json'), 'utf8')).toBe(manifest)
})

it('exposes read-only CLI check and dry-run, then applies a reviewed JSON plan', async (t) => {
  const root = await fixture(t)
  const cli = path.join(sourceRoot, 'packages/repoctl/bin/repo.js')
  const run = (args: string[]) => execa(process.execPath, [cli, 'tooling', 'references', ...args], { cwd: root, reject: false })
  const check = await run(['check', '--json'])
  expect(check.exitCode).toBe(1)
  expect(JSON.parse(check.stdout).ok).toBe(false)
  const preview = await run(['sync', '--dry-run'])
  expect(preview.exitCode).toBe(0)
  expect(JSON.parse(preview.stdout).action).toBe('update')
  await expect(fs.stat(path.join(root, '.repoctl'))).rejects.toThrow()
  await fs.writeFile(path.join(root, 'plan.json'), preview.stdout)
  expect((await run(['apply', 'plan.json'])).exitCode).toBe(0)
  const after = await run(['check', '--json'])
  expect(after.exitCode).toBe(0)
  expect(JSON.parse(after.stdout).ok).toBe(true)
})

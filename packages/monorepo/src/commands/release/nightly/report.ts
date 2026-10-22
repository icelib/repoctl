import type { NightlyOptions, NightlyReport } from './types'
import { appendFile, lstat, mkdir, mkdtemp, realpath, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

export async function createNightlyOutput(source: string, options: NightlyOptions) {
  const env = options.env ?? process.env
  const requested = path.resolve(options.outputDirectory ?? path.join(env['RUNNER_TEMP'] ?? tmpdir(), 'repoctl-nightly'))
  let existing = requested
  while (true) {
    try {
      await lstat(existing)
      break
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(existing) === existing) {
        throw error
      }
      existing = path.dirname(existing)
    }
  }
  const target = path.resolve(await realpath(existing), path.relative(existing, requested))
  const relative = path.relative(source, target)
  if (!relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error('Nightly reports and artifacts must stay outside the source repository.')
  }
  await mkdir(target, { recursive: true })
  return mkdtemp(path.join(await realpath(target), 'repoctl-nightly-'))
}

export async function checkpointNightly(report: NightlyReport) {
  if (report.outputDirectory) {
    const filename = path.join(report.outputDirectory, 'nightly-report.json')
    await writeFile(`${filename}.tmp`, `${JSON.stringify(report, null, 2)}\n`)
    await rename(`${filename}.tmp`, filename)
  }
}

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('`', '&#96;').replaceAll('|', '&#124;').replace(/[\r\n]+/g, ' ')

export function formatNightlySummary(report: NightlyReport) {
  const verified = report.status === 'published' && report.confirmed && report.consumer?.status === 'verified'
  const lines = ['## Nightly release', '', `Provider: ${report.provider}`, '', `Status: ${verified ? 'published and consumer verified' : report.status}`, '']
  if (report.commit) {
    lines.push(`Source: \`${escape(report.commit)}\``, '')
  }
  if (report.reason || report.error) {
    lines.push(escape(report.error ?? report.reason!), '')
  }
  if (verified) {
    lines.push('Install the complete batch (including internal peers):', '', `\`pnpm add ${report.packages.map(pkg => escape(pkg.locator)).join(' ')}\``, '')
    lines.push('| Package | Install |', '| --- | --- |')
    for (const pkg of report.packages) {
      lines.push(`| ${escape(pkg.name)} | \`pnpm add ${escape(pkg.locator)}\` |`)
    }
    lines.push('', report.provider === 'npm' ? 'All snapshot-nightly tags match this build; latest tags are unchanged.' : 'All full-commit preview URLs match the verified tarballs.', '')
  }
  else if (report.status === 'prepared') {
    lines.push('Artifacts are prepared and validated. Publication was not requested.', '')
  }
  return `${lines.join('\n')}\n`
}

export async function writeNightlySummary(report: NightlyReport, filename?: string) {
  if (filename) {
    await appendFile(filename, formatNightlySummary(report))
  }
}

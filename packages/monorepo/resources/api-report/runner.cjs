const { createHash } = require('node:crypto')
const fs = require('node:fs/promises')
const { createRequire } = require('node:module')
const path = require('node:path')
const process = require('node:process')

async function run() {
  const job = JSON.parse(await fs.readFile(process.argv[2], 'utf8'))
  const { Extractor, ExtractorConfig } = require(job.tool)
  const ts = createRequire(job.tool)('typescript')
  const observed = new Map()
  const parsed = ts.getParsedCommandLineOfConfigFile(job.tsconfig, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic() {
      throw new Error('Invalid TypeScript configuration')
    },
    readFile(filename) {
      const content = ts.sys.readFile(filename)
      if (content !== undefined) {
        observed.set(filename, content)
      }
      return content
    },
  })
  if (!parsed || parsed.errors.length) {
    throw new Error('Invalid TypeScript configuration')
  }
  const manifestText = await fs.readFile(job.packageJson, 'utf8')
  observed.set(job.packageJson, manifestText)
  const packageJson = JSON.parse(manifestText)
  const config = ExtractorConfig.prepare({
    configObject: {
      projectFolder: path.dirname(job.packageJson),
      mainEntryPointFilePath: job.entryPoint,
      compiler: { tsconfigFilePath: job.tsconfig },
      apiReport: { enabled: true, reportFileName: 'entry.api.md', reportFolder: job.temporary, reportTempFolder: job.temporary },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
    },
    configObjectFullPath: undefined,
    packageJsonFullPath: job.packageJson,
    packageJson,
  })
  const diagnostics = []
  const clean = text => text.split(job.temporary).join('<temporary>').split(job.root).join('<workspace>')
  const result = Extractor.invoke(config, {
    localBuild: true,
    messageCallback(message) {
      message.handled = true
      if (['error', 'warning'].includes(message.logLevel)) {
        diagnostics.push({ code: message.messageId, severity: message.logLevel, message: clean(message.text), ...(message.sourceFilePath ? { file: path.relative(job.root, message.sourceFilePath).split(path.sep).join('/') } : {}), ...(message.sourceFileLine ? { line: message.sourceFileLine } : {}) })
      }
    },
  })
  for (const file of result.compilerState.program.getSourceFiles()) {
    observed.set(file.fileName, file.text)
  }
  const inputs = []
  for (const [filename, content] of observed) {
    const current = await fs.readFile(filename, 'utf8')
    if (current.replace(/^\uFEFF/u, '') !== content.replace(/^\uFEFF/u, '')) {
      throw new Error('Compiler input changed during analysis')
    }
    inputs.push({ path: path.resolve(filename), hash: createHash('sha256').update(current).digest('hex') })
  }
  inputs.sort((a, b) => a.path.localeCompare(b.path))
  const inputHash = createHash('sha256').update(JSON.stringify(inputs)).digest('hex')
  const report = result.succeeded ? (await fs.readFile(path.join(job.temporary, 'entry.api.md'), 'utf8')).replaceAll('\r\n', '\n') : null
  process.stdout.write(JSON.stringify({ succeeded: result.succeeded, diagnostics, report, inputHash, inputs }))
}

run().catch(() => {
  process.stdout.write(JSON.stringify({ succeeded: false, diagnostics: [{ code: 'extractor-failed', severity: 'error', message: 'API Extractor could not analyze the declared entrypoint. Verify the declaration output and TypeScript configuration.' }], report: null }))
  process.exitCode = 1
})

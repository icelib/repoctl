const fs = require('fs')
const fsp = fs.promises
const pkgJson = require('../../package.json')
const pkgName = pkgJson.name
// const path = require('path')

async function addBin(json, filename) {
  json.bin = {
    [pkgName]: filename
  }
  if (Array.isArray(json.files)) {
    json.files.push('bin')
  } else {
    json.files = ['dist', 'bin']
  }
  return json
}

async function createBin(pkgName) {
  try {
    await fsp.access('bin')
  } catch (error) {
    await fsp.mkdir('bin')
  }
  const filename = `bin/${pkgName}.js`
  await fsp.writeFile(
    filename,
    "#!/usr/bin/env node\nrequire('../dist/cli.js')\n"
  )
  return filename
}

async function createCli() {
  return fsp.writeFile('./src/cli.ts', '// get params from process.argv')
}

;(async () => {
  const filename = await createBin(pkgName)
  await createCli()
  const pkg = await addBin(pkgJson, filename)
  await fsp.writeFile('./package.json', JSON.stringify(pkg, null, 2))
  console.log('bin create successfully!')
})()

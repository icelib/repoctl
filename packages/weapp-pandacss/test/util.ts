import path from 'node:path'

const fixturesRoot = path.resolve(__dirname, 'fixtures')

const cssRoot = path.resolve(fixturesRoot, 'css')

const appRoot = path.resolve(fixturesRoot, 'app')

const root = path.resolve(__dirname, '..')

const examplesRoot = path.resolve(root, 'examples')

const taroAppRoot = path.resolve(examplesRoot, 'taro-app')

const configRoot = path.resolve(__dirname, 'config')

export {
  fixturesRoot,
  cssRoot,
  appRoot,
  root,
  examplesRoot,
  taroAppRoot,
  configRoot
}

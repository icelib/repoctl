import { mkdir, readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

const { name } = JSON.parse(await readFile('package.json', 'utf8'))
const value = await readFile(name === 'upstream' ? 'src/value.txt' : '../upstream/dist/value.txt', 'utf8')
if (value === 'broken') {
  console.error('INTENTIONAL_BUILD_FAILURE')
  process.exit(1)
}
if (name === 'upstream' && value === 'slow') {
  await writeFile('../../running.pid', String(process.pid))
  await setTimeout(60_000)
}
await mkdir('dist', { recursive: true })
await writeFile('dist/value.txt', value)
console.log(`BUILT ${name} ${value}`)

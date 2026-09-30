import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

const content = new URL('../src/content/docs/', import.meta.url)
const files = await readdir(content, { recursive: true })
const pages = files.filter(file => /\.mdx?$/.test(file)).map(file => file.split(path.sep).join('/'))
const english = pages.filter(file => !file.startsWith('zh/')).sort()
const chinese = pages.filter(file => file.startsWith('zh/')).map(file => file.slice(3)).sort()
assert.deepEqual(chinese, english, 'Every published page needs matching English and Chinese source files.')
console.log(`Locale parity checked: ${english.length} page pairs.`)

import fs from 'node:fs'
import path from 'node:path'

import klaw from 'klaw'
const distPath = path.resolve(__dirname, '../dist')
describe('dts', () => {
  it('dist dts no `from "@/xxx`', async () => {
    for await (const file of klaw(distPath)) {
      if (/\.d.ts$/.test(file.path)) {
        const content = fs.readFileSync(file.path, 'utf8')
        expect(content).toEqual(expect.not.stringMatching(/from\s+["']@\//g))
      }
    }
  })
})

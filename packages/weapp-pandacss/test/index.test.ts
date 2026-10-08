import { createContext, postcssPlugin } from '@/index'

describe('[Default]', () => {
  it('export default', () => {
    for (const x of [createContext, postcssPlugin]) {
      expect(x).toBeDefined()
    }
  })
})

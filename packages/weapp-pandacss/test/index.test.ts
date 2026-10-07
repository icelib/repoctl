import { createContext, postcssPlugin } from '@/index'

describe('[Default]', () => {
  test('export default', () => {
    for (const x of [createContext, postcssPlugin]) {
      expect(x).toBeDefined()
    }
  })
})

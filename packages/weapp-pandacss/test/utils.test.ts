import { createSingleExecutionFunction, normalizeString } from '@/utils'

describe('utils', () => {
  it('normalizeString', () => {
    expect(normalizeString('1111')).toBe('1111')
    expect(normalizeString(['1111'])).toEqual('1111')
    expect(normalizeString(['123', 'abc'])).toEqual('123,abc')
    expect(normalizeString(['123', 'abc'], '')).toEqual('123abc')
  })
})

describe('createSingleExecutionFunction', () => {
  it('should execute the function once and return the result', async () => {
    const asyncFunction = vi.fn(async () => 'Success!')
    const singleExecutionFunction = createSingleExecutionFunction(asyncFunction)

    const result = await singleExecutionFunction()

    expect(result).toBe('Success!')
    expect(asyncFunction).toHaveBeenCalledTimes(1)
  })

  it('should not execute the function again after the first success', async () => {
    const asyncFunction = vi.fn(async () => 'Success!')
    const singleExecutionFunction = createSingleExecutionFunction(asyncFunction)

    await singleExecutionFunction()
    const result = await singleExecutionFunction()

    expect(result).toBe('Success!')
    expect(asyncFunction).toHaveBeenCalledTimes(1)
  })

  it('should execute the function again if the first execution fails', async () => {
    let callCount = 0
    const asyncFunction = vi.fn(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('Failed!')
      }
      return 'Success!'
    })
    const singleExecutionFunction = createSingleExecutionFunction(asyncFunction)

    try {
      await singleExecutionFunction()
    }
    catch (error) {
      // @ts-ignore
      expect(error.message).toBe('Failed!')
    }

    const result = await singleExecutionFunction()

    expect(result).toBe('Success!')
    expect(asyncFunction).toHaveBeenCalledTimes(2)
  })

  it('should handle multiple concurrent calls', async () => {
    const asyncFunction = vi.fn(async () => {
      return new Promise(resolve => setTimeout(() => resolve('Success!'), 100))
    })
    const singleExecutionFunction = createSingleExecutionFunction(asyncFunction)

    const [result1, result2] = await Promise.all([singleExecutionFunction(), singleExecutionFunction()])

    expect(result1).toBe('Success!')
    expect(result2).toBe('Success!')
    expect(asyncFunction).toHaveBeenCalledTimes(1)
  })
})

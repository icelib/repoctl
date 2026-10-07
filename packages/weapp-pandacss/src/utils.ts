function normalizeString(strs: string | string[], separator = ',') {
  if (Array.isArray(strs)) {
    return strs.join(separator)
  }
  return strs
}
// https://github.com/vuejs/vue/blob/49b6bd4264c25ea41408f066a1835f38bf6fe9f1/src/v3/reactivity/computed.ts#L37
function ref<T>(value: T) {
  return {
    value,
  }
}

type Ref<T> = ReturnType<typeof ref<T>>

export { normalizeString, ref, Ref }

export { default as dedent } from 'dedent'

export { defu } from 'defu'

export { default as merge } from 'merge'

export function createSingleExecutionFunction<T extends (...args: any[]) => Promise<any>>(fn: T) {
  let promise: ReturnType<T> | null = null
  let executed = false
  const wrapFn = function (...args: Parameters<T>): ReturnType<T> {
    if (!promise) {
      promise = fn(...args).then(
        (result) => {
          executed = true
          return result
        },
        (error) => {
          executed = false
          promise = null
          throw error
        },
      ) as ReturnType<T>
    }
    return promise as ReturnType<T>
  }
  wrapFn.executed = executed
  return wrapFn
}

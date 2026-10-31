import type { ConsumerRuntimeContext } from '../../types'

/** 实际导入平台保护入口，只接受声明的精确错误。 */
export function expectedErrorConsumerSource(specifier: string, context: Exclude<ConsumerRuntimeContext, string>): string {
  return [
    'let failure;',
    `try { await import(${JSON.stringify(specifier)}); } catch (error) { failure = error; }`,
    `if (!(failure instanceof Error) || failure.name !== ${JSON.stringify(context.name)} || failure.message !== ${JSON.stringify(context.message)}) throw new Error("Entry did not preserve its declared unavailable-runtime error.", { cause: failure });`,
  ].join('\n')
}

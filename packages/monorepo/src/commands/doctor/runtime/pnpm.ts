import type { DoctorCheck, DoctorContext } from '../types'
import { eq, valid } from 'semver'
import { localize } from '../../../i18n'
import { inspectPnpmRuntime } from '../../../utils/pnpm-runtime'

export function declaredPnpmVersion(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('pnpm@')) {
    return undefined
  }
  const version = value.slice(5).split('+sha')[0]!
  return valid(version) ?? undefined
}

export async function collectPnpmChecks({ packageJson }: DoctorContext, selected?: ReadonlySet<string>): Promise<DoctorCheck[]> {
  const declared = declaredPnpmVersion(packageJson.packageManager)
  const checks: DoctorCheck[] = []
  if (!selected || selected.has('package-manager')) {
    checks.push({
      id: 'package-manager',
      title: localize('Declared package manager', '声明的包管理器'),
      status: declared ? 'pass' : packageJson.packageManager ? 'fail' : 'warn',
      detail: declared
        ? localize(`packageManager pins pnpm@${declared}.`, `packageManager 固定为 pnpm@${declared}。`)
        : localize('packageManager must declare an exact pnpm version to verify consistency.', 'packageManager 需要声明明确的 pnpm 版本才能验证一致性。'),
      ...(!declared ? { fix: localize('Set packageManager to pnpm@<version> in the root package.json.', '在根 package.json 中设置 packageManager 为 pnpm@<版本>。') } : {}),
    })
  }
  if (!selected || selected.has('pnpm-version')) {
    const runtime = await inspectPnpmRuntime()
    const status = runtime.state === 'missing'
      ? 'fail'
      : runtime.state === 'unknown' || !declared ? 'warn' : eq(runtime.version, declared) ? 'pass' : 'fail'
    checks.push({
      id: 'pnpm-version',
      title: localize('Observed pnpm version', '观测到的 pnpm 版本'),
      status,
      detail: runtime.state === 'observed'
        ? localize(`Observed pnpm ${runtime.version}; declared ${declared ?? 'unknown'}. Source: ${runtime.source}.`, `观测到 pnpm ${runtime.version}；声明版本 ${declared ?? '未知'}。来源：${runtime.source}。`)
        : runtime.state === 'missing'
          ? localize('pnpm is missing from PATH and no pnpm launch evidence is available.', 'PATH 中没有 pnpm，也没有 pnpm 启动证据。')
          : localize(`pnpm version is unknown; no launcher was executed. ${runtime.source}.`, `pnpm 版本未知，未执行启动器。${runtime.source}。`),
      ...(status !== 'pass' ? { fix: localize('Install/select the declared pnpm version explicitly, then run pnpm exec repo doctor. Doctor never activates or downloads pnpm.', '手动安装或选择声明的 pnpm 版本，然后执行 pnpm exec repo doctor。Doctor 不会激活或下载 pnpm。') } : {}),
    })
  }
  return checks
}

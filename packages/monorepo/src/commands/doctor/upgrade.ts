import type { DoctorCheck } from './types'
import { localize } from '../../i18n'
import { inspectUpgradeLock, inspectUpgradeTransactions } from '../upgrade'
import { createCheck } from './helpers'

/**
 * Report upgrade state only when it needs operator attention. A healthy
 * workspace has no lock or pending journal, so omitting these checks keeps the
 * normal doctor report stable while making interrupted upgrades visible.
 */
export async function collectUpgradeChecks(workspaceDir: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []
  try {
    const lock = await inspectUpgradeLock(workspaceDir)
    if (lock.state === 'active') {
      checks.push(createCheck({
        id: 'upgrade-lock',
        title: localize('upgrade lock', '升级锁'),
        status: 'fail',
        detail: localize(
          `An upgrade is currently running (pid ${lock.owner?.pid ?? 'unknown'}).`,
          `升级当前正在运行（进程 pid：${lock.owner?.pid ?? '未知'}）。`,
        ),
        fix: localize('Wait for the process to finish, then run repo doctor again.', '请等待该进程结束，然后重新运行 repo doctor。'),
      }))
    }
    else if (lock.state === 'stale') {
      checks.push(createCheck({
        id: 'upgrade-lock',
        title: localize('upgrade lock', '升级锁'),
        status: 'warn',
        detail: localize(
          `Found a stale upgrade lock from pid ${lock.owner?.pid ?? 'unknown'}.`,
          `检测到来自进程 pid ${lock.owner?.pid ?? '未知'} 的过期升级锁。`,
        ),
        fix: localize('Run repo upgrade again to reclaim the stale lock, then run repo doctor.', '重新运行 repo upgrade 以回收过期锁，然后运行 repo doctor。'),
      }))
    }
    else if (lock.state === 'malformed') {
      checks.push(createCheck({
        id: 'upgrade-lock',
        title: localize('upgrade lock', '升级锁'),
        status: 'fail',
        detail: localize(lock.reason ?? 'The upgrade lock is malformed.', lock.reason ?? '升级锁格式损坏。'),
        fix: localize('Inspect the lock path and owner metadata before removing it manually.', '请先检查锁路径和 owner 元数据，再手动删除。'),
      }))
    }
  }
  catch (error) {
    checks.push(createCheck({
      id: 'upgrade-lock',
      title: localize('upgrade lock', '升级锁'),
      status: 'fail',
      detail: localize(`Unable to inspect the upgrade lock: ${String(error)}`, `无法检查升级锁：${String(error)}`),
      fix: localize('Check filesystem permissions for the .repoctl directory, then run repo doctor again.', '请检查 .repoctl 目录的文件系统权限，然后重新运行 repo doctor。'),
    }))
  }

  try {
    const transactions = await inspectUpgradeTransactions(workspaceDir)
    const pending = transactions.filter(item => item.needsReview)
    if (pending.length > 0) {
      const details = pending
        .map(item => `${item.id} (${item.state}, ${item.appliedCount}/${item.operationCount} applied)`)
        .join(', ')
      checks.push(createCheck({
        id: 'upgrade-transactions',
        title: localize('upgrade transactions', '升级事务'),
        status: 'fail',
        detail: localize(`Upgrade transactions need review: ${details}.`, `以下升级事务需要人工检查：${details}。`),
        fix: localize('Call inspectUpgradeTransactions(cwd), review affected files, and remove a journal only after confirming it is safe.', '请调用 inspectUpgradeTransactions(cwd)，检查受影响文件，确认安全后再删除 journal。'),
      }))
    }
  }
  catch (error) {
    checks.push(createCheck({
      id: 'upgrade-transactions',
      title: localize('upgrade transactions', '升级事务'),
      status: 'fail',
      detail: localize(`Unable to inspect upgrade transactions: ${String(error)}`, `无法检查升级事务：${String(error)}`),
      fix: localize('Check filesystem permissions for .repoctl/transactions, then run repo doctor again.', '请检查 .repoctl/transactions 的文件系统权限，然后重新运行 repo doctor。'),
    }))
  }

  return checks
}

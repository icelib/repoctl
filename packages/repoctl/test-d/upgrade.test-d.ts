import type { UpgradeDiff, UpgradeLockInspection, UpgradePlan } from 'repoctl'
import { inspectUpgradeLock, resolveUpgradePlan } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<UpgradePlan>>(resolveUpgradePlan({ cwd: '.', core: true }))
expectType<Promise<UpgradeLockInspection>>(inspectUpgradeLock('.'))
const diff: UpgradeDiff = { kind: 'binary', beforeBytes: 0, afterBytes: 1, beforeHash: null, afterHash: 'hash', addedLines: 0, deletedLines: 0, truncated: false }
void diff

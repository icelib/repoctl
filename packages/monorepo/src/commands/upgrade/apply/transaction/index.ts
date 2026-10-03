import type { UpgradeFilePlan } from '../../../../types/upgrade'
import { writeFileTransaction } from '../../../../core/file-transaction'

/** Preserve reviewed migration recovery IDs at the shared transaction boundary. */
export async function writeUpgradeTransaction(root: string, files: UpgradeFilePlan[], id?: string) {
  await writeFileTransaction(root, files, id === undefined ? {} : { id })
}

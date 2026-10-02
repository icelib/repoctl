import type { DoctorCheck, DoctorStatus } from '../types'
import type { DoctorManifest } from './types'
import { localize } from '../../../i18n'

export function finding(entry: DoctorManifest, id: string, field: string, status: DoctorStatus, english: string, chinese: string): DoctorCheck {
  return {
    id: `manifest-${id}`,
    path: entry.path,
    field,
    title: `${entry.path} — ${field}`,
    status,
    detail: localize(english, chinese),
  }
}

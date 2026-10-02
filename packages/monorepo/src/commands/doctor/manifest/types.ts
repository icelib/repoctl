export interface DoctorManifest {
  directory: string
  path: string
  data?: Record<string, unknown>
  error?: 'unreadable' | 'invalid_structure' | 'multiple_manifests'
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

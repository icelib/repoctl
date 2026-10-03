/** C12 defaults drop nulls. Reject them in original layers before merging hides mistakes. */
export function validateDoctorConfiguration(value: unknown, field = 'commands.doctor') {
  if (value === null) {
    throw new Error(`${field} cannot be null; omit optional settings instead.`)
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      validateDoctorConfiguration(child, `${field}.${key}`)
    }
  }
}

import type { Schema } from '../config/validation/schema'
import { valid } from 'semver'
import validatePackageName from 'validate-npm-package-name'
import { array, object } from '../config/validation/schema'

export const presetPackageName: Schema = {
  expected: 'npm package name',
  accepts: value => typeof value === 'string' && validatePackageName(value).validForNewPackages,
}

export const presetVersion: Schema = {
  expected: 'exact semantic version',
  accepts: value => typeof value === 'string' && valid(value) === value,
}

export const presetReferenceSchema = object({ packageName: presetPackageName, version: presetVersion }, ['packageName', 'version'])
export const presetReferencesSchema = array(presetReferenceSchema)

import type { DoctorCheck } from '../types'
import type { DoctorManifest } from './types'
import path from 'node:path'
import { valid } from 'semver'
import validateName from 'validate-npm-package-name'
import { finding } from './finding'
import { record } from './types'

export function metadataChecks(entry: DoctorManifest, workspaceDir: string, selected?: ReadonlySet<string>): DoctorCheck[] {
  const includes = (id: string) => !selected || selected.has(`manifest-${id}`)
  const data = entry.data!
  const checks: DoctorCheck[] = []
  const add = (id: string, field: string, status: DoctorCheck['status'], en: string, zh: string) => {
    if (includes(id)) {
      checks.push(finding(entry, id, field, status, en, zh))
    }
  }
  if (['name-missing', 'name-invalid', 'name-legacy'].some(includes)) {
    if (typeof data['name'] !== 'string' || !data['name']) {
      add('name-missing', 'name', 'fail', 'Declare a nonempty package name.', '请声明非空包名。')
    }
    else {
      const name = validateName(data['name'])
      if (!name.validForOldPackages) {
        add('name-invalid', 'name', 'fail', 'The package name is not a valid npm package name.', '包名不符合 npm 包名规则。')
      }
      else if (!name.validForNewPackages && data['private'] !== true) {
        add('name-legacy', 'name', 'warn', 'This legacy package name is not accepted for new npm packages.', '此旧包名不满足新 npm 包的命名要求。')
      }
    }
  }
  if (includes('private-invalid') && data['private'] !== undefined && typeof data['private'] !== 'boolean') {
    add('private-invalid', 'private', 'fail', 'private must be a boolean; only true prevents publication.', 'private 必须为布尔值；只有 true 会阻止发布。')
  }
  if (includes('version-invalid') && data['version'] !== undefined && (typeof data['version'] !== 'string' || !valid(data['version']))) {
    add('version-invalid', 'version', 'fail', 'version must be a valid semver version.', 'version 必须为有效 semver 版本。')
  }
  if (data['private'] === true) {
    return checks
  }
  if (includes('version-missing') && data['version'] === undefined) {
    add('version-missing', 'version', 'warn', 'A publishable package needs a version; use private: true for an unpublished application.', '可发布包需要 version；不发布的应用应声明 private: true。')
  }
  if (includes('license') && (typeof data['license'] !== 'string' || !data['license'].trim())) {
    add('license', 'license', 'warn', 'Declare the package license or an explicit unlicensed policy before publishing.', '发布前请声明包的 license 或明确的不授权策略。')
  }
  const repository = record(data['repository'])
  if (includes('repository')) {
    if (!data['repository']) {
      add('repository', 'repository', 'warn', 'Repository metadata is recommended for a publishable package.', '建议为可发布包声明 repository 元信息。')
    }
    else if (typeof data['repository'] !== 'string' && (!repository || typeof repository['url'] !== 'string')) {
      add('repository', 'repository', 'warn', 'repository must be a URL string or an object with a URL.', 'repository 应为 URL 字符串或包含 URL 的对象。')
    }
  }
  const directory = repository?.['directory']
  if (includes('repository-directory') && directory !== undefined && (typeof directory !== 'string' || path.isAbsolute(directory) || directory.includes('\\') || path.resolve(workspaceDir, directory) !== entry.directory)) {
    add('repository-directory', 'repository.directory', 'warn', 'repository.directory should identify this package relative to the repository root; review external repository layouts manually.', 'repository.directory 应指向相对仓库根目录的当前包；外部仓库布局请人工核查。')
  }
  const publish = record(data['publishConfig'])
  if (includes('publish-config') && data['publishConfig'] !== undefined && !publish) {
    add('publish-config', 'publishConfig', 'warn', 'publishConfig must be an object.', 'publishConfig 应为对象。')
  }
  if (includes('publish-access') && publish?.['access'] !== undefined && !['public', 'restricted'].includes(publish['access'] as string)) {
    add('publish-access', 'publishConfig.access', 'warn', 'publishConfig.access must be public or restricted.', 'publishConfig.access 应为 public 或 restricted。')
  }
  if (includes('publish-registry') && publish?.['registry'] !== undefined) {
    try {
      const url = typeof publish['registry'] === 'string' ? new URL(publish['registry']) : null
      if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('invalid registry')
      }
    }
    catch {
      add('publish-registry', 'publishConfig.registry', 'warn', 'Use an HTTP(S) registry URL without embedded credentials.', '请使用不含内嵌凭据的 HTTP(S) registry URL。')
    }
  }
  return checks
}

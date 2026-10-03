import { dependencyTypes } from './commands'
import { array, choices, names, nonempty, object, string } from './schema'

export const admissionSchema = object({
  rules: array(object({ id: nonempty, workspaces: names, dependencies: names, effect: choices('allow', 'deny'), sections: dependencyTypes, reason: nonempty, alternative: string, severity: choices('warn', 'fail') }, ['id', 'workspaces', 'dependencies', 'effect', 'sections', 'reason'])),
  exceptions: array(object({ rule: nonempty, workspace: nonempty, dependency: nonempty, section: choices('dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'), reason: nonempty, expiresOn: string }, ['rule', 'workspace', 'dependency', 'section', 'reason'])),
}, ['rules'])

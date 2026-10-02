import type { GetWorkspacePackagesOptions, WorkspaceData, WorkspacePackageWithJsonPath } from '..'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'
import { clearWorkspaceCache, getWorkspaceData, getWorkspacePackages } from '..'

const options: GetWorkspacePackagesOptions = {
  ignoreRootPackage: false,
  ignorePrivatePackage: false,
  patterns: ['services/**', '!services/archived/**'],
}

expectAssignable<GetWorkspacePackagesOptions>({})
expectType<boolean | undefined>(options.ignoreRootPackage)
expectType<boolean | undefined>(options.ignorePrivatePackage)
expectType<string[] | undefined>(options.patterns)
expectType<Promise<WorkspacePackageWithJsonPath[]>>(getWorkspacePackages('.'))
expectType<Promise<WorkspacePackageWithJsonPath[]>>(getWorkspacePackages('.', options))
expectType<Promise<WorkspaceData>>(getWorkspaceData('.'))
expectType<Promise<WorkspaceData>>(getWorkspaceData('.', options))
expectType<void>(clearWorkspaceCache())
expectNotAssignable<GetWorkspacePackagesOptions>({ ignoreRootPackage: 'false' })
expectNotAssignable<GetWorkspacePackagesOptions>({ patterns: 'packages/*' })

declare const workspace: WorkspaceData
expectType<string>(workspace.cwd)
expectType<string>(workspace.workspaceDir)
expectType<WorkspacePackageWithJsonPath[]>(workspace.packages)

declare const workspacePackage: WorkspacePackageWithJsonPath
expectType<string>(workspacePackage.rootDir)
expectType<string>(workspacePackage.rootDirRealPath)
expectType<string>(workspacePackage.pkgJsonPath)
expectType<string | undefined>(workspacePackage.manifest.name)
expectType<boolean | undefined>(workspacePackage.manifest.private)

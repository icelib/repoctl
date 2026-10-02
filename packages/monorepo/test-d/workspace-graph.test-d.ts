import type { WorkspaceDependencyType, WorkspaceGraph, WorkspaceGraphNode, WorkspaceGraphOptions, WorkspaceImpactResult, WorkspaceWhyResult } from '..'
import { expectAssignable, expectError, expectType } from 'tsd'
import { filterWorkspaceGraph, getWorkspaceGraph, getWorkspaceImpact, resolveWorkspaceGraphNode, whyWorkspaceDependency } from '..'

expectType<Promise<WorkspaceGraph>>(getWorkspaceGraph('.'))
expectAssignable<WorkspaceGraphOptions>({ ignorePrivatePackage: false, packages: ['example'], dependencyTypes: ['peerDependencies'] })
expectAssignable<WorkspaceDependencyType>('optionalDependencies')
expectError(getWorkspaceGraph('.', { dependencyTypes: ['invalid'] }))
const graph: WorkspaceGraph = { schemaVersion: 1, cwd: '.', workspaceDir: '.', nodes: [], edges: [], diagnostics: [], dependencyTypes: [] }
expectType<WorkspaceGraph>(filterWorkspaceGraph(graph, { packages: ['example'] }))
expectType<WorkspaceGraphNode>(resolveWorkspaceGraphNode(graph, 'example'))
expectType<WorkspaceWhyResult>(whyWorkspaceDependency(graph, 'from', 'to'))
expectType<WorkspaceImpactResult>(getWorkspaceImpact(graph, 'example', { direct: true }))

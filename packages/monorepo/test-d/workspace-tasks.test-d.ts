import type { WorkspaceLocation, WorkspaceTaskCatalog } from '..'
import { expectType } from 'tsd'
import { getWorkspaceTaskCatalog, locateWorkspace } from '..'

expectType<Promise<WorkspaceTaskCatalog>>(getWorkspaceTaskCatalog('.', { script: 'test' }))
expectType<Promise<WorkspaceLocation>>(locateWorkspace('.', '@scope/app'))

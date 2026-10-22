import type { WorkspaceLocation, WorkspaceTaskCatalog } from '@icebreakers/monorepo'
import { getWorkspaceTaskCatalog, locateWorkspace } from '@icebreakers/monorepo'
import { expectType } from 'tsd'

expectType<Promise<WorkspaceTaskCatalog>>(getWorkspaceTaskCatalog('.', { script: 'test' }))
expectType<Promise<WorkspaceLocation>>(locateWorkspace('.', '@scope/app'))

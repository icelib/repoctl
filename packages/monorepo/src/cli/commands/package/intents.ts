import type { CreateNewProjectOptions } from '../../../commands'
import { localize } from '../../../i18n'

export type CreateIntent
  = 'library'
    | 'web-app'
    | 'api-service'
    | 'docs-site'
    | 'cli-tool'

export interface CreateIntentChoice {
  value: CreateIntent
  name: string
  description: string
  defaultTemplate: NonNullable<CreateNewProjectOptions['type']>
}

export const createIntentChoices: CreateIntentChoice[] = [
  {
    value: 'library',
    name: 'Library',
    description: localize('Create a publishable library package', '创建一个可发布的库包'),
    defaultTemplate: 'tsdown',
  },
  {
    value: 'web-app',
    name: 'Web App',
    description: localize('Create a Vue or React web application', '创建 Vue 或 React Web 应用'),
    defaultTemplate: 'vue-hono',
  },
  {
    value: 'api-service',
    name: 'API Service',
    description: localize('Create a Hono API service', '创建一个 Hono API 服务'),
    defaultTemplate: 'hono-server',
  },
  {
    value: 'docs-site',
    name: 'Docs Site',
    description: localize('Create a documentation site', '创建一个文档站点'),
    defaultTemplate: 'nimbus',
  },
  {
    value: 'cli-tool',
    name: 'CLI Tool',
    description: localize('Create a command-line tool', '创建一个命令行工具'),
    defaultTemplate: 'cli',
  },
] as const

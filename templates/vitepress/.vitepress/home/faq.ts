import type { DocsLocale } from '../navigation/routes'

export const faqContent = {
  zh: [
    ['repoctl 是什么？', 'repoctl 是面向 pnpm 与 Turborepo monorepo 的任务型 CLI，用于初始化、诊断、创建、校验和发布工作区。'],
    ['如何安装 repoctl？', '在项目中运行 pnpm add -D repoctl，然后使用 pnpm exec repo init 和 pnpm exec repo doctor。'],
    ['repoctl 与 pnpm、Turborepo 是什么关系？', 'pnpm 和 Turborepo 负责包管理与任务编排，repoctl 负责把团队约定、检查和日常操作组织成可复用任务。'],
    ['repo doctor 与 repo check 有什么区别？', 'repo doctor 诊断仓库健康状况，repo check 规划并执行 lint、类型、构建和测试校验。'],
  ],
  en: [
    ['What is repoctl?', 'repoctl is a task-first CLI for initializing, diagnosing, creating, checking, and releasing pnpm and Turborepo monorepos.'],
    ['How do I install repoctl?', 'Run pnpm add -D repoctl, then use pnpm exec repo init and pnpm exec repo doctor.'],
    ['How does repoctl relate to pnpm and Turborepo?', 'pnpm and Turborepo provide package management and task orchestration; repoctl turns repository conventions and checks into reusable tasks.'],
    ['What is the difference between repo doctor and repo check?', 'repo doctor diagnoses repository health, while repo check plans and runs lint, type, build, and test checks.'],
  ],
} satisfies Record<DocsLocale, [string, string][]>

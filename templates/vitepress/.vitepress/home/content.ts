import type { DocsLocale } from '../navigation/routes'
import type { HomeContent } from './types'

const english = {
  hero: {
    label: 'repoctl documentation',
    title: 'What does your repository need next?',
    description: 'Initialize, diagnose, create, check, and release pnpm or Turborepo workspaces from one task-first CLI.',
    primaryAction: { label: 'Get started', href: '/start/' },
    secondaryAction: { label: 'Browse commands', href: '/reference/commands' },
    imageAlt: 'A real repoctl doctor report showing repository checks and findings',
  },
  tasks: {
    title: 'Choose a task',
    description: 'Pick the result you need. Each path begins with the smallest safe command.',
    items: [
      { title: 'Start a new repository', body: 'Set up the shared conventions before you add projects.', command: 'repo init', link: { label: 'Start here', href: '/start/' } },
      { title: 'Adopt an existing repository', body: 'Inspect current choices and preview changes before writing.', command: 'repo doctor', link: { label: 'Plan adoption', href: '/tasks/adopt-existing' } },
      { title: 'Create a package or app', body: 'Use a known template so names, scripts, and boundaries stay consistent.', command: 'repo new', link: { label: 'Create a project', href: '/tasks/create-project' } },
      { title: 'Run a repository check', body: 'Plan lint, types, builds, and tests before a commit or CI run.', command: 'repo check', link: { label: 'Run checks', href: '/tasks/checks' } },
    ],
  },
  firstRun: {
    title: 'Three commands to a useful baseline',
    description: 'Install repoctl, initialize its managed defaults, then diagnose the workspace.',
    steps: [
      { title: 'Install', command: 'pnpm add -D repoctl', body: 'Keep repoctl with the repository so teammates and CI use the same version.' },
      { title: 'Initialize', command: 'pnpm exec repo init', body: 'Review the file plan before adding managed scripts and configuration.' },
      { title: 'Diagnose', command: 'pnpm exec repo doctor', body: 'Use the first blocker as your next task. Run the diagnosis again after each fix.' },
    ],
  },
  evidence: {
    title: 'See the plan before the repository changes',
    description: 'Preview work, redact local paths, and keep the exact command sequence with the report.',
    code: 'pnpm exec repo new docs --template nimbus --dry-run\npnpm exec repo check --dry-run\npnpm exec repo doctor --markdown --redact',
    link: { label: 'See how diagnosis works', href: '/start/diagnose' },
  },
  layers: {
    title: 'Continue with the decision in front of you',
    description: 'Move from the current task to the level of detail you need.',
    items: [
      { title: 'Daily tasks', body: 'Adoption, project creation, checks, CI, reports, releases, and troubleshooting.', link: { label: 'Open tasks', href: '/tasks/' } },
      { title: 'Understand the system', body: 'Monorepo boundaries, modern npm packages, templates, and the tools underneath.', link: { label: 'Open Learn', href: '/learn/' } },
      { title: 'Look up exact behavior', body: 'Commands, configuration, output formats, aliases, and execution details.', link: { label: 'Open Reference', href: '/reference/' } },
    ],
  },
} satisfies HomeContent

const chinese = {
  hero: {
    label: 'repoctl 文档',
    title: '仓库下一步，该做什么？',
    description: '用一个任务型 CLI 初始化、诊断、创建、校验与发布 pnpm 和 Turborepo 工作区。',
    primaryAction: { label: '开始使用', href: '/zh/start/' },
    secondaryAction: { label: '查看命令', href: '/zh/reference/commands' },
    imageAlt: '真实的 repoctl doctor 报告，展示仓库检查结果与发现项',
  },
  tasks: {
    title: '选择一项任务',
    description: '选择你要得到的结果，每条路径都从最小的安全命令开始。',
    items: [
      { title: '新建仓库', body: '先建立共享约定，再开始添加项目。', command: 'repo init', link: { label: '从这里开始', href: '/zh/start/' } },
      { title: '接入已有仓库', body: '先检查当前决策，预览变化后再写入。', command: 'repo doctor', link: { label: '制定接入计划', href: '/zh/tasks/adopt-existing' } },
      { title: '创建包或应用', body: '使用已知模板，让名称、脚本和边界保持一致。', command: 'repo new', link: { label: '创建项目', href: '/zh/tasks/create-project' } },
      { title: '运行仓库校验', body: '提交或运行 CI 前，先规划 lint、类型、构建和测试。', command: 'repo check', link: { label: '运行校验', href: '/zh/tasks/checks' } },
    ],
  },
  firstRun: {
    title: '三条命令，建立可用基线',
    description: '安装 repoctl，初始化受管默认值，再诊断当前工作区。',
    steps: [
      { title: '安装', command: 'pnpm add -D repoctl', body: '把 repoctl 保存在仓库中，让成员和 CI 使用相同版本。' },
      { title: '初始化', command: 'pnpm exec repo init', body: '写入受管脚本和配置前，先检查文件计划。' },
      { title: '诊断', command: 'pnpm exec repo doctor', body: '把第一个阻塞项作为下一项任务，修复后再次运行诊断。' },
    ],
  },
  evidence: {
    title: '仓库变化前，先看清执行计划',
    description: '预览操作、脱敏本地路径，并让报告保留准确的命令顺序。',
    code: 'pnpm exec repo new docs --template nimbus --dry-run\npnpm exec repo check --dry-run\npnpm exec repo doctor --markdown --redact',
    link: { label: '了解诊断流程', href: '/zh/start/diagnose' },
  },
  layers: {
    title: '沿着当前决策继续深入',
    description: '从手头任务出发，只进入你现在需要的细节层级。',
    items: [
      { title: '日常任务', body: '接入、创建项目、校验、CI、报告、发布和排障。', link: { label: '打开任务', href: '/zh/tasks/' } },
      { title: '理解系统', body: 'Monorepo 边界、现代 npm 包、模板和底层工具。', link: { label: '打开理解', href: '/zh/learn/' } },
      { title: '查找准确行为', body: '命令、配置、输出格式、别名和执行细节。', link: { label: '打开参考', href: '/zh/reference/' } },
    ],
  },
} satisfies HomeContent

export const homeContent: Record<DocsLocale, HomeContent> = { en: english, zh: chinese }

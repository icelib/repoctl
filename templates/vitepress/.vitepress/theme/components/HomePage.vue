<script setup lang="ts">
import type { DocsLocale } from '../../navigation/routes'
import { computed } from 'vue'
import { homeContent } from '../../home/content'

const props = defineProps<{ locale: DocsLocale }>()
const content = computed(() => homeContent[props.locale])
const faq = computed(() => props.locale === 'zh'
  ? [
      ['repoctl 是什么？', 'repoctl 是面向 pnpm 与 Turborepo monorepo 的任务型 CLI，用于初始化、诊断、创建、校验和发布工作区。'],
      ['如何安装 repoctl？', '在项目中运行 pnpm add -D repoctl，然后使用 pnpm exec repo init 和 pnpm exec repo doctor。'],
      ['repoctl 与 pnpm、Turborepo 是什么关系？', 'pnpm 和 Turborepo 负责包管理与任务编排，repoctl 负责把团队约定、检查和日常操作组织成可复用任务。'],
      ['repo doctor 与 repo check 有什么区别？', 'repo doctor 诊断仓库健康状况，repo check 规划并执行 lint、类型、构建和测试校验。'],
    ]
  : [
      ['What is repoctl?', 'repoctl is a task-first CLI for initializing, diagnosing, creating, checking, and releasing pnpm and Turborepo monorepos.'],
      ['How do I install repoctl?', 'Run pnpm add -D repoctl, then use pnpm exec repo init and pnpm exec repo doctor.'],
      ['How does repoctl relate to pnpm and Turborepo?', 'pnpm and Turborepo provide package management and task orchestration; repoctl turns repository conventions and checks into reusable tasks.'],
      ['What is the difference between repo doctor and repo check?', 'repo doctor diagnoses repository health, while repo check plans and runs lint, type, build, and test checks.'],
    ])
</script>

<template>
  <main class="repoctl-home">
    <section class="repoctl-home__hero" aria-labelledby="repoctl-home-title">
      <div class="repoctl-home__hero-copy">
        <p class="repoctl-home__eyebrow">
          {{ content.hero.label }}
        </p>
        <h1 id="repoctl-home-title">
          {{ content.hero.title }}
        </h1>
        <p class="repoctl-home__lede">
          {{ content.hero.description }}
        </p>
        <div class="repoctl-home__hero-actions">
          <a class="repoctl-home__button repoctl-home__button--primary" :href="content.hero.primaryAction.href">
            {{ content.hero.primaryAction.label }}
          </a>
          <a class="repoctl-home__button repoctl-home__button--secondary" :href="content.hero.secondaryAction.href">
            {{ content.hero.secondaryAction.label }}
          </a>
        </div>
      </div>
      <figure class="repoctl-home__hero-visual">
        <img
          src="/repoctl-doctor.png"
          :alt="content.hero.imageAlt"
          width="1440"
          height="990"
          decoding="async"
          fetchpriority="high"
        >
      </figure>
    </section>

    <section class="repoctl-home__section repoctl-home__tasks" aria-labelledby="repoctl-tasks-title">
      <div class="repoctl-home__section-heading">
        <h2 id="repoctl-tasks-title">
          {{ content.tasks.title }}
        </h2>
        <p>{{ content.tasks.description }}</p>
      </div>
      <div class="repoctl-home__task-list">
        <a v-for="task in content.tasks.items" :key="task.link.href" class="repoctl-home__task" :href="task.link.href">
          <code>{{ task.command }}</code>
          <div class="repoctl-home__task-copy">
            <h3>{{ task.title }}</h3>
            <p>{{ task.body }}</p>
          </div>
          <span class="repoctl-home__task-link">{{ task.link.label }} <span aria-hidden="true">-&gt;</span></span>
        </a>
      </div>
    </section>

    <section class="repoctl-home__section repoctl-home__first-run" aria-labelledby="repoctl-first-run-title">
      <div class="repoctl-home__section-heading">
        <h2 id="repoctl-first-run-title">
          {{ content.firstRun.title }}
        </h2>
        <p>{{ content.firstRun.description }}</p>
      </div>
      <ol class="repoctl-home__steps">
        <li v-for="(step, index) in content.firstRun.steps" :key="step.command">
          <span class="repoctl-home__step-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <code>{{ step.command }}</code>
            <p>{{ step.body }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="repoctl-home__section repoctl-home__evidence" aria-labelledby="repoctl-evidence-title">
      <div class="repoctl-home__evidence-copy">
        <h2 id="repoctl-evidence-title">
          {{ content.evidence.title }}
        </h2>
        <p>{{ content.evidence.description }}</p>
        <a class="repoctl-home__text-link" :href="content.evidence.link.href">{{ content.evidence.link.label }} <span aria-hidden="true">-&gt;</span></a>
      </div>
      <div class="repoctl-home__workflow">
        <span class="repoctl-home__workflow-prompt" aria-hidden="true">$</span>
        <pre><code>{{ content.evidence.code }}</code></pre>
      </div>
    </section>

    <section class="repoctl-home__section repoctl-home__layers" aria-labelledby="repoctl-layers-title">
      <div class="repoctl-home__section-heading">
        <h2 id="repoctl-layers-title">
          {{ content.layers.title }}
        </h2>
        <p>{{ content.layers.description }}</p>
      </div>
      <div class="repoctl-home__layer-list">
        <a v-for="item in content.layers.items" :key="item.link.href" class="repoctl-home__layer" :href="item.link.href">
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
          <span class="repoctl-home__text-link">{{ item.link.label }} <span aria-hidden="true">-&gt;</span></span>
        </a>
      </div>
    </section>
    <section class="repoctl-home__section repoctl-home__faq" aria-labelledby="repoctl-faq-title">
      <h2 id="repoctl-faq-title">
        {{ props.locale === 'zh' ? '常见问题' : 'Frequently asked questions' }}
      </h2>
      <details v-for="item in faq" :key="item[0]">
        <summary>{{ item[0] }}</summary>
        <p>{{ item[1] }}</p>
      </details>
      <script type="application/ld+json">
        {{ JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', "mainEntity": faq.map(item => ({ '@type': 'Question', "name": item[0], "acceptedAnswer": { '@type': 'Answer', "text": item[1] } })) }) }}
      </script>
    </section>
  </main>
</template>

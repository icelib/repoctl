<script setup lang="ts">
import type { DocsThemeConfig } from '../deployment'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { computed } from 'vue'
import { stableOrigin } from '../deployment'

const { Layout } = DefaultTheme
const { lang, theme } = useData<DocsThemeConfig>()
const notFoundTitle = computed(() => lang.value === 'zh-CN' ? '页面不存在' : 'Page not found')
const notFoundBody = computed(() => lang.value === 'zh-CN'
  ? '这个地址不属于新的文档结构。请从开始、任务或参考章节继续。'
  : 'This address is not part of the new documentation structure. Continue with Start, Tasks, or Reference.')
</script>

<template>
  <Layout :class="{ 'repoctl-preview-layout': theme.docsPreview }">
    <template #layout-top>
      <aside v-if="theme.docsPreview" class="repoctl-preview-banner" aria-label="Documentation preview">
        <template v-if="lang === 'zh-CN'">
          开发版文档，包含尚未发布的功能。
          <a :href="`${stableOrigin}/zh/`">查看正式版文档</a>
        </template>
        <template v-else>
          Development documentation — includes unreleased changes.
          <a :href="stableOrigin">Read the stable documentation</a>
        </template>
      </aside>
    </template>
    <template #not-found>
      <main class="repoctl-not-found">
        <p class="repoctl-not-found__code">
          404
        </p>
        <h1>{{ notFoundTitle }}</h1>
        <p>{{ notFoundBody }}</p>
        <a href="/start/">{{ lang === 'zh-CN' ? '返回开始' : 'Back to Start' }}</a>
      </main>
    </template>
  </Layout>
</template>

<style scoped>
.repoctl-preview-layout {
  --vp-layout-top-height: 80px;

  padding-top: var(--vp-layout-top-height);
}

.repoctl-preview-banner {
  position: fixed;
  inset: 0 0 auto;
  z-index: var(--vp-z-index-layout-top);
  display: flex;
  flex-wrap: wrap;
  column-gap: 6px;
  align-items: center;
  justify-content: center;
  height: var(--vp-layout-top-height);
  padding: 10px 24px;
  font-size: 14px;
  line-height: 1.5;
  color: #332b00;
  text-align: center;
  background: #fff4ce;
}

.repoctl-preview-banner a {
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

@media (min-width: 640px) {
  .repoctl-preview-layout {
    --vp-layout-top-height: 44px;
  }
}

@media (max-width: 959.98px) {
  /* stylelint-disable-next-line selector-class-pattern -- VitePress owns the navigation class. */
  .repoctl-preview-layout :deep(.VPNav) {
    top: 0;
  }
}
</style>

<script setup lang="ts">
import { useData } from 'vitepress'
import { computed, onMounted, ref, watch } from 'vue'
import { renderMermaid, resolveMermaidTheme } from './render'

const props = defineProps<{ graph: string }>()
const { frontmatter, isDark, lang } = useData()
const mounted = ref(false)
const diagram = ref<HTMLElement>()
const error = ref('')
const loading = ref(true)
const theme = computed(() => resolveMermaidTheme(isDark.value, frontmatter.value.mermaidTheme))

onMounted(() => {
  mounted.value = true
})

watch([mounted, () => props.graph, theme], async ([ready, graph, selectedTheme], _, onCleanup) => {
  if (!ready || !diagram.value) {
    return
  }
  let active = true
  onCleanup(() => {
    active = false
  })
  error.value = ''
  loading.value = true
  diagram.value.replaceChildren()
  try {
    const result = await renderMermaid(decodeURIComponent(graph), selectedTheme)
    if (active && diagram.value) {
      // Mermaid sanitizes SVG using its strict security mode.
      diagram.value.innerHTML = result.svg
      result.bindFunctions?.(diagram.value)
    }
  }
  catch (cause) {
    if (active) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }
  finally {
    if (active) {
      loading.value = false
    }
  }
}, { flush: 'post' })
</script>

<template>
  <div class="mermaid" :aria-busy="loading">
    <p v-if="loading" role="status">
      {{ lang === 'zh-CN' ? '正在绘制图表…' : 'Rendering diagram…' }}
    </p>
    <p v-if="error" role="alert">
      {{ lang === 'zh-CN' ? '图表绘制失败：' : 'Unable to render diagram: ' }}{{ error }}
    </p>
    <div ref="diagram" class="mermaid__diagram" />
  </div>
</template>

<style scoped>
.mermaid__diagram {
  overflow-x: auto;
}
</style>

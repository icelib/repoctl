import type { EnhanceAppContext, Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import Mermaid from '../mermaid/mermaid.vue'
import HomePage from './components/HomePage.vue'
import Layout from './Layout.vue'
import './tailwind.css'
import './home/index.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }: EnhanceAppContext) {
    app.component('HomePage', HomePage)
    app.component('Mermaid', Mermaid)
  },
} satisfies Theme

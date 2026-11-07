import { defineConfig } from 'tsdown'

export default defineConfig({
  checks: {
    pluginTimings: false,
  },
  entry: {
    index: 'src/index.ts',
    // 保留独立 worker 入口，运行时从编译后模块所在目录定位 worker.js。
    worker: 'src/worker.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
})

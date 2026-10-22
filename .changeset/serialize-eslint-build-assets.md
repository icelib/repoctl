---
"@icebreakers/eslint-config": patch
---

修复多格式构建并发写入共享许可证时，在 Windows 上可能触发的文件占用错误。由构建器统一复制许可证，保留单格式构建、重复刷新和复制失败报告。

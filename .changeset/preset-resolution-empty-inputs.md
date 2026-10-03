---
"@icebreakers/monorepo": patch
"repoctl": patch
---

组织预设先验证引用，再查找工作区；空引用和非法输入不再访问文件系统，避免未启用预设的配置读取触发无关路径解析。

---
'@icebreakers/monorepo': patch
---

发布失败时保留经过凭证脱敏的命令输出、退出码和终止信号，让 Nightly、PR snapshot 与 bootstrap 的 JSON 报告也能定位 npm 上传失败原因。

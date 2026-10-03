---
"@icebreakers/monorepo": patch
"repoctl": patch
---

使用 bigint 保留文件事务的完整设备与 inode 身份，避免大文件 ID 的数值舍入使失败清理误删其他写入者替换的目录、备份或输出文件。

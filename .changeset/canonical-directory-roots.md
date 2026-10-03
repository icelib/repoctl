---
"@icebreakers/monorepo": patch
---

Preserve Windows drive roots returned by realpath and stop canonical directory traversal when the filesystem root is unavailable instead of recursing indefinitely.

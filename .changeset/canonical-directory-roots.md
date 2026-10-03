---
"@icebreakers/monorepo": patch
---

Preserve Windows drive roots returned by realpath and stop canonical directory traversal at unavailable filesystem or UNC share roots instead of recursing indefinitely or falling back to a local volume.

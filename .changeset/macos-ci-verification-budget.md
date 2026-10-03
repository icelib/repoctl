---
"@icebreakers/monorepo-templates": patch
---

Allow macOS CI jobs 35 minutes to finish the complete validation matrix and cache cleanup. A macOS Node 22 job completed its 17m27s test step at 24m35s elapsed, then the 25-minute job limit canceled the following packaged Worker check. Preserve Linux and Windows budgets, every verification step, and individual test timeouts.

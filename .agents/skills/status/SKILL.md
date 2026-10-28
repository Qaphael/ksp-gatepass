---
name: status
description: Resync docs/TASKS.md and the status section of AGENTS.md with the real code. Use only when the user explicitly invokes $status.
---

Compare `docs/TASKS.md` with what actually exists in the repo (schema, routes, tests). Tick only items that are implemented and covered by passing tests. Untick anything that is not. Update "Current implementation status" in `AGENTS.md` and name the next task. Do not change source code.

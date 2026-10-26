---
description: Run lint, typecheck and tests, then summarize failures
---
Current git status:
!`git status --short`

Run `pnpm lint`, `pnpm typecheck` and `pnpm test`. If they pass, say so with counts. If any fail, show the first real error for each, find the root cause, and propose a fix without weakening any test or rule. Do not claim success without running the commands.

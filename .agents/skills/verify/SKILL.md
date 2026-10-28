---
name: verify
description: Run lint, typecheck and tests for this project and summarize the results. Use only when the user explicitly invokes $verify.
---

Run `git status --short` and show it.

Find the project's lint, typecheck and test commands in `AGENTS.md` or `package.json` and run them. If all pass, report counts. If any fail, show the first real error for each, find the root cause and propose a fix without weakening any test or rule. Never claim success without running the commands.

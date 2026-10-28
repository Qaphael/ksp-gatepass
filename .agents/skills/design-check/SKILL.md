---
name: design-check
description: Read-only design review of the uncommitted UI changes against docs/DESIGN.md. Use only when the user explicitly invokes $design-check.
---

Do not modify any files. Read `docs/DESIGN.md`, then run `git diff --stat` and `git diff`.

Review only the UI and styling changes against the spec and its section 10 checklist. Report Blocking, Should fix, Nice to have. Check: mobile-first layout at 360 px, tap target and font sizes, contrast pairings (especially gold on light backgrounds), colour-only states, missing loading/empty/error states, horizontal overflow, hover-only interactions, safe-area handling, hard-coded colours instead of tokens, result screens that could show success styling on a failure.

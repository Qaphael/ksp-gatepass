---
description: Read-only design review of the current changes against docs/DESIGN.md
agent: reviewer
subtask: true
---
Design spec: @docs/DESIGN.md

Changes under review:
!`git diff --stat`
!`git diff`

Review only the UI and styling changes against the spec and its section 10 checklist. Report Blocking, Should fix, Nice to have. Check: mobile-first layout at 360 px, tap target and font sizes, contrast pairings (especially gold on light backgrounds), colour-only states, missing loading/empty/error states, horizontal overflow, hover-only interactions, safe-area handling, hard-coded colours instead of tokens, result screens that could show success styling on a failure. Do not modify files.

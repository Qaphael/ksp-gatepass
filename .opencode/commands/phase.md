---
description: Plan and implement a delivery phase (usage: /phase 1)
---
Work on Phase $ARGUMENTS of the delivery plan.

1. Read `docs/TASKS.md` for the phase checklist and `AGENTS.md` for rules.
2. Read only the PRD sections that phase needs (see the section map in `AGENTS.md`).
3. Write a short implementation plan (files, schema changes, risks) and show it before coding. If anything is ambiguous or touches an open decision, ask first.
4. Implement in small steps: schema and constraints, then domain services, then API, then UI.
5. After each step run `pnpm typecheck` and the relevant tests.
6. Tick items in `docs/TASKS.md` only when implemented and tested, and update the status section in `AGENTS.md`.
7. Finish with: what was done, test results, and unresolved issues.

Do not start the next phase.

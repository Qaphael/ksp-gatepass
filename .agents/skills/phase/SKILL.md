---
name: phase
description: Plan then implement one delivery phase of this project. Use only when the user explicitly invokes $phase with a phase number, for example $phase 1.
---

The phase number is the number the user typed after `$phase`. If none was given, ask for it and stop.

Work on that phase.

1. Read `AGENTS.md`, `docs/business-rules.md` and the phase checklist in `docs/TASKS.md`.
2. Read only the PRD sections this phase needs (use the section map in `AGENTS.md`).
3. Present a short plan: files to create or change, schema or interface changes, dependency versions (checked against current docs), risks, and open questions. Then stop and wait for approval.
4. After approval, implement in small steps: data layer and constraints first, then domain logic, then interfaces, then UI.
5. After each step run typecheck and the relevant tests. Fix root causes. Never weaken a test.
6. Tick items in `docs/TASKS.md` only when implemented and tested. Update the status section in `AGENTS.md`.
7. Finish with: what was done, real test output, unresolved issues, and the next step.

Do not start the next phase.

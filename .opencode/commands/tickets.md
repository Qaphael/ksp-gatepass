---
description: Run one numbered prompt from the ticket v2 prompt pack (usage: /tickets 2)
---
Prompt number from my message: $ARGUMENTS. If empty, ask which prompt and stop.

Read `docs/PRD-ADDENDUM-TICKETS.md` and `docs/TICKET-PROMPTS.md`. If either is missing, tell me and stop.

Execute **Prompt T<number>** from the prompt pack exactly as written. Present your plan first and wait for approval before changing files, as the prompt says. Do not start any other prompt. Do not weaken any existing rule in `docs/business-rules.md`.

When the prompt's work is finished and verified, tick "Prompt T<number>" in a `## Tickets v2` section of `docs/TASKS.md` (create the section, with a line per prompt T0 to T9, if it does not exist).

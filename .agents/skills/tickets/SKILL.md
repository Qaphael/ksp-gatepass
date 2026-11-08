---
name: tickets
description: Run one numbered prompt from the ticket v2 prompt pack (docs/TICKET-PROMPTS.md). Use only when the user explicitly invokes $tickets with a number, for example $tickets 2.
---

The prompt number is the number the user typed after `$tickets`. If none was given, ask which prompt and stop.

Read `docs/PRD-ADDENDUM-TICKETS.md` and `docs/TICKET-PROMPTS.md`. If either is missing, tell the user and stop.

Execute **Prompt T<number>** from the prompt pack exactly as written. Present your plan first and wait for approval before changing files, as the prompt says. Do not start any other prompt. Do not weaken any existing rule in `docs/business-rules.md`.

When the prompt's work is finished and verified, tick "Prompt T<number>" in a `## Tickets v2` section of `docs/TASKS.md` (create the section, with a line per prompt T0 to T9, if it does not exist).

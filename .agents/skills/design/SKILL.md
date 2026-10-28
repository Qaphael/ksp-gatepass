---
name: design
description: Run one numbered prompt from the design prompt pack (docs/DESIGN-PROMPTS.md). Use only when the user explicitly invokes $design with a prompt number, for example $design 3.
---

The prompt number is the number the user typed after `$design`. If none was given, ask and stop.

Read `docs/DESIGN.md` and `docs/DESIGN-PROMPTS.md`. Execute **Prompt N** from the prompt pack exactly as written, following the design spec. Present your plan first and wait for approval before changing files, as the prompt says. Do not start any other prompt. Do not change business logic, API contracts or permissions; if a design needs that, stop and ask.

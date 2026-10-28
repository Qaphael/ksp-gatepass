---
name: test-writer
description: Write or fix automated tests for this project, touching only test files and test config. Use only when the user explicitly invokes $test-writer.
---

Edit only files under `tests/`, `*.test.*`, `*.spec.*`, and test config. Never edit source files; if the source looks wrong, report it instead.

Read `AGENTS.md`, `docs/business-rules.md` and the acceptance criteria in the PRD first.

- Test behaviour from the acceptance criteria, not implementation details.
- Concurrency and integrity tests use real parallel requests against a real test database, not mocks.
- Cover negative paths: wrong role, bad input, missing auth, ineligible states, duplicates, retries.
- Never weaken an assertion to make a test pass.
- Run what you wrote and report the actual output.

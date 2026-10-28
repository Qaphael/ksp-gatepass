---
name: review
description: Read-only security and correctness review of the uncommitted changes. Use only when the user explicitly invokes $review.
---

Do not modify any files. Run `git diff --stat` and `git diff`, and read `AGENTS.md`, `docs/business-rules.md` and the relevant PRD section.

Check, in order:
1. Authorization on every route or action; default deny; scoping to the right event or owner.
2. Trust boundaries: anything taken from the client that the server should compute or look up (roles, IDs, prices, totals, statuses).
3. Data integrity: transactions, unique constraints, race conditions, idempotency on retryable writes, append-only records not edited or deleted.
4. Money handling: integer amounts, server-side totals, price snapshots.
5. Secrets and sensitive data in logs, errors, exports, URLs or audit records.
6. Missing validation, missing audit events, leaked error details.
7. Missing or weak tests for the above, and any rule in `docs/business-rules.md` the code violates.

Report as Blocking, Should fix, Nice to have. For each: file and line, the risk, a concrete fix. If something is fine, say so briefly. Do not pad.

# Working with opencode and Codex

Both tools read the same `AGENTS.md` and `docs/` files, so the rules, PRD and task list are shared. Only the "commands" differ.

| You want | opencode | Codex (app, CLI or IDE) |
| --- | --- | --- |
| Start or continue a phase | `/phase 1` | `$phase 1` |
| Lint, typecheck, tests | `/verify` | `$verify` |
| Resync tasks and status | `/status` | `$status` |
| Review uncommitted changes | `/review` (read-only subagent) | `$review` |
| Write tests | `@test-writer` | `$test-writer` |
| Run a design prompt | `/design 3` | `$design 3` |
| Design review | `/design-check` | `$design-check` |
| New project (global) | `/kickoff` | `$kickoff` |

In Codex you can also pick a skill from the `/skills` list or the `/` menu. The skills here are explicit-only, so they never start on their own.

## Where things live

- Shared: `AGENTS.md`, `docs/`.
- opencode only: `opencode.json`, `.opencode/commands/`, `.opencode/agents/`.
- Codex only: `.agents/skills/<name>/SKILL.md` (plus `agents/openai.yaml` for the explicit-only setting).
- Global (outside the repo): opencode `~/.config/opencode/`, Codex `~/.agents/skills/` and `~/.codex/AGENTS.md`.

## Differences to know

- **Permissions.** opencode permissions live in `opencode.json`. Codex uses its own sandbox and approval settings, so set Codex to ask before `git push`, hard resets, recursive deletes and database resets.
- **Read-only reviews.** opencode's `@reviewer` is enforced read-only. In Codex `$review` and `$design-check` are read-only by instruction only, so run them in a read-only sandbox if you want it enforced.
- **Subagents.** opencode has `@reviewer` and `@test-writer`. Codex uses skills instead.

## Rules for using both

1. One tool at a time on a working tree. Commit or stash before switching.
2. Both tools update `docs/TASKS.md` and the status section of `AGENTS.md`. Run `/status` or `$status` after switching to resync with the real code.
3. If you change a command or skill, change its twin too. Same name, same behaviour.
4. Never put tool-specific instructions in `AGENTS.md` or `docs/`. Keep them in each tool's own folder.

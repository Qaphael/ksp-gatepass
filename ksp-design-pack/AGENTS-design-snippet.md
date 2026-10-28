## Design

- UI work follows `docs/DESIGN.md` (mobile first, tokens in `globals.css`, no hard-coded colours). Read it before touching any component or page.
- Design at 360 x 800 first. Every screen needs loading, empty, error and success states.
- Gold is never text on light backgrounds. Status is never colour alone.
- Design tasks are run through `/design <n>` using `docs/DESIGN-PROMPTS.md`. Review with `/design-check`.
- Do not change business logic, API contracts or permissions during design work. If a design needs one, stop and ask.

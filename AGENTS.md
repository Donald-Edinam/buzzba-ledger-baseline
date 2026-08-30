# Agent operating instructions

Read `docs/DESIGN.md` before writing any code. It is the source of truth for
architecture and conventions.

## Workflow

1. Restate the task and list the ambiguities you see. Do not guess silently.
2. Write the failing test first.
3. Implement the smallest change that passes it.
4. Run `npm run check`. Do not report success until it is green.
5. If you made a judgment call on an ambiguous requirement, append an entry to
   `DECISIONS.md`.

## Rules

- Never leave a `TODO` without a corresponding entry in DESIGN.md open questions.
- Never add a dependency without asking.
- Never delete or weaken a test to make the suite pass.
- Prefer explicit `Result` returns over throwing.
- When uncertain between two readings of the spec, implement neither and ask.
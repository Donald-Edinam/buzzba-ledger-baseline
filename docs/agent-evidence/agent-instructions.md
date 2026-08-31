# Instructions given to the coding agent

The two documents below are what the coding agent was pointed at. They are
copied verbatim from the repository as it stands. Nothing has been summarised,
tidied or corrected, because the point is to show what the agent was actually
given rather than what it should have been given. Notes on where they are
inaccurate follow each one.

## AGENTS.md

The operating instructions read at the start of every session. `CLAUDE.md` is a
symlink to this file, so the same text is what Claude Code loads automatically.

```markdown
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
- When uncertain between two readings of the spec, implement neither and ask.```

These instructions were followed unevenly, and the gaps are visible in the
repository. Step 2, "write the failing test first", did not happen for most of
the work; tests were generally written alongside the implementation and in the
same commit rather than before it. Step 5 was followed, and `DECISIONS.md`
carries five entries. The rule against weakening tests was tested once: one test
in `tests/unit/openai-compat.test.ts` was changed after a live run showed the
behaviour it pinned was wrong, and that change is recorded in `DECISIONS.md`
entry D-005 rather than made quietly.

## docs/DESIGN.md

Named by AGENTS.md as "the source of truth for architecture and conventions" and
the document the agent was told to read before writing any code.

```markdown
# DESIGN.md

Context document for coding agents and reviewers. Written before implementation,
updated when the architecture actually changes. Point the agent here at the top
of every session instead of re-explaining.

## Problem

<!-- The problem in your own words, not copied from the statement. If you cannot
     restate it, you do not understand it yet. -->

## Constraints

- Hard requirements from the statement:
- Explicit non-goals:
- Performance / scale envelope:

## Invariants

Things that must always hold. Each one should map to a test.

1.
2.

## Architecture

```
<ascii or bullet map of modules and data flow>
```

| Module | Responsibility | Does NOT do |
| --- | --- | --- |
| `src/core` | Pure domain logic, no I/O | Network, filesystem, env |
| `src/adapters` | I/O boundaries | Business rules |

## Error model

All fallible operations return `Result<T, AppError>` from `src/core/result.ts`.
Codes: INVALID_INPUT, NOT_FOUND, CONFLICT, UPSTREAM_FAILURE, TIMEOUT,
UNSUPPORTED, INTERNAL. Exceptions escaping to the top level are a bug.

## Failure modes considered

| Failure | Detection | Behaviour |
| --- | --- | --- |
| Malformed input | Zod parse at boundary | INVALID_INPUT, no partial write |
| Upstream timeout | AbortSignal | UPSTREAM_FAILURE, retryable |
| Concurrent mutation | ... | ... |

## Conventions for agents

- TypeScript strict, `noUncheckedIndexedAccess` on. No `any`, no `as` without a
  comment justifying it.
- Every new behaviour lands with a test in the same commit.
- No new dependency without an entry in DECISIONS.md.
- Domain logic stays free of I/O so it is testable without mocks.
- Do not change public function signatures without updating this file.

## Open questions

- [ ]
```

This document is mostly an unfilled template, and that is the most important
thing in this folder for a judge trying to assess how the agent was steered.
The Problem, Constraints, Invariants and Open questions sections were never
written. The Architecture table describes `src/core` and `src/adapters`, and
`src/adapters` does not exist in this repository; the real structure is
`src/domain`, `src/generate`, `src/runners`, `src/eval`, `src/llm` and
`src/core`. The error model section describes a `Result<T, AppError>` convention
that `src/core/result.ts` does provide and that `AGENTS.md` reinforces, but the
LLM clients and the runners throw instead, which is a real divergence between
the stated convention and the code.

So the agent was told to treat a near-empty template as the source of truth. In
practice the architecture was carried by `docs/CODEBASE.md`, by the existing code
at the time of each session, and by the task prompts themselves, which were
detailed enough to specify file paths, exported names and test cases. The
reconstructed prompts in [prompts.md](./prompts.md) show that.

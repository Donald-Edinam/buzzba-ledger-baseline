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

# Frontier Engineering Challenge 2026 — Submission

> One paragraph: what the problem was, what this solves, and the single most
> important thing a reviewer should know. Write this LAST, rewrite it twice.

## Quick start

```bash
nvm use            # Node 22
make setup         # npm ci, exact lockfile install
make test          # run the suite
make check         # typecheck + lint + test
```

Or with zero local toolchain:

```bash
docker build -t frontier-submission .
docker run --rm frontier-submission
```

The Docker build runs typecheck and tests as a build stage. If the image
builds, the submission is reproducible.

## What this does

<!-- Fill in: inputs, outputs, the contract. -->

## Architecture

<!-- 5-10 lines max, then link to docs/DESIGN.md. -->

## Assumptions and ambiguities

The challenge statement was deliberately incomplete. Every ambiguity found and
the call made on it is logged in [DECISIONS.md](./DECISIONS.md). Read that
first if a behaviour looks surprising.

## Testing

| Layer | Location | What it covers |
| --- | --- | --- |
| Unit | `tests/unit` | Pure logic, edge cases, error paths |
| Integration | `tests/integration` | Wired components, real boundaries |

```bash
npm run test:cov
```

## Known limitations

<!-- Be honest and specific. Judges trust a stated limitation more than silence. -->

## Pre-submission gate

```bash
make verify
```

Fails if the lockfile is missing, DECISIONS.md is untouched, a focused test was
left in, or typecheck/tests fail.

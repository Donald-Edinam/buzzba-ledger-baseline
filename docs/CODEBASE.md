# Codebase guide

What every file is for, and how to get it running. Read this once before
touching anything; you will not need to open most of these files.

## Setup, from nothing

```bash
tar -xzf buzzba-ledger-baseline.tar.gz
cd frontier

nvm use              # Node 22, pinned in .nvmrc
npm ci               # exact install from package-lock.json
npm run check        # typecheck + lint + 25 tests, all should pass
npm run gen:cases    # writes the 12 evaluation cases into ./cases
```

If `npm run check` is green and `./cases` has 12 folders, the environment is
correct. Nothing above needs an API key.

Then, for a real run:

```bash
export ANTHROPIC_API_KEY=sk-...
export MODEL=claude-sonnet-5
npx tsx scripts/run.ts baseline --only case-01     # cheap smoke test first
npx tsx scripts/run.ts baseline                    # all 12
npx tsx scripts/score.ts runs/baseline
```

## The shape of it

Four groups. Everything else is config.

```
src/domain/     what a transaction IS          <- the contract
src/generate/   makes fake shop records        <- the test data
src/runners/    solves the task                <- baseline today, agent next
src/eval/       decides who did better         <- the scoreboard
```

The one rule that keeps this clean: **`src/generate` and `src/eval` never
import from `src/runners`.** The test data and the scoring cannot be influenced
by whatever you are currently trying to make win.

## File by file

### src/domain

| File | What it does |
| --- | --- |
| `ledger.ts` | The single source of truth. Defines a `LedgerRow` (date, customer, services, amount, method), the six services and their GHS prices, and the shape of a case's three sources. Zod schemas, so the same definition validates model output at runtime and gives you types at compile time. **If you change one thing in this project, change it here first.** |

### src/generate

Turns a known-correct ledger into a realistic mess. This is why you never
hand-label anything.

| File | What it does | 
| --- | --- |
| `rng.ts` | Seeded pseudo-random generator. No `Math.random` anywhere in the project, so the same seed always produces byte-identical cases. This is what makes the whole eval reproducible on a judge's machine. |
| `roster.ts` | The cast. Ten regulars, each with a legal name, the nicknames they get called, their uppercase MoMo name, and their habitual services. The habitual services are what make "the usual" resolvable. Plus eight walk-in names with no history, so "the usual" correctly fails for them. |
| `render.ts` | Four renderers, one per source plus noise. Takes a correct row and degrades it: WhatsApp gets code-switched Twi and English with a nickname and often no price, MoMo SMS gets the uppercase legal name and exact amount but no services, the daybook gets shorthand with no year and sometimes no amount. `renderNoise` emits chatter carrying no transaction, which is what tests precision. |
| `generate.ts` | Assembles it. Builds the gold ledger first, then scatters it across sources, dropping rows from some sources so the agent must join across them. Also holds `CASE_SPECS`: the 12 case definitions, including the two hard ones. |

### src/runners

| File | What it does |
| --- | --- |
| `baseline.ts` | The comparison point: one prompt, everything in, ledger out. Also defines the `Runner` interface and `RunResult`, which the agent will implement too. The system prompt here is deliberately good, since a handicapped baseline makes your improvement meaningless. |
| `parse.ts` | Pulls the JSON array out of model output, whether it arrives bare, fenced, or wrapped in prose. Validates it against the schema. Crucially, a failure returns an empty ledger rather than retrying, so fragility shows up in the numbers instead of being hidden. |

### src/eval

| File | What it does |
| --- | --- |
| `score.ts` | The scoreboard. `exactRowAccuracy` is the primary metric: all five fields correct or the row is wrong. Also computes precision (catches invented transactions), revenue error in cedis, and per-field accuracy so you can see whether failures are alias resolution, pricing or payment method. `aggregate` rolls 12 cases into the line you paste into the changelog. |

### src/llm

| File | What it does |
| --- | --- |
| `client.ts` | The `LlmClient` interface, plus the Anthropic client over `fetch`, no SDK dependency. Retries only on 429 and 5xx with backoff. Returns token usage and wall time, which is how cost per transaction gets measured. Also exports `StubClient`, which returns a canned reply so tests exercise the full pipeline without spending money. |
| `openai-compat.ts` | The same contract against any OpenAI chat-completions endpoint: Gemini, Groq, OpenRouter, Ollama. Backs off harder on 429 than the Anthropic client, because free tiers throttle by requests per minute. |
| `factory.ts` | Picks the client from `LLM_PROVIDER`, `MODEL` and the provider's key. Holds `PRESETS`, the base URL and default model per provider, and `describeProvider`, which stamps provider and model into `_run.json`. The only file in `src/llm` that reads the environment. See docs/PROVIDERS.md. |

### src/core

Generic plumbing, written once and left alone.

| File | What it does |
| --- | --- |
| `result.ts` | `Result<T, AppError>` type with coded errors. Forces callers to handle failure instead of letting exceptions surface as stack traces. |
| `config.ts` | The only place that reads environment variables. Validates at boot and fails with a readable message. |
| `logger.ts` | Structured JSON logging to stdout, level controlled by `LOG_LEVEL`. |
| `index.ts` | Entry point. Currently near-empty; the CLIs in `scripts/` are what you actually run. |

### scripts

The commands you type.

| File | What it does |
| --- | --- |
| `gen-cases.ts` | Writes the 12 cases to `./cases/`, each with `sources.json` (machine input), `sources.txt` (human-readable, good for the video) and `gold.json` (the answer). |
| `run.ts` | Runs a named runner over all cases. Writes predicted ledgers, a trajectory log, and a run summary with tokens and timing. `--only case-01` for a cheap check. |
| `score.ts` | Scores a run directory against gold. Prints the per-case table and the aggregate line, and writes `_score.json`. |
| `verify.mjs` | Pre-submission gate. Fails if the lockfile is missing, a focused test was left in, DECISIONS.md is still a template, or the suite is red. |

### tests

25 tests. Three of them matter more than the rest:

- `generate.test.ts` asserts the same seed produces identical output, which is the reproducibility claim.
- `score.test.ts` asserts a wrong field costs the whole row and that invented rows hurt precision, which is the scoring claim.
- `baseline.test.ts` runs the full pipeline against `StubClient`, so plumbing breaks show up without an API key.

### Docs and process files

| File | What it does |
| --- | --- |
| `README.md` | The judges' entry point. Written last. |
| `DECISIONS.md` | Every ambiguity and the call made on it. `verify` refuses to pass while it is still a template. |
| `AGENT_LOG.md` | Session notes: what the coding agent got right, what it got wrong, what you fixed by hand. |
| `AGENTS.md` | Instructions for the coding agent working on this repo. Symlinked to `CLAUDE.md`. |
| `docs/DESIGN.md` | Architecture and conventions. Point your agent here at the start of every session. |
| `docs/EVAL.md` | The evaluation protocol, fixed before any agent existed. |
| `docs/RUNBOOK.md` | Exact commands for baseline, agent and scoring. |
| `Makefile` | `make help` lists everything. |
| `Dockerfile` | Runs typecheck and tests as a build stage. If the image builds, the project is reproducible. |

## Where the next work goes

Building the agent means one new file, `src/runners/agent.ts`, implementing the
same `Runner` interface as the baseline, and one line registering it in the
`RUNNERS` map in `scripts/run.ts`. Nothing else changes. The scorer, the cases
and the CLI already work.

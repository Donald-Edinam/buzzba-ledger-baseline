# Runbook

## Setup

```bash
nvm use              # Node 22
npm ci               # exact lockfile install
npm run check        # typecheck, lint, 63 tests
npm run gen:cases    # regenerate 12 cases from fixed seeds
```

## Baseline

```bash
export LLM_PROVIDER=anthropic     # anthropic | gemini | groq | openrouter | ollama
export ANTHROPIC_API_KEY=...      # the key env var for the provider above
export MODEL=claude-sonnet-5      # optional; each provider has a default
export REASONING_EFFORT=low       # optional; OpenAI-compatible providers only
npx tsx scripts/run.ts baseline
npx tsx scripts/score.ts runs/baseline
```

Free-tier alternatives, one key each, no other change:

```bash
export LLM_PROVIDER=gemini && export GEMINI_API_KEY=...
export LLM_PROVIDER=groq && export GROQ_API_KEY=...
export LLM_PROVIDER=openrouter && export OPENROUTER_API_KEY=...
export LLM_PROVIDER=ollama        # local, no key; needs `ollama serve`
```

On Gemini, read the Thinking tokens section of docs/PROVIDERS.md before a full
run: reasoning tokens are billed against the output ceiling, and a case that
overruns it fails as `TRUNCATED:` rather than being scored as a bad answer.

See docs/PROVIDERS.md for costs, rate limits and caveats. The run prints
`provider=... model=...` at start and records both in `_run.json`.

Start with one case to check the key and the shape of the output before
spending on all twelve:

```bash
npx tsx scripts/run.ts baseline --only case-01
```

## Outputs of a run

| File | Purpose |
| --- | --- |
| `runs/<name>/<case-id>.json` | predicted ledger, input to the scorer |
| `runs/<name>/_trajectories.jsonl` | one line per case, deliverable 4 |
| `runs/<name>/_run.json` | tokens, wall time, per-case parse status |
| `runs/<name>/_score.json` | written by the scorer |

## Fairness

Baseline and agent must use the same `LLM_PROVIDER` **and** the same `MODEL`;
switching either partway invalidates earlier numbers, so re-run the baseline
after any switch. `_run.json` records both, so check they match before quoting
a delta. The baseline is given the same
price list, the same schema and the same merge instructions as the agent, so
the comparison isolates the agentic design rather than rewarding a better
prompt. Any difference in resources available to each is recorded in
DECISIONS.md.

## Cost

`_run.json` records input and output tokens per run. Multiply by the current
published rates for your model to get cost per run, and divide by 341 for cost
per transaction. Record the rate you used and the date, since published rates
change.

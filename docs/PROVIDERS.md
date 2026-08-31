# LLM providers

The runners talk to an `LlmClient` and nothing else, so the provider is a
configuration choice, not a code change. `src/llm/factory.ts` reads
`LLM_PROVIDER`, `MODEL` and the provider's key from the environment and returns
either the Anthropic client or the OpenAI-compatible one. Every other file in
the project is unaware of which is in use.

## The five providers

Every figure below marked **measured** came from an observed API response on
the date given, not from a documentation page. Unmeasured limits are left blank
rather than guessed, and `dailyRequestCap` in `src/llm/factory.ts` is `null`
for those — null means *unmeasured*, not unlimited.

| Provider | `LLM_PROVIDER` | Key env var | Default model | Cost | Daily cap | Caveats |
| --- | --- | --- | --- | --- | --- | --- |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | `google/gemma-4-31b-it:free` | Free on `:free` | **50**, or 1000 once $10 has ever been purchased | 20 req/min always. **Rejected requests still count against the daily cap**, so a retry loop destroys budget — the client refuses to retry a 429 here. The free lineup rotates without notice. |
| Google Gemini | `gemini` | `GEMINI_API_KEY` | `gemini-3.6-flash` | Free tier | **20 per model** (measured 2026-08-30) | Cap is per model per day, so retrying cannot succeed however long the backoff. Rejected requests do *not* consume quota. Reasons by default — see [Thinking tokens](#thinking-tokens). **Free-tier prompts may be used to improve Google's models.** |
| Anthropic | `anthropic` (default) | `ANTHROPIC_API_KEY` | `claude-sonnet-5` | Paid per token | — (no free tier) | Strongest instruction-following, so the fewest parse failures. A full baseline-plus-agent comparison is cents. |
| Groq | `groq` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | Free tier | — (not measured) | Very fast, but tight per-minute limits and a habit of retiring model names. Open-weight models hold strict JSON less reliably. |
| Ollama | `ollama` | none needed | `qwen2.5:14b` | Free, local | — (none) | Needs `ollama serve` and the model pulled. No limits and no data leaves the machine, but a 14B model scores well below the hosted options. |

**`google/gemma-4-31b-it:free` on OpenRouter is the model of record**, pinned
**2026-08-30**. The id was verified to resolve against
`openrouter.ai/api/v1/models` on that date, reporting a 262,144-token context
and a 32,768-token completion ceiling, so the 16,000 default has room. Its
display name ("Google: Gemma 4 31B (free)") is not its API id — use the id
verbatim.

**Free-model availability rotates.** A judge rerunning this later may find the
id gone, and will need to substitute a current `:free` model, re-baseline, and
record the substitution with its date. Check that the id resolves before
starting a run.

**Gemma 4 31B has a configurable thinking/reasoning mode**, so the truncation
trap in the next section applies here exactly as it does on Gemini: keep
`REASONING_EFFORT` set, and confirm its effect through `completion_tokens` in
`usage` rather than trusting any documentation, this file included.

> **Resolved 2026-08-30.** OpenRouter's catalog lists `reasoning` /
> `include_reasoning` in `supported_parameters` for this model, not
> `reasoning_effort` — but that is only the canonical name. OpenRouter's API
> reference documents `reasoning_effort` as *"Shorthand for setting reasoning
> effort. Equivalent to setting `reasoning.effort`. Cannot be used
> simultaneously with `reasoning.effort` if they differ,"* with allowed values
> `max, xhigh, high, medium, low, minimal, none, null`. What this client sends
> is therefore correct, and the `low` default is a valid value. Still confirm on
> the first run that `completion_tokens` responds to a change in
> `REASONING_EFFORT` — the field being *accepted* is not proof the model *uses*
> it.

**Free-pool saturation is a separate failure from your own quota.** Observed
2026-08-30: every request to `google/gemma-4-31b-it:free` returned

```
429 "google/gemma-4-31b-it:free is temporarily rate-limited upstream.
     Please retry shortly, or add your own key to accumulate your rate limits"
```

sustained across several minutes, while the account itself had zero usage. The
sibling `google/gemma-4-26b-a4b-it:free` was equally throttled, and two models
that used to be free (`deepseek/deepseek-chat-v3.1:free`,
`meta-llama/llama-3.3-70b-instruct:free`) now return 404 "unavailable for free".
This is the rotation warning above, in practice.

The client distinguishes the two: a body marked *temporarily rate-limited
upstream* is retried with backoff, because it is a busy queue rather than a
spent allowance. Any other 429 on OpenRouter is still terminal, since rejected
requests there consume daily budget.

If the free pool stays saturated, the same model is available paid as
`google/gemma-4-31b-it` (drop `:free`) at $0.09/M prompt and $0.34/M
completion — about **$0.007 for a 12-case baseline and $0.013 for an agent
run**, roughly two cents for the whole comparison. Same weights, so the model of
record is unchanged; only the routing tier differs.

`LLM_BASE_URL` overrides the base URL for any provider. `LLM_TIMEOUT_MS` sets
the per-request timeout (default 180000); high reasoning levels can take
minutes, and the platform default would abort a response mid-flight.

## Thinking tokens

**The failure mode.** Gemini 3.x Flash enables reasoning by default, and
reasoning tokens are billed against `max_tokens` *before* the model emits a
single character of the answer. A model that thinks past its budget returns a
successful HTTP 200 carrying nothing usable. Left alone, this is misattributed:
the parser reports "no JSON found" and the case is scored as a model that
cannot follow a schema, when in fact it never got to answer.

**Verified, not assumed.** With `max_tokens: 50` and no `reasoning_effort`, the
API returned `finish_reason: "length"` with empty content and
`completion_tokens: 0`.

**The fix, in three parts.**

1. **A ceiling that fits the task.** The `max_tokens` default is 16000, not
   8000. `case-12-hard` has 70 gold rows, and 70 JSON objects is roughly
   3,500–5,000 output tokens before any reasoning budget at all.
2. **A budget knob.** `REASONING_EFFORT` (default `low`) is sent as
   `reasoning_effort` on OpenAI-compatible providers. Set `none` to disable
   thinking, or `high` when a case needs it and the ceiling can absorb it. The
   field is omitted from the request entirely when unset — not sent as null.
   It is never sent to Anthropic, whose extended thinking is a different
   parameter shape.
3. **A named failure.** `finish_reason: "length"` now throws a `TRUNCATED:`
   error carrying `completion_tokens` and the `max_tokens` that was requested.
   It is deliberately not retried — an identical request truncates identically.
   `scripts/run.ts` records the case as a failure with that reason, so a budget
   problem is never scored as a parsing problem. Every response also carries
   `finishReason` verbatim.

**Verify the effect yourself, per model.** Whether a given model reasons by
default, and how much budget it spends, varies by model and changes between
releases. Do not trust the documentation for this. Run one case and read
`completion_tokens` in `usage`: if it is 0 or far below the row count implies,
the budget is going to thinking. `REASONING_EFFORT` is recorded in
`_run.json` alongside provider and model so the setting behind any number is
recoverable.

## Usage, and what a free tier actually covers

A baseline run is **12 requests**, one per case. `agent-v1` is two-pass, so it
is **24 requests** per run. A baseline plus one agent iteration is therefore
**36 requests**, not the ~24 a one-call-per-case design would suggest. Every
later iteration that adds a pass adds another 12.

**Measured on 2026-08-30, this does not fit Gemini's free tier.** The limit is
per model, per day:

```
quotaId:     GenerateRequestsPerDayPerProjectPerModel-FreeTier
quotaMetric: generativelanguage.googleapis.com/generate_content_free_tier_requests
model:       gemini-3.6-flash
quotaValue:  20
```

Twenty requests per day. A baseline run fits with eight to spare. **A single
`agent-v1` run does not fit at all** — 24 requests cannot complete in one day
on one model, no matter how the retries are paced. Attempting it produces
exactly one scored case and eleven `429` failures.

Two traps in that error worth knowing. The 429 body carries
`"Please retry in 20.564s"` and a `RetryInfo` of `20s`, which reads like a
per-minute throttle and is not: the underlying quota is daily, so backing off
and retrying only burns more of it. And the quota is per *model*, so switching
between Gemini models gives each its own separate daily allowance — while
breaking the fairness rule below.

If you need a full baseline-plus-agent comparison in one sitting, use a
provider whose free daily allowance covers 36 requests, or pay for one. On
Anthropic, 36 requests is cents.

## Fairness rule

**The baseline and the agent must use the same provider and the same model.**

The entire claim of this project is that the agentic design accounts for the
difference in score. If the baseline runs on `gemini-3.6-flash` and the agent
on `google/gemma-4-31b-it:free`, the comparison measures the model, not the
design, and means nothing. **That is the situation this project is currently
in:** `runs/baseline` was produced on `gemini-3.6-flash`, so moving to
OpenRouter requires re-running it before any agent number can be compared.

**Switching provider or model partway invalidates every earlier number.** If
you switch, re-run the baseline on the new configuration before comparing
anything. `runs/<name>/_run.json` records `provider`, `model` and `baseUrl` for
exactly this reason: check that the two runs match before you quote a delta.

## Before a full run

Free-tier limits, pricing and model names change often, and the defaults in
`PRESETS` will drift out of date. Verify the model name and the current limits
on the provider's own page, do a `--only case-01` smoke test, and record the
provider, model and the date in DECISIONS.md alongside the numbers. Check
`completion_tokens` on that smoke test before committing to twelve cases.

## Data handling

Gemini's free tier may use submitted prompts to train Google's models. That is
acceptable here only because every case is synthetic: names, amounts and
messages are generated from seeded RNG in `src/generate/`, and no real customer
or shop data exists anywhere in this repo. Do not point this pipeline at real
records on a free tier.

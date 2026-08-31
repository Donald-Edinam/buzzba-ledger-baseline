# Milestone prompts

**These are reconstructed, not captured.** No transcript of the driving prompts
was saved while the work was happening. What follows was rebuilt afterwards from
the resulting code, the tests, the commit history and `DECISIONS.md`. Treat it as
an accurate account of what each stage was asked to do and an approximate account
of how it was worded.

The fidelity is not uniform, so it is marked per stage. Stages 4 through 7 were
driven in sessions the reconstructing agent took part in, and the prompts there
were unusually specific, naming files, exported symbols, constructor signatures
and required test cases before any code existed. Stages 1 through 3 predate those
sessions and are inferred from the code alone, so they are the weakest entries
here.

## 1. The evaluation harness

**Fidelity: low, inferred from code only.** Commit `8b2d43b`.

Build a seeded case generator for a barbershop ledger reconstruction task. A
fixed seed must produce byte-identical output, so no `Math.random` anywhere.
Define the domain in `src/domain/ledger.ts` with Zod: six services with GHS
prices, three payment methods, and a `LedgerRow` where every field is required.
Build a roster of ten regulars, each with a legal name, the nicknames they get
called, an uppercase MoMo name and their habitual services, plus eight walk-ins
with no history so "the usual" correctly fails for them. Write four renderers
that degrade a correct row into WhatsApp code-switched Twi and English, MoMo
payment SMS, daybook shorthand, and noise that carries no transaction. Define 12
case specs including two hard ones where half the rows appear in only one source.

## 2. The scorer

**Fidelity: low, inferred from code only.** Commit `8b2d43b`.

Write `src/eval/score.ts`. Primary metric is exact row accuracy: a row counts
only when date, customer, services, amount and method are all correct, no partial
credit. Add precision to catch invented transactions, revenue error in GHS, and a
per-field breakdown so failures can be attributed to alias resolution, pricing or
payment method. `src/eval` must never import from `src/runners`. Validate the
scorer against a perfect run and a deliberately degraded run before trusting it.

## 3. The baseline runner and parser

**Fidelity: low, inferred from code only.** Commit `8b2d43b`.

Write the baseline a competent person would actually try: one prompt, all three
sources, ledger out. Give it the same price list, schema and merge instructions
the agent will get, so the comparison isolates the agentic design rather than
rewarding a better prompt. Write `src/runners/parse.ts` to recover the JSON array
whether it arrives bare, fenced or wrapped in prose, and make a parse failure
return an empty ledger rather than retrying, so fragility shows up in the numbers.

## 4. Multi-provider LLM support

**Fidelity: high.** Commit `f3e2b80`.

Add multi-provider support so runs can use free-tier providers instead of the
Anthropic API. Do not change the Runner interface, the scorer or the case
generator. Add `src/llm/openai-compat.ts` exporting `OpenAICompatClient`
implementing `LlmClient`, constructor `(model, apiKey, baseUrl, maxRetries = 5)`,
retrying only on 429 and 5xx, backing off 8000 times attempt on a 429 because
free tiers throttle per minute. Add `src/llm/factory.ts` exporting
`ProviderPreset`, `PRESETS` for anthropic, gemini, groq, openrouter and ollama,
`createClient(env)` and `describeProvider(env)`. Read environment variables only
in the factory, never in the client classes. Stamp the provider into
`_run.json`. Tests must pass env objects directly and never mutate `process.env`.

## 5. Thinking-token hardening

**Fidelity: high.** Commit `f3e2b80`.

Gemini 3.x Flash reasons by default and those tokens count against `max_tokens`,
which silently returns empty content. Verified: with `max_tokens` 50 and no
`reasoning_effort`, the API returned `finish_reason` "length" with empty content
and `completion_tokens` 0. Raise the `max_tokens` fallback to 16000. Add an
optional `reasoningEffort` constructor parameter, included in the body only when
set, never as null or empty string, and never on `AnthropicClient`. After a
successful response, if `finish_reason` is "length", throw an error whose message
begins "TRUNCATED:" and includes `completion_tokens` and the requested
`max_tokens`. Do not retry a truncation. Add `finishReason` to `LlmResponse` and
populate it in both clients. Add `AbortSignal.timeout` to both clients, default
180000, and treat an abort as retryable.

## 6. The agent runner

**Fidelity: high.** Commit `cd29542`.

Build `src/runners/agent.ts` exporting `agentRunner` with name `agent-v1`. This
is iteration 1 of the changelog, so it makes exactly one architectural change
against the baseline: a persistent customer roster held across the case. Do not
add verification or a confirmation queue, because mixing them makes the changelog
unable to attribute the improvement. Pass 1 is one LLM call over the MoMo SMS and
daybook lines only, not the WhatsApp thread, returning canonical names and
aliases validated by a Zod schema; on parse failure continue with an empty roster
and record it in the trajectory rather than throwing. Pass 2 extracts with the
roster rendered into the prompt. The justification given was the measured
per-field breakdown: customer accuracy fell to 53.57 on `case-12-hard` while
services, amounts and methods held between 92 and 100.

## 7. Provider presets and the quota guard

**Fidelity: high.** Commits `3beb786` and `a27ab4e`.

Update the presets from measured quota findings. Gemini free tier is
`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue` 20, per model
per day, and the 429 body suggests retrying in 20 seconds which is misleading
because the cap is daily. Rejected Gemini requests do not consume quota, rejected
OpenRouter requests do. Add a `dailyRequestCap` field to `ProviderPreset`, null
where unmeasured, and a preflight in `scripts/run.ts` that warns when a run would
exceed it. Parse the 429 body and throw immediately with a message beginning
"QUOTA_EXHAUSTED:" when the quotaId contains "PerDay". Verify the OpenRouter model
id against openrouter.ai/models before committing to it rather than guessing a
variant.

A later correction narrowed this. The instruction was to refuse every 429 on
OpenRouter, and a live run showed OpenRouter also returns 429 for a busy shared
pool with the text "temporarily rate-limited upstream, please retry shortly",
which is retryable. That is recorded in `DECISIONS.md` entry D-005.

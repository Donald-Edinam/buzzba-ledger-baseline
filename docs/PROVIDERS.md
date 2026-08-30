# LLM providers

The runners talk to an `LlmClient` and nothing else, so the provider is a
configuration choice, not a code change. `src/llm/factory.ts` reads
`LLM_PROVIDER`, `MODEL` and the provider's key from the environment and returns
either the Anthropic client or the OpenAI-compatible one. Every other file in
the project is unaware of which is in use.

## The five providers

| Provider | `LLM_PROVIDER` | Key env var | Default model | Cost | Caveats |
| --- | --- | --- | --- | --- | --- |
| Anthropic | `anthropic` (default) | `ANTHROPIC_API_KEY` | `claude-sonnet-5` | Paid per token, no free tier | The reference configuration. Strongest instruction-following, so the fewest parse failures. A 12-case run is cents. |
| Google Gemini | `gemini` | `GEMINI_API_KEY` | `gemini-2.5-flash` | Free tier | Per-minute and per-day request caps; bursts return 429 and the client waits them out. **Free-tier prompts may be used to improve Google's models.** |
| Groq | `groq` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | Free tier | Very fast, but tight per-minute request and token limits, and model names get retired on short notice. Open-weight models hold strict JSON less reliably. |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct:free` | Free tier on `:free` models | One key, many models. `:free` variants are heavily rate limited and can queue or fail under load; drop the `:free` suffix to pay for a reliable slot. |
| Ollama | `ollama` | none needed | `qwen2.5:14b` | Free, local | Needs `ollama serve` running and the model pulled. No rate limits and no data leaves the machine, but a 14B model scores well below the hosted options and long prompts are slow on CPU. |

`LLM_BASE_URL` overrides the base URL for any provider, for a proxy or a
non-default Ollama port.

## Usage, and why a free tier is enough

One run is **12 requests** — one per case, since the baseline makes a single
call per case. A full project (baseline plus agent, plus a smoke test or two)
is roughly **60 requests**. That is comfortably inside every free tier listed
above. The limits that bite are per-minute, not per-day: `OpenAICompatClient`
waits 8s, 16s, 24s… on a 429 precisely because free tiers throttle by requests
per minute, so a run may be slow but should not fail.

## Fairness rule

**The baseline and the agent must use the same provider and the same model.**

The entire claim of this project is that the agentic design accounts for the
difference in score. If the baseline runs on `gemini-2.5-flash` and the agent
on `claude-sonnet-5`, the comparison measures the model, not the design, and
means nothing.

**Switching provider or model partway invalidates every earlier number.** If
you switch, re-run the baseline on the new configuration before comparing
anything. `runs/<name>/_run.json` records `provider`, `model` and `baseUrl` for
exactly this reason: check that the two runs match before you quote a delta.

## Before a full run

Free-tier limits, pricing and model names change often, and the defaults in
`PRESETS` will drift out of date. Verify the model name and the current limits
on the provider's own page, do a `--only case-01` smoke test, and record the
provider, model and the date in DECISIONS.md alongside the numbers.

## Data handling

Gemini's free tier may use submitted prompts to train Google's models. That is
acceptable here only because every case is synthetic: names, amounts and
messages are generated from seeded RNG in `src/generate/`, and no real customer
or shop data exists anywhere in this repo. Do not point this pipeline at real
records on a free tier.

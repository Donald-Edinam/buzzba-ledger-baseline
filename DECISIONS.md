# Decision log

The challenge statement is deliberately incomplete. Each entry below records an
ambiguity, the interpretation chosen, and what would change under a different
reading. This is the record of engineering judgment, not a changelog.

---

## D-001: Which provider a run uses, and how a run proves which one it was

**Date:** 2026-08-30
**Status:** decided

**Ambiguity.** The evaluation protocol fixes the *task* but not the *model
vendor*. Running twelve cases against a paid API is a real barrier for anyone
reproducing this, yet the comparison between baseline and agent is only
meaningful if both ran on the same model. Nothing in the statement says how to
reconcile the two.

**Options considered.**
1. Anthropic only. Simplest, but a judge without a key cannot reproduce a run
   at all.
2. Provider selected per run, with the choice recorded in the run artefact.
3. Provider selected per *case* or fallback chains across providers on failure.

**Decision.** Option 2. `LLM_PROVIDER` selects one of five presets
(anthropic, gemini, groq, openrouter, ollama) in `src/llm/factory.ts`; four of
them have a free tier, and a full project is roughly 60 requests, which fits
inside all of them. `describeProvider()` stamps `provider`, `model` and
`baseUrl` into `runs/<name>/_run.json`. The `Runner` interface, the scorer and
the case generator are untouched: runners cannot tell which provider answered.

**Rationale.** Reproducibility is a deliverable, and a paid key is the single
largest obstacle to it. Option 3 was rejected outright: silently failing over
to a different model mid-run would make a run's numbers unattributable, which
is precisely the failure the stamped metadata exists to prevent. Recording the
provider is what keeps option 2 honest — the fairness rule (same provider and
model for baseline and agent) is checkable after the fact rather than trusted.

**Consequence if wrong.** If a preset's default model name is retired by the
provider, the run fails at the first request with the provider's own error, not
silently; `--only case-01` catches it for the price of one request.
`tests/unit/factory.test.ts` pins provider selection, the `MODEL` override and
both error messages, but it deliberately does not pin the model *names* — those
are the provider's to change, and asserting them would only produce a test that
fails on someone else's schedule. Reversing to Anthropic-only is deleting two
files and one import.

---

## D-001: <short title of the ambiguity>

**Date:** YYYY-MM-DD
**Status:** decided | revisited | reversed

**Ambiguity.** What the statement does not say, quoted or paraphrased precisely.

**Options considered.**
1. ...
2. ...

**Decision.** What was implemented.

**Rationale.** Why this reading over the others. Cite the constraint that
settled it (correctness, spec wording, failure mode, cost).

**Consequence if wrong.** What breaks, how it is detected, and how long the
reversal would take. Point to the test that pins the behaviour.

## D-002: Thinking tokens are a budget failure, not a wrong answer

**Date:** 2026-08-30
**Status:** decided

**Ambiguity.** The scoring protocol has one bucket for a case that produces no
usable ledger. It does not distinguish a model that answered badly from a model
that never got to answer. Gemini 3.x Flash reasons by default and bills those
tokens against `max_tokens`, so an overrun returns HTTP 200 with empty content
— which `parse.ts` correctly reports as "no JSON found". Scored naively, a
budget misconfiguration is recorded as a model that cannot follow a schema.

**Options considered.**
1. Raise `max_tokens` and leave it there. Cheap, but the same failure returns
   the moment a model reasons harder or a case gets longer, and it stays
   invisible when it does.
2. Detect `finish_reason: "length"` and fail the case with a named error, plus
   a configurable reasoning budget.
3. Detect it and retry with a larger ceiling or less reasoning.

**Decision.** Option 2. The `max_tokens` default is 16000; `REASONING_EFFORT`
(default `low`) is sent as `reasoning_effort` on OpenAI-compatible providers
only; `finish_reason: "length"` throws `TRUNCATED:` carrying
`completion_tokens` and the requested `max_tokens`. `baseline.ts` does not
catch it, so `run.ts` records it per-case. `finishReason` and
`reasoningEffort` are recorded on every response and in `_run.json`.

**Rationale.** Option 3 was rejected because a silent retry at a different
budget means two cases in the same run were answered under different
conditions, which is the same disease as switching models mid-run (D-001).
The measurement has to stay honest even when that costs a case. `low` rather
than `none` as the default because some reasoning measurably helps the
cross-source join, while an unbounded budget is what starves the output.
The truncation is never retried: an identical request truncates identically,
so a retry would spend quota to reproduce the same failure.

Two consequences of scope worth recording. `reasoning_effort` overlaps with
Gemini's native `thinking_level` / `thinking_budget` and the two cannot both be
sent, so only `reasoning_effort` is used. `AnthropicClient` reports
`finishReason` but does not throw on truncation: Anthropic's extended thinking
is off by default and a different parameter shape, so the failure mode this
guards against does not arise there. If that changes, the guard belongs in both.

**Consequence if wrong.** If `low` turns out to hurt accuracy, it is one
environment variable, and `_run.json` records what each existing run used, so
old numbers stay interpretable rather than needing to be discarded. If the
`TRUNCATED:` guard is too eager, a case that would have parsed is failed
instead — visible immediately as a `parseReason` starting `TRUNCATED:` in
`_run.json`, never as a silently lower score.
`tests/unit/openai-compat.test.ts` pins the throw, the no-retry behaviour and
the conditional `reasoning_effort` field.

## D-003: The agent shares the baseline's prompt rather than copying it

**Date:** 2026-08-30
**Status:** decided

**Ambiguity.** Iteration 1 must make exactly one architectural change against
the baseline, so the changelog can attribute the gain to it. The agent's pass 2
is specified as "the same system prompt as the baseline plus a roster block" —
but nothing says whether "the same" means a copy or the same object.

**Options considered.**
1. Copy the baseline prompt text into `agent.ts`.
2. Export `SYSTEM` and `renderSources` from `baseline.ts` and import them.

**Decision.** Option 2. `baseline.ts` now exports both; behaviour is unchanged,
the diff is two `export` keywords. `agent.ts` composes
`${BASELINE_SYSTEM}\n\n${roster block}` and sends the identical user content.

**Rationale.** Under option 1 the two prompts drift the first time either is
touched, and the drift is silent. The whole claim of the changelog is that the
roster is the only difference between the two runners; a shared constant makes
that structurally true instead of a thing someone has to remember. The roster
JSON recovery is deliberately *not* shared in the other direction: `parseRoster`
is local to `agent.ts` rather than generalised into `parse.ts`, so the
baseline's parsing path stays byte-identical to what produced its recorded
60.71%.

**Consequence if wrong.** If a later iteration needs a prompt that genuinely
diverges from the baseline's, the shared constant becomes the wrong shape and
the fix is to copy it then, with the divergence recorded as its own decision.
`tests/integration/agent.test.ts` pins the roster reaching pass 2 and pass 1
seeing only MoMo and daybook, so a change to either is a failing test.

---

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

---

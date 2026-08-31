# Agent use evidence

The hackathon rules require disclosure of coding-agent use and submission of
trajectories. This project has an automated trajectory system, and it did not
capture what it was supposed to. `scripts/run.ts` truncates
`_trajectories.jsonl` at the start of every run and only appends a line for a
case that completed, so a run that ends in provider errors leaves an empty file
behind, and the last run against any directory wipes what an earlier one wrote.
All three run directories currently hold a 0 byte trajectory file. That is a
defect, not a design decision, and it is described in
[runtime-trajectories.md](./runtime-trajectories.md).

This folder is the disclosure that stands in place of those files. It is
assembled after the fact from the repository, the commit history, and the
sessions themselves, so it is weaker evidence than a captured transcript would
have been. It is presented as what it is.

## Tools used

**Claude Code**, Anthropic's CLI coding agent, running the model
`claude-opus-5`. This is verifiable from the sessions themselves. It was used to
write, test and document the following, which corresponds to commits `f3e2b80`
through `a27ab4e`:

- multi-provider LLM support and `src/llm/factory.ts`
- thinking-token hardening, meaning `reasoning_effort`, truncation detection and
  request timeouts
- the `agent-v1` two-pass runner and its tests
- the provider preset updates and the `PerDay` quota guard
- the project rename, README.md, CHANGELOG.md and the docs under `docs/`

**The earlier work is not attributable from inside this repository.** Commit
`8b2d43b`, which initialised the evaluation framework, the scorer, the case
generator and the baseline runner, predates the sessions above. No commit in
this repository carries a `Co-Authored-By` trailer or any other machine-readable
record of which tool produced it, so what built that first commit cannot be
verified from the repo or from the sessions. The author should state it here
directly.

**Planning and prompt authoring.** The prompts that drove the coding agent were
written by the author, and several were detailed enough to specify file names,
function signatures and test cases before any code existed. Whether another
assistant was used to help draft them is not something this repository records,
and it is not something the coding agent can attest to. The author should fill
this in.

Two gaps above are marked for the author rather than filled in by the agent that
wrote this file. Guessing at them would defeat the purpose of a disclosure.

## Runtime models

These are different from the models above and judges should not read them as the
same thing. The models in this section did not write any code. They are the
subject of the experiment, called by the code at runtime and measured by the
scorer.

| Model | Where it appears |
| --- | --- |
| `gemini-3.6-flash` | Produced the baseline and `agent-v1` numbers reported in CHANGELOG.md |
| `inclusionai/ling-3.0-flash-fin:free` | Produced one `case-01` prediction that contaminated `runs/baseline/`, described in CHANGELOG.md |
| `claude-sonnet-5` | Preset default for the `anthropic` provider. Not used for any reported number |
| `google/gemma-4-31b-it:free` | Preset default for `openrouter`. Not used for any reported number |
| `llama-3.3-70b-versatile` | Preset default for `groq`. Not used for any reported number |
| `qwen2.5:14b` | Preset default for `ollama`. Not used for any reported number |

The full preset list with measured rate limits is in `src/llm/factory.ts` and
`docs/PROVIDERS.md`.

One model appears on both sides. `claude-opus-5` wrote code, and `claude-sonnet-5`
is a runtime preset default. They are different models and neither was used to
grade the other. No number in this project was produced by an Anthropic model.

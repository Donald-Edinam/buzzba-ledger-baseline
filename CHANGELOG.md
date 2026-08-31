# Improvement changelog

This records how the system moved from a single-prompt baseline to a measured
agent iteration, and what each step cost or bought. One iteration was built,
measured, and then removed because it made the results worse. That result is
kept here in full rather than dropped, because a negative result that was
actually measured is worth more than a positive one that was not.

All figures come from `runs/*/_score.json`. The evaluation protocol was fixed
before any agent code existed and is described in `docs/EVAL.md`.

| Stage | What was tried and why | Evidence | Decision |
| --- | --- | --- | --- |
| **Baseline** | One prompt, all three sources in a single call. Given the same GHS price list, the same output schema and the same instruction to merge people across sources as the agent gets. Deliberately not handicapped, because a weak baseline makes any improvement meaningless. | 64.61% exact row accuracy, 73.71% precision, GHS 510 revenue error. 7 cases, `gemini-3.6-flash`. | Kept as the comparison point. |
| **Quota failure** | Ran the full 12-case agent on the Gemini free tier. 11 of 12 cases returned HTTP 429. The cap is `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue` 20, per model per day. The agent is two-pass, so 12 cases needs 24 requests and cannot complete inside one day. | Run discarded, never scored. Raw evidence retained at `runs/agent-v1-FAILED-quota-2026-08-30/`. | Cap the run at the cases the quota allows and report only those. |
| **Iteration 1: persistent customer roster** | Pass 1 builds a roster of canonical names and aliases from the MoMo SMS and daybook lines. Pass 2 extracts the ledger with that roster supplied as context. Chosen because the baseline's per-field breakdown showed customer was the only field that degraded with difficulty, falling to 53.57% on `case-12-hard` while services, amounts and methods held between 92% and 100%. | 56.21% exact, 63.92% precision, GHS 525 revenue error. Same 7 cases, same model. | Removed. |

## What iteration 1 taught us

The change was negative on every metric. Exact accuracy fell 8.40 points,
precision fell 9.79, and customer accuracy fell 4.61. Nothing about supplying
the roster helped in aggregate.

It was not uniform, which is the interesting part. `case-10` improved, from
48.57 to 54.29 exact, and `case-04` improved on customer accuracy. Against that,
`case-05` collapsed by 30 points and `case-06` fell by 18. So the roster helps on
some inputs and actively misleads on others, and the aggregate is hiding two
different behaviours rather than describing one.

Precision fell further than accuracy. That is the signature of confident
misassignment rather than random error. Given a fixed list of names, the model
picks from the list instead of reading the sources.

The likely mechanism, stated as a hypothesis and not as something proven: pass 1
reads only the MoMo SMS and the daybook, so a customer who never paid by MoMo has
no legal name anywhere in the roster. On `case-01` the roster built 7 entries and
8 aliases, and the agent still emitted "Kojo" rather than "Kojo Asante". The
roster may have been correct but incomplete, and pass 2 then resolved faithfully
against an incomplete list. That would explain why precision suffered most.

The lesson is that memory helps an agent only when the memory is complete. A
partial memory is worse than none, because the model trusts it over the evidence
in front of it. That points iteration 2 at widening pass 1's inputs and measuring
roster completeness directly, rather than enforcing the roster harder at
extraction, which was the obvious next move and would probably have made things
worse. Time ran out before that could be tested.

## Limitations of these numbers

The comparison covers 7 of 12 cases, not all 12. Both hard cases are missing, and
those are where the baseline was weakest, so this comparison is biased toward the
easier end of the eval. The 7 cases are `case-03` through `case-08` and `case-10`,
the ones where both runs produced a non-empty prediction.

The baseline and agent figures above are that matched 7-case subset, scored
separately. The 12-case baseline aggregate sitting in `runs/baseline/_score.json`
is not comparable to anything and should not be quoted. That directory now mixes
a `case-01` prediction from `inclusionai/ling-3.0-flash-fin:free` with 11
predictions from `gemini-3.6-flash`, after a single-case smoke test overwrote part
of it. The number is stated here so it is not quietly dropped: it reads 60.71%
exact, and it is an artefact of two models, not a measurement of either.

Identical reruns of `case-01` on the same model produced 8 rows and then 9 rows.
There is run-to-run variance and this eval does not quantify it, so a difference
of a point or two between any two numbers here is not evidence of anything.

The trajectory files were written empty. The append only fires on a successful
case and the initialisation truncates the file, so `_trajectories.jsonl` is 0
bytes in every run directory and the deliverable 4 evidence is incomplete. This
is a defect in `scripts/run.ts`, not a property of the agent.

Provider constraints shaped what could be measured at all. The measured daily
caps and the reasoning-token behaviour are in `docs/PROVIDERS.md`, and the
reasoning behind each provider decision is in `DECISIONS.md`, entries D-004 and
D-005.

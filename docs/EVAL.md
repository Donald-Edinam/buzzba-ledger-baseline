# Evaluation protocol

Fixed before any agent code was written, so the target could not move to fit
the result.

## Primary metric

**Exact row accuracy.** A reconstructed ledger row counts only when date,
customer, services, amount and payment method are all correct. No partial
credit. This is the honest measure because a row with the wrong amount is not
80 percent useful to a shop owner, it is wrong.

## Secondary metrics

| Metric | Why it is here |
| --- | --- |
| Precision | Catches invented transactions. A system that hallucinates revenue is worse than one that misses it. |
| Revenue error (GHS) | The number the owner actually checks. Cedis, not percentages. |
| Per-field accuracy | Diagnostic. Tells you whether failures are alias resolution, pricing, or payment method. |
| Human minutes per 100 rows | Measured by timing correction of the confirmation queue. |

## What good looks like

Defined before running anything. The owner will not adopt a system whose
ledger they must fully re-check by hand. Target: exact row accuracy above 90
percent with precision at or near 100, and revenue error under GHS 20 per
week. Precision matters more than recall, because a missed row gets noticed
and added, while an invented row silently corrupts the books.

## Cases

12 cases, 341 gold rows, spanning 2 to 10 days of shop activity.
`case-11-hard` and `case-12-hard` are the challenging cases: half of all rows
appear in only one source, and case 12 spans ten days to put the single-prompt
baseline under context pressure.

Same cases for baseline and agent. No case was regenerated after seeing a
result.

## Reproducing

```bash
make setup
make cases                      # regenerate all 12 cases from fixed seeds
make score RUN=runs/baseline
make score RUN=runs/agent
```

Case generation is deterministic. `npm run test` asserts that the same seed
produces byte-identical output, so a judge regenerating the cases gets exactly
the set that produced these numbers.

## Harness validation

The scorer is checked against two synthetic runs before trusting it on real
ones:

- a perfect run (gold copied as predictions) scores 100 across every metric
- a degraded run (every 5th row dropped, every 4th amount inflated by 5)
  scores 51.77 exact, 66.07 precision, GHS 2035 revenue error

This proves the harness discriminates rather than flattering whatever it is
given.

## Honest limitation

Cases are generated from a known ledger and then rendered into messy sources,
rather than hand-labelled from real records. This buys free, exact ground
truth and lets any judge regenerate the set, at the cost that the renderer
defines the distribution of mess. It cannot contain a form of ambiguity the
author did not think to render. Mitigation: the renderer's patterns are drawn
from records the author handles personally at the shop, and no real customer
data is used anywhere in this project.

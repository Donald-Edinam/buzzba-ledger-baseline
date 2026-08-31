# Buzzba Ledger

Submission for the micro1 Agentic Workflows Hackathon.

A barbershop in Accra takes bookings on WhatsApp, receives payments as MTN MoMo
SMS, and writes the rest in a paper daybook. None of the three agree, and none is
a ledger. This project builds an agent that reads all three and reconstructs the
week's transactions as structured rows, and measures it against a known answer.
The harness, the twelve cases and the numbers are reproducible here. One agent
iteration was built and measured, made the results worse, and was removed. That
is reported in Results and in [CHANGELOG.md](./CHANGELOG.md) rather than buried.

## The user and the bottleneck

Cybah runs a barbershop in Teshie, Accra. He has maybe ten regulars and a steady
flow of walk-ins. His records exist, but they exist in three places.

A customer books on WhatsApp, often in a mix of Twi and English, under a name
that is not their legal name. Some of those messages are bookings. Many are
questions that never become anything. The MoMo SMS arrives separately when they
pay, carrying the legal name in capitals, sometimes abbreviated to an initial and
a surname, with the exact amount and no mention of what was bought. The daybook
is shorthand written at the end of the day, day and month only, no year, and
sometimes no amount because the person had not paid.

To answer "what did I earn this week", he sits down with a phone in one hand and
a notebook in the other and cross-references three piles by hand. It takes the
better part of an evening. Most weeks he does not do it, which means he is
running a business on an estimate.

This is also the reason bookkeeping software does not get adopted here. The
software assumes you will type in your history first. Onboarding asks for months
of back-entry before it returns anything, so the shop owner tries it for two days
and stops. The records already exist. The work is not data entry, it is
reconciliation, and that is the part no product does.

## What the agent produces

One row per completed transaction, validated against a schema in
`src/domain/ledger.ts`:

```json
{"date":"2026-07-07","customer":"Abena Sarpong","services":["wash"],"amount":10,"method":"momo"}
```

Every field is required. Six services with fixed prices, three payment methods
(`cash`, `momo`, `unpaid`).

Here is a real example, taken from `cases/case-01`. Three sources, one person,
one row. The WhatsApp message:

```
[2026-07-07 08:48] sister Abena: Boss, me nua, the usual wai
```

The MoMo SMS:

```
Payment received for GHS 10.00 from A SARPONG on 2026-07-07 15:39. Reference: CYBAH.
```

The daybook line:

```
07/07  sister Abena  wash  10  momo
```

Those resolve to the single row above. "sister Abena" and "A SARPONG" are the
same person. "The usual" means a wash, because that is what she always gets. The
SMS supplies the amount and confirms the payment method. The daybook supplies the
day. No one source is sufficient.

What the shop owner should see is a confirmation queue rather than a finished
ledger, with confident rows shown for a glance and uncertain ones surfaced for a
yes or no. That is the design `docs/EVAL.md` intends to measure as human minutes
per 100 rows. It is not built yet.

## Why this needs an agent

Each difficulty below drove a specific design choice.

The same person appears in three registers, a nickname on WhatsApp, capitals in
the SMS, shorthand in the daybook, and nothing links them except knowing the
person. So the agent's first pass reads only the MoMo SMS and the daybook and
builds a customer roster, grouping every written form under one canonical name,
before it extracts anything. Identity is settled first and separately.

"The usual" only resolves if you know what that customer habitually buys, so the
roster carries habitual services alongside aliases. Eight walk-in names in the
generator have no history, so "the usual" correctly fails for them and the agent
should not invent a service. Amounts go missing in the same way. The daybook
writes a dash where someone has not paid, and the SMS has the exact figure but
never says what was bought, so the agent is given the price list and has to
reconcile a total against a plausible set of services. The baseline gets the same
list, so the comparison measures design rather than prompt quality.

Chatter looks like a booking. "How much be the dye now?" is a question, not a
sale. Precision is a first-class metric for that reason. A system that invents
revenue is worse than one that misses it, because a missed row gets noticed and
an invented row quietly corrupts the books.

## Results

The protocol was fixed in `docs/EVAL.md` before any agent code was written.
Primary metric is exact row accuracy: a row counts only if date, customer,
services, amount and method are all correct. No partial credit.

The comparison below is the matched 7-case subset where both the baseline and the
agent produced predictions, `case-03` through `case-08` and `case-10`, both on
`gemini-3.6-flash`. Both hard cases are missing from it. Full per-case figures,
the reasoning, and the limitations are in [CHANGELOG.md](./CHANGELOG.md).

| | Exact | Precision | Revenue error |
| --- | --- | --- | --- |
| Baseline, one prompt | **64.61** | **73.71** | GHS 510 |
| `agent-v1`, roster then extract | 56.21 | 63.92 | GHS 525 |

**The agent iteration made things worse and was removed.** Exact accuracy fell
8.40 points, precision fell 9.79, customer accuracy fell 4.61. The result is kept
because it is measured. The reading, argued in CHANGELOG.md, is that precision
falling further than accuracy is the signature of confident misassignment: given
a fixed list of names the model picks from the list instead of reading the
sources, and pass 1 cannot see a customer who never paid by MoMo. Memory helps an
agent only when the memory is complete.

The target set in advance was above 90 exact, precision near 100, revenue error
under GHS 20 per week. Neither stage is close, which is what the eval is for.

The per-field breakdown is what drove iteration 1. On the baseline, services,
amounts and methods sit between 92 and 100 almost everywhere, while customer
accuracy is the only field that degrades with difficulty, falling to 53.57 on
`case-12-hard`. Identity resolution is the bottleneck. Iteration 1 attacked it
and failed, which narrows where iteration 2 should look.

The 12-case aggregate in `runs/baseline/_score.json` reads 60.71 exact. **It is
not usable.** That directory now mixes a `case-01` prediction from
`inclusionai/ling-3.0-flash-fin:free` with 11 from `gemini-3.6-flash`, after a
smoke test overwrote part of it. It is named here rather than quietly dropped.

The scorer was validated before being trusted. A perfect run scores 100 across
every metric, and a deliberately degraded run scores 51.77 exact, 66.07
precision, GHS 2035 revenue error. It discriminates rather than flattering
whatever it is given.

## Quick start

```bash
nvm use              # Node 22
npm ci
npm run check        # typecheck, lint, 63 tests
npm run gen:cases    # regenerate all 12 cases from fixed seeds
```

Nothing above needs an API key. Case generation is deterministic and a test
asserts it, so regenerating gives byte-identical input to what produced the
numbers above. To run against a model, set a provider and its key:

```bash
export LLM_PROVIDER=gemini        # anthropic | gemini | groq | openrouter | ollama
export GEMINI_API_KEY=...
npx tsx scripts/run.ts baseline --only case-01    # one case first
npx tsx scripts/run.ts baseline
npx tsx scripts/score.ts runs/baseline
```

Read `docs/PROVIDERS.md` before a full run. It carries the measured daily caps,
which are low enough to matter, and the reasoning token trap that returns empty
output on a successful HTTP 200.

## Agent use

This project was built with a coding agent, and the rules require that to be
disclosed. **Claude Code**, Anthropic's CLI agent running `claude-opus-5`, wrote
the multi-provider LLM support, the thinking-token hardening, the `agent-v1`
runner, the provider presets and quota guard, and most of the documentation. The
work that predates those sessions, meaning the evaluation harness, the scorer and
the baseline runner in commit `8b2d43b`, is not attributable from inside this
repository, and no commit carries a tool trailer that would settle it.

**The automated trajectory capture did not work.** `scripts/run.ts` truncates
`_trajectories.jsonl` at the start of every run and only appends for a case that
completed, so all three run directories hold a 0 byte file and deliverable 4 was
not captured as intended. `runs/*/_run.json` retains the per-case record instead.

The full disclosure is in [docs/agent-evidence/](./docs/agent-evidence/): the
tools and models used, the instructions the agent was given, the milestone
prompts reconstructed from the repository, and an honest account of the
trajectory failure. Two details in it are marked for the author to complete
rather than guessed at.

## What existed before this hackathon

The problem comes from my own work. I handle records for a barbershop in Teshie,
Accra, and the patterns in the case generator are drawn from messages and daybook
lines I deal with personally. I also have an existing SME software project, which
is where the observation about onboarding and back-entry comes from.

All code in this repository was written during the competition. No code was
carried in from the earlier project. What I brought was knowledge of the problem,
not an implementation of it.

## Data and ethics

Every case is synthetic. The generator builds a known-correct ledger from a fixed
seed then degrades it into three messy sources, so ground truth is exact and free
and any judge can regenerate the identical set. No real customer records, names,
or payment messages appear anywhere in this repository.

The cost of that choice is real. The renderer defines the distribution of mess,
and it cannot contain a form of ambiguity I did not think to render, so the
evaluation is only as representative as my own sense of what the mess looks like.
The patterns come from records I handle personally rather than from imagination,
but that remains a real limit on what these numbers prove. Synthetic data is also
why it was acceptable to run on a free tier where prompts may be used for
training, which would not have been acceptable with real records.

## Known limitations

The one agent iteration that was measured made results worse and was removed, so
this repository proves a measurement harness, a baseline, and one honest negative
result. It does not demonstrate an improvement. That is the largest gap.

The agent comparison covers 7 of 12 cases. Both hard cases are missing, and those
are where the baseline scored worst, so the comparison is biased toward the
easier end of the eval.

Run-to-run variance is real and unquantified. Identical reruns of `case-01` on
the same model produced 8 rows and then 9, so a difference of a point or two
between any two numbers here is not evidence of anything.

All measured numbers come from one model on one provider, `gemini-3.6-flash`.
Another model would differ, and the baseline would need re-running before any
comparison, since comparing across models measures the model rather than the
design.

Four separate free-tier provider constraints were hit during development, and
they shaped what could be measured at all. Gemini caps free use at 20 requests
per model per day, which a two pass agent over 12 cases exceeds. OpenRouter's
free model pool was saturated across every attempt. One reasoning model ignored
`reasoning_effort`. Transient 503s cost further runs. See `docs/PROVIDERS.md`.

The confirmation queue is a design, not code, and human minutes per 100 rows has
not been measured.

The trajectory files are empty. The run script truncates the file at start and
only appends on a successful case, so `_trajectories.jsonl` is 0 bytes in every
run directory and deliverable 4 evidence was not captured. The code that builds
trajectories is present and tested. The writing path is what failed.

Baseline precision of 73.71 on the measured subset means roughly one in four
predicted rows is invented or wrong. That is far from acceptable for something a
shop owner would trust.

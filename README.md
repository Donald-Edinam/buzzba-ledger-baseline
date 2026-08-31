# Buzzba Ledger

Submission for the micro1 Agentic Workflows Hackathon.

A barbershop in Accra takes bookings on WhatsApp, receives payments as MTN MoMo
SMS, and writes the rest in a paper daybook. None of the three agree, and none is
a ledger. This project builds an agent that reads all three and reconstructs the
week's transactions as structured rows, and measures it against a known answer.
The harness, the twelve cases and the baseline numbers are reproducible here. The
agent is one iteration in and has no complete measured run yet, which Results
states plainly.

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

**Baseline**, one prompt with all three sources and the price list, on
`gemini-3.6-flash` through the Gemini API. Numbers are from
`runs/baseline/_score.json` and reproduce when re-scored from the committed
predictions.

| Case | Gold rows | Exact | Precision | Revenue error | Customer field |
| --- | --- | --- | --- | --- | --- |
| `case-01` | 8 | 50.00 | 44.44 | GHS 10 | 57.14 |
| `case-02` | 14 | 78.57 | 84.62 | GHS 40 | 91.67 |
| `case-03` | 17 | 58.82 | 58.82 | GHS 0 | 76.92 |
| `case-04` | 17 | 58.82 | 76.92 | GHS 110 | 76.92 |
| `case-05` | 20 | 55.00 | 73.33 | GHS 110 | 73.33 |
| `case-06` | 22 | 72.73 | 84.21 | GHS 120 | 88.89 |
| `case-07` | 30 | 83.33 | 96.15 | GHS 110 | 100.00 |
| `case-08` | 28 | 75.00 | 75.00 | GHS 0 | 95.45 |
| `case-09` | 36 | 63.89 | 79.31 | GHS 250 | 82.14 |
| `case-10` | 35 | 48.57 | 51.52 | GHS 60 | 65.38 |
| `case-11-hard` | 44 | 40.91 | 51.43 | GHS 250 | 62.07 |
| `case-12-hard` | 70 | 42.86 | 47.62 | GHS 210 | 53.57 |

Aggregate over 341 gold rows: **60.71 exact, 68.61 precision, 64.22 F1, GHS 1270
revenue error.**

The target set in advance was above 90 exact, precision near 100, revenue error
under GHS 20 per week. The baseline is nowhere near it, which is the point of
having one.

The last column is the diagnostic. Services, amounts and methods sit between 92
and 100 almost everywhere, while customer accuracy is the only field that
degrades with difficulty, falling to 62.07 on `case-11-hard` and 53.57 on
`case-12-hard`. Identity resolution is the bottleneck, and it is what the first
agent iteration targets.

**Agent, `agent-v1`.** Implemented and unit tested, two passes, roster before
extraction. **There is no complete measured agent run.** The attempt is preserved
at `runs/agent-v1-FAILED-quota-2026-08-30/`. One case of twelve completed before
the Gemini free tier cap of 20 requests per model stopped it, and a two pass
agent needs 24 requests for twelve cases, so it could not fit in a day. One case
is not a result and no accuracy claim is made from it. Later attempts on
OpenRouter were blocked by sustained saturation of the free model pool. The
measured evidence is in `DECISIONS.md`, entries D-004 and D-005.

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

No complete agent run exists, so this repository currently proves a measurement
harness and a baseline, not an improvement. That is the largest gap.

Run-to-run variance has not been measured. Every number comes from a single run
per configuration, and model output varies between runs, so small differences
between cases should not be read as meaningful.

All measured numbers come from one model on one provider, `gemini-3.6-flash`.
Another model would differ, and the baseline would need re-running before any
comparison, since comparing across models measures the model rather than the
design.

Free tier capacity is a real constraint here, not a footnote. Gemini allows 20
requests per model per day, which a two pass agent exceeds, and OpenRouter's free
pool was saturated across every attempt. Both are documented with the observed
error bodies in `docs/PROVIDERS.md`.

The confirmation queue is a design, not code, and human minutes per 100 rows has
not been measured.

Baseline precision of 68.61 means roughly three in ten predicted rows are
invented or wrong. That is far from acceptable for something a shop owner would
trust.

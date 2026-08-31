# Runtime trajectories

Deliverable 4 asks for a trajectory per case. The code to produce one exists and
is tested. The code to persist it is broken, and the files are empty. This page
describes both halves honestly.

## What the system was designed to capture

Every runner returns a list of steps alongside its ledger. From
`src/runners/baseline.ts`:

```ts
export interface TrajectoryStep {
  readonly step: number;
  readonly label: string;
  readonly promptChars: number;
  readonly responseChars: number;
  readonly note: string;
}
```

The baseline emits one step. `agent-v1` emits two, and the shape is meant to show
how the first fed the second. From `src/runners/agent.ts`:

```ts
const trajectory: TrajectoryStep[] = [
  {
    step: 1,
    label: 'roster construction (momo + daybook only)',
    promptChars: ROSTER_SYSTEM.length + rosterUser.length,
    responseChars: rosterRes.text.length,
    note: rosterOut.ok
      ? `built ${rosterOut.roster.length} roster entries, ` +
        `${rosterOut.roster.reduce((n, e) => n + e.aliases.length, 0)} aliases`
      : `roster parse failed: ${rosterOut.reason ?? 'unknown'}; ` +
        `continuing with 0 roster entries`,
  },
  {
    step: 2,
    label: 'extraction with roster in context',
    promptChars: system.length + user.length,
    responseChars: res.text.length,
    note: parsed.ok
      ? `parsed ${parsed.ledger.length} rows against ${rosterOut.roster.length} roster entries`
      : `parse failed: ${parsed.reason ?? 'unknown'}`,
  },
];
```

A written line would have carried the runner name, the model, the case id and
these steps, one JSON object per line.

## What was actually captured

Nothing. Every trajectory file in the repository is 0 bytes:

```
runs/baseline/_trajectories.jsonl                          0 bytes
runs/agent-v1/_trajectories.jsonl                          0 bytes
runs/agent-v1-FAILED-quota-2026-08-30/_trajectories.jsonl  0 bytes
```

There is no sample to include, because no run produced one.

## Why

Two lines of `scripts/run.ts` combine badly. The file is truncated when a run
starts:

```ts
const trajPath = join(outDir, '_trajectories.jsonl');
writeFileSync(trajPath, '');
```

and the append sits inside the `try` block, after `runner.run()` has returned, so
a case that throws never reaches it. A case that fails on a provider error
records its reason in `_run.json` and contributes no trajectory line.

That alone would still have left a partial record. What emptied the files
completely is that truncation happens on every run against a directory, including
a single-case run. The last commands issued against each directory were
`--only case-01` smoke tests during provider debugging, and those cases failed on
quota and rate-limit errors. Each one truncated the file its predecessor had
written and then added nothing.

The fix is to append rather than truncate, or to write the trajectory in the
`catch` branch as well so a failed case still records what it attempted. Neither
was done before time ran out, and doing it now would not recover the runs that
have already happened.

## What survives instead

The per-case record in `runs/*/_run.json` was written on both the success and the
failure paths, so it still holds the case id, row count, parse status, failure
reason, LLM call count, token counts and elapsed time for every case attempted.
That is the closest thing to a trajectory this project actually retained, and it
is what the numbers in CHANGELOG.md were computed from.

One trajectory note was observed directly in terminal output during a run and is
quoted in CHANGELOG.md, that `case-01` built 7 roster entries and 8 aliases while
the agent still emitted "Kojo" rather than "Kojo Asante". That observation is
evidence for the iteration 1 analysis, and it is not backed by a file in this
repository.

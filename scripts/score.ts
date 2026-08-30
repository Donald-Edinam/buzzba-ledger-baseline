/**
 * Usage: npx tsx scripts/score.ts runs/baseline
 *
 * Expects one <case-id>.json per case in the run directory, each a Ledger.
 * Prints a per-case table plus the aggregate row you paste into the changelog.
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LedgerSchema } from '../src/domain/ledger.js';
import { aggregate, scoreCase, type CaseScore } from '../src/eval/score.js';

const runDir = process.argv[2];
if (!runDir) {
  console.error('usage: tsx scripts/score.ts <run-directory>');
  process.exit(2);
}

const caseIds = readdirSync('cases').sort();
const scores: CaseScore[] = [];
const missing: string[] = [];

for (const id of caseIds) {
  const predPath = join(runDir, `${id}.json`);
  if (!existsSync(predPath)) {
    missing.push(id);
    continue;
  }
  const gold = LedgerSchema.parse(JSON.parse(readFileSync(join('cases', id, 'gold.json'), 'utf8')));
  const parsed = LedgerSchema.safeParse(JSON.parse(readFileSync(predPath, 'utf8')));
  if (!parsed.success) {
    // A run that emits malformed output scores zero. That is a real result.
    console.error(`${id}: prediction failed schema validation, scoring as empty`);
    scores.push(scoreCase(id, gold, []));
    continue;
  }
  scores.push(scoreCase(id, gold, parsed.data));
}

console.log('case            rows  exact%  prec%   f1     revErr(GHS)  cust%  svc%   amt%   meth%');
for (const s of scores) {
  const f = s.fieldAccuracy;
  console.log(
    `${s.caseId.padEnd(15)} ${String(s.goldRows).padStart(4)}  ${String(s.exactRowAccuracy).padStart(6)}  ${String(s.precision).padStart(6)} ${String(s.f1).padStart(6)}  ${String(s.revenueErrorGhs).padStart(11)}  ${String(f.customer).padStart(5)}  ${String(f.services).padStart(5)}  ${String(f.amount).padStart(5)}  ${String(f.method).padStart(5)}`,
  );
}

const agg = aggregate(scores);
console.log('\nAGGREGATE', JSON.stringify(agg));
if (missing.length) console.log(`missing predictions: ${missing.join(', ')}`);

writeFileSync(join(runDir, '_score.json'), JSON.stringify({ aggregate: agg, cases: scores }, null, 2) + '\n');
console.log(`\nwrote ${join(runDir, '_score.json')}`);

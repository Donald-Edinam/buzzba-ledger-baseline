/**
 * Usage:
 *   ANTHROPIC_API_KEY=... npx tsx scripts/run.ts baseline
 *   LLM_PROVIDER=groq GROQ_API_KEY=... npx tsx scripts/run.ts baseline --only case-01
 *
 * The provider and model come from the environment via src/llm/factory.ts; see
 * docs/PROVIDERS.md.
 *
 * Writes runs/<name>/<case-id>.json          predicted ledgers, scored by scripts/score.ts
 *        runs/<name>/_trajectories.jsonl     deliverable 4
 *        runs/<name>/_run.json               tokens, wall time, per-case status
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { CaseSchema } from '../src/domain/ledger.js';
import type { LlmClient } from '../src/llm/client.js';
import { createClient, describeProvider, requestBudgetWarning } from '../src/llm/factory.js';
import { agentRunner } from '../src/runners/agent.js';
import { baselineRunner, type Runner } from '../src/runners/baseline.js';

try {
  process.loadEnvFile();
} catch {
  // .env file is optional
}

const RUNNERS: Record<string, Runner> = { baseline: baselineRunner, agent: agentRunner };

const name = process.argv[2] ?? '';
const runner = RUNNERS[name];
if (!runner) {
  console.error(`usage: tsx scripts/run.ts <${Object.keys(RUNNERS).join('|')}> [--only case-id]`);
  process.exit(2);
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

// A misconfigured provider is a setup mistake, not a run: fail before writing anything.
let client: LlmClient;
let provider: Record<string, string>;
try {
  client = createClient();
  provider = describeProvider();
} catch (e) {
  console.error((e as Error).message);
  process.exit(2);
}
const model = provider['model'] ?? '';
console.log(`provider=${provider['provider'] ?? ''} model=${model}`);

const outDir = join('runs', runner.name);
mkdirSync(outDir, { recursive: true });
const trajPath = join(outDir, '_trajectories.jsonl');
writeFileSync(trajPath, '');

const caseIds = readdirSync('cases').filter((id) => !only || id === only).sort();

// Preflight. A run that cannot fit inside the provider's daily allowance should
// say so before the first request, not seventeen minutes in.
const budgetWarning = requestBudgetWarning(provider['provider'] ?? '', runner.name, caseIds.length);
if (budgetWarning) console.error(budgetWarning);

const summary: Record<string, unknown>[] = [];
let inTok = 0;
let outTok = 0;
const wallStart = Date.now();

for (const id of caseIds) {
  const c = CaseSchema.parse(JSON.parse(readFileSync(join('cases', id, 'sources.json'), 'utf8')));
  process.stdout.write(`${id} ... `);
  try {
    const result = await runner.run(c, client);
    writeFileSync(join(outDir, `${id}.json`), JSON.stringify(result.ledger, null, 2) + '\n');
    appendFileSync(
      trajPath,
      JSON.stringify({ runner: runner.name, model, caseId: id, steps: result.trajectory }) + '\n',
    );
    inTok += result.inputTokens;
    outTok += result.outputTokens;
    summary.push({
      caseId: id,
      rows: result.ledger.length,
      parsedOk: result.parsedOk,
      parseReason: result.parseReason ?? null,
      llmCalls: result.llmCalls,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      ms: result.ms,
    });
    console.log(`${result.ledger.length} rows, ${result.ms}ms${result.parsedOk ? '' : ' (PARSE FAILED)'}`);
  } catch (e) {
    // A crashed case is a result, not an excuse to abandon the run.
    console.log(`ERROR ${(e as Error).message}`);
    writeFileSync(join(outDir, `${id}.json`), '[]\n');
    summary.push({ caseId: id, rows: 0, parsedOk: false, parseReason: (e as Error).message });
  }
}

const wallMs = Date.now() - wallStart;
writeFileSync(
  join(outDir, '_run.json'),
  JSON.stringify({ runner: runner.name, ...provider, wallMs, inputTokens: inTok, outputTokens: outTok, cases: summary }, null, 2) + '\n',
);
console.log(`\n${caseIds.length} cases in ${(wallMs / 1000).toFixed(1)}s, ${inTok} in / ${outTok} out tokens`);
console.log(`next: npx tsx scripts/score.ts ${outDir}`);

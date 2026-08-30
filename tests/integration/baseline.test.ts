import { describe, it, expect } from 'vitest';
import { baselineRunner } from '@/runners/baseline.js';
import { StubClient } from '@/llm/client.js';
import { generateCase, CASE_SPECS } from '@/generate/generate.js';

describe('baselineRunner', () => {
  it('produces a scoreable ledger and a trajectory step', async () => {
    const { case: c, gold } = generateCase(CASE_SPECS[0]!);
    const stub = new StubClient(JSON.stringify(gold));
    const result = await baselineRunner.run(c, stub);
    expect(result.parsedOk).toBe(true);
    expect(result.ledger).toHaveLength(gold.length);
    expect(result.trajectory).toHaveLength(1);
    expect(result.llmCalls).toBe(1);
  });

  it('records a parse failure instead of throwing', async () => {
    const { case: c } = generateCase(CASE_SPECS[0]!);
    const result = await baselineRunner.run(c, new StubClient('sorry, I cannot help with that'));
    expect(result.parsedOk).toBe(false);
    expect(result.ledger).toEqual([]);
    expect(result.trajectory[0]?.note).toContain('parse failed');
  });
});

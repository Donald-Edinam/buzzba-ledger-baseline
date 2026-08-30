import { describe, it, expect } from 'vitest';
import { agentRunner } from '@/runners/agent.js';
import { StubClient, type LlmCall, type LlmClient, type LlmResponse } from '@/llm/client.js';
import { generateCase, CASE_SPECS } from '@/generate/generate.js';

/**
 * StubClient answers every call identically, which cannot express a two-pass
 * run where the passes expect different shapes. This queues replies instead,
 * and records what each pass was asked, so the roster can be checked as it
 * actually reaches pass 2. Lives here rather than in src/llm/client.ts: it is
 * a fixture, not part of the shipped client surface.
 */
class SequenceStubClient implements LlmClient {
  readonly model = 'sequence-stub';
  readonly calls: LlmCall[] = [];
  constructor(private readonly replies: string[]) {}

  async complete(call: LlmCall): Promise<LlmResponse> {
    this.calls.push(call);
    const reply = this.replies[this.calls.length - 1] ?? '';
    return {
      text: reply,
      usage: { inputTokens: 10, outputTokens: 5 },
      ms: 1,
      attempts: 1,
      finishReason: 'stop',
    };
  }
}

const ROSTER = JSON.stringify([
  { canonical: 'Kojo Asante', aliases: ['Kojo', 'KOJO ASANTE'] },
  { canonical: 'Ato Quaye', aliases: ['ATO QUAYE'] },
]);

describe('agentRunner', () => {
  it('runs both passes and returns a scoreable ledger', async () => {
    const { case: c, gold } = generateCase(CASE_SPECS[0]!);
    const client = new SequenceStubClient([ROSTER, JSON.stringify(gold)]);

    const result = await agentRunner.run(c, client);

    expect(result.parsedOk).toBe(true);
    expect(result.ledger).toHaveLength(gold.length);
    expect(result.llmCalls).toBe(2);
    expect(result.trajectory).toHaveLength(2);
    expect(client.calls).toHaveLength(2);
  });

  it('reports the roster size in the pass-1 trajectory note', async () => {
    const { case: c, gold } = generateCase(CASE_SPECS[0]!);
    const result = await agentRunner.run(c, new SequenceStubClient([ROSTER, JSON.stringify(gold)]));

    expect(result.trajectory[0]?.note).toContain('2 roster entries');
    expect(result.trajectory[1]?.note).toContain('rows');
  });

  it('feeds pass 1 only the momo and daybook sources', async () => {
    const { case: c, gold } = generateCase(CASE_SPECS[0]!);
    const client = new SequenceStubClient([ROSTER, JSON.stringify(gold)]);

    await agentRunner.run(c, client);

    // Withholding the WhatsApp thread is the design, so it is worth pinning.
    expect(client.calls[0]?.user).toContain('MOMO SMS');
    expect(client.calls[0]?.user).toContain('DAYBOOK');
    expect(client.calls[0]?.user).not.toContain('WHATSAPP');
    expect(client.calls[1]?.user).toContain('WHATSAPP');
  });

  it('carries the built roster into the pass-2 prompt', async () => {
    const { case: c, gold } = generateCase(CASE_SPECS[0]!);
    const client = new SequenceStubClient([ROSTER, JSON.stringify(gold)]);

    await agentRunner.run(c, client);

    const system = client.calls[1]?.system ?? '';
    expect(system).toContain('KNOWN CUSTOMERS');
    expect(system).toContain('Kojo Asante');
    expect(system).toContain('ATO QUAYE');
  });

  it('degrades to an empty roster on a malformed pass-1 reply, without throwing', async () => {
    const { case: c, gold } = generateCase(CASE_SPECS[0]!);
    const client = new SequenceStubClient(['sorry, I cannot help with that', JSON.stringify(gold)]);

    const result = await agentRunner.run(c, client);

    // The run must still produce a ledger: a failed roster is a weaker agent,
    // not a dead case.
    expect(result.parsedOk).toBe(true);
    expect(result.ledger).toHaveLength(gold.length);
    expect(result.llmCalls).toBe(2);
    expect(result.trajectory[0]?.note).toContain('roster parse failed');
    expect(result.trajectory[0]?.note).toContain('0 roster entries');
    expect(client.calls[1]?.system).toContain('no roster available');
  });

  it('records a pass-2 parse failure instead of throwing', async () => {
    const { case: c } = generateCase(CASE_SPECS[0]!);
    const result = await agentRunner.run(c, new SequenceStubClient([ROSTER, 'no ledger here']));

    expect(result.parsedOk).toBe(false);
    expect(result.ledger).toEqual([]);
    expect(result.trajectory[1]?.note).toContain('parse failed');
  });

  it('sums tokens across both passes', async () => {
    const { case: c, gold } = generateCase(CASE_SPECS[0]!);
    const result = await agentRunner.run(c, new SequenceStubClient([ROSTER, JSON.stringify(gold)]));

    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(10);
  });

  it('still completes when one canned reply serves both passes', async () => {
    // StubClient answers identically every time: the roster parse fails on a
    // ledger-shaped reply, and the run survives it.
    const { case: c, gold } = generateCase(CASE_SPECS[0]!);
    const result = await agentRunner.run(c, new StubClient(JSON.stringify(gold)));

    expect(result.llmCalls).toBe(2);
    expect(result.parsedOk).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { CASE_SPECS, generateCase } from '@/generate/generate.js';
import { LedgerSchema } from '@/domain/ledger.js';

describe('case generation', () => {
  it('is deterministic for a given seed', () => {
    const a = generateCase(CASE_SPECS[0]!);
    const b = generateCase(CASE_SPECS[0]!);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces gold ledgers that satisfy the schema', () => {
    for (const spec of CASE_SPECS) {
      const { gold } = generateCase(spec);
      expect(() => LedgerSchema.parse(gold)).not.toThrow();
      expect(gold.length).toBeGreaterThan(0);
    }
  });

  it('makes every gold row recoverable from at least one source', () => {
    const { case: c, gold } = generateCase(CASE_SPECS[3]!);
    const blob = [...c.sources.whatsapp, ...c.sources.momo_sms, ...c.sources.daybook].join('\n').toLowerCase();
    for (const row of gold) {
      const first = row.customer.split(' ')[0]!.toLowerCase();
      const found = blob.includes(first) || blob.includes(String(row.amount));
      expect(found, `row for ${row.customer} unrecoverable`).toBe(true);
    }
  });
});

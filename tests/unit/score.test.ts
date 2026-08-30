import { describe, it, expect } from 'vitest';
import { scoreCase } from '@/eval/score.js';
import type { Ledger } from '@/domain/ledger.js';

const gold: Ledger = [
  { date: '2026-07-06', customer: 'Kwame Mensah', services: ['haircut', 'beard_trim'], amount: 45, method: 'momo' },
  { date: '2026-07-06', customer: 'Kojo Asante', services: ['haircut'], amount: 30, method: 'cash' },
];

describe('scoreCase', () => {
  it('gives 100 percent for an identical ledger', () => {
    const s = scoreCase('t', gold, gold);
    expect(s.exactRowAccuracy).toBe(100);
    expect(s.revenueErrorGhs).toBe(0);
  });

  it('does not give row credit when one field is wrong', () => {
    const wrong: Ledger = [{ ...gold[0]!, amount: 40 }, gold[1]!];
    const s = scoreCase('t', gold, wrong);
    expect(s.exactRowAccuracy).toBe(50);
    expect(s.fieldAccuracy.customer).toBe(100);
    expect(s.fieldAccuracy.amount).toBe(50);
  });

  it('penalises invented rows through precision', () => {
    const extra: Ledger = [...gold, { date: '2026-07-06', customer: 'Ghost', services: ['wash'], amount: 10, method: 'cash' }];
    const s = scoreCase('t', gold, extra);
    expect(s.recall).toBe(100);
    expect(s.precision).toBeLessThan(100);
    expect(s.hallucinatedRows).toBe(1);
  });
});

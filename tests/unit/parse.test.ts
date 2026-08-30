import { describe, it, expect } from 'vitest';
import { parseLedger } from '@/runners/parse.js';

const row = '{"date":"2026-07-06","customer":"Kwame Mensah","services":["haircut"],"amount":30,"method":"cash"}';

describe('parseLedger', () => {
  it('reads a bare JSON array', () => {
    const r = parseLedger(`[${row}]`);
    expect(r.ok).toBe(true);
    expect(r.ledger).toHaveLength(1);
  });

  it('recovers an array wrapped in a code fence and prose', () => {
    const r = parseLedger('Here is the ledger:\n```json\n[' + row + ']\n```\nLet me know.');
    expect(r.ok).toBe(true);
    expect(r.ledger[0]?.customer).toBe('Kwame Mensah');
  });

  it('fails loudly on an invalid service rather than dropping the row', () => {
    const r = parseLedger('[{"date":"2026-07-06","customer":"X","services":["massage"],"amount":30,"method":"cash"}]');
    expect(r.ok).toBe(false);
    expect(r.ledger).toHaveLength(0);
  });

  it('fails on prose with no array', () => {
    const r = parseLedger('I could not determine the transactions.');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('no JSON array');
  });
});

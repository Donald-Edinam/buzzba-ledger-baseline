import { describe, it, expect } from 'vitest';
import { ok, err, attempt, unwrap, AppError } from '@/core/result.js';

describe('Result', () => {
  it('carries a success value', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(unwrap(r)).toBe(42);
  });

  it('carries a failure', () => {
    const r = err(new AppError('NOT_FOUND', 'missing'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
  });

  it('converts a thrown exception into a typed failure', async () => {
    const r = await attempt(() => {
      throw new Error('boom');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INTERNAL');
      expect(r.error.message).toBe('boom');
    }
  });
});

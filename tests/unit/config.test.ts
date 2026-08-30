import { describe, it, expect } from 'vitest';
import { loadConfig } from '@/core/config.js';
import { AppError } from '@/core/result.js';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig({});
    expect(c.NODE_ENV).toBe('development');
    expect(c.PORT).toBe(3000);
  });

  it('rejects an invalid value at boot', () => {
    expect(() => loadConfig({ PORT: 'not-a-number' })).toThrow(AppError);
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { OpenAICompatClient } from '@/llm/openai-compat.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Body {
  max_tokens: number;
  reasoning_effort?: string;
  messages: { role: string; content: string }[];
}

/** Captures the outgoing request and replies with a canned completion. No network. */
function stubFetch(payload: unknown, status = 200): { body: () => Body } {
  let captured = '';
  globalThis.fetch = vi.fn(async (_url: unknown, init?: unknown) => {
    captured = String((init as { body?: string } | undefined)?.body ?? '');
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { body: () => JSON.parse(captured) as Body };
}

const ok = (content: string, finish = 'stop') => ({
  choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: 10, completion_tokens: 4 },
});

const call = { system: 'sys', user: 'usr' };

describe('OpenAICompatClient truncation', () => {
  it('throws TRUNCATED when the model spends its budget on thinking', async () => {
    // The verified Gemini 3.x failure: finish_reason length, empty content, no output tokens.
    stubFetch({
      choices: [{ message: { content: '' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 900, completion_tokens: 0 },
    });
    const client = new OpenAICompatClient('gemini-3.6-flash', 'k', 'http://x/v1');

    await expect(client.complete({ ...call, maxTokens: 50 })).rejects.toThrow(/^TRUNCATED:/);
  });

  it('reports the token budget it hit, so the cause is actionable', async () => {
    stubFetch({
      choices: [{ finish_reason: 'length' }],
      usage: { completion_tokens: 0 },
    });
    const client = new OpenAICompatClient('m', 'k', 'http://x/v1');

    await expect(client.complete({ ...call, maxTokens: 50 })).rejects.toThrow(
      /completion_tokens=0.*max_tokens=50/,
    );
  });

  it('does not retry a truncation, which would only truncate again', async () => {
    stubFetch({ choices: [{ finish_reason: 'length' }], usage: {} });
    const client = new OpenAICompatClient('m', 'k', 'http://x/v1');

    await expect(client.complete(call)).rejects.toThrow(/^TRUNCATED:/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('OpenAICompatClient reasoning_effort', () => {
  it('sends the field when it is configured', async () => {
    const req = stubFetch(ok('[]'));
    await new OpenAICompatClient('m', 'k', 'http://x/v1', 5, 180_000, 'high').complete(call);

    expect(req.body().reasoning_effort).toBe('high');
  });

  it('omits the key entirely when unset, rather than sending null', async () => {
    const req = stubFetch(ok('[]'));
    await new OpenAICompatClient('m', 'k', 'http://x/v1').complete(call);

    expect('reasoning_effort' in req.body()).toBe(false);
  });

  it('omits the key for an empty string too', async () => {
    const req = stubFetch(ok('[]'));
    await new OpenAICompatClient('m', 'k', 'http://x/v1', 5, 180_000, '').complete(call);

    expect('reasoning_effort' in req.body()).toBe(false);
  });
});

describe('OpenAICompatClient response', () => {
  it('populates finishReason from the provider', async () => {
    stubFetch(ok('[]', 'stop'));
    const res = await new OpenAICompatClient('m', 'k', 'http://x/v1').complete(call);

    expect(res.finishReason).toBe('stop');
    expect(res.text).toBe('[]');
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 4 });
  });

  it('defaults max_tokens to 16000, enough for the 70-row hard case', async () => {
    const req = stubFetch(ok('[]'));
    await new OpenAICompatClient('m', 'k', 'http://x/v1').complete(call);

    expect(req.body().max_tokens).toBe(16000);
  });
});

/** The exact 429 Google returned on 2026-08-30, trimmed to the parts that matter. */
const GEMINI_PER_DAY_429 = JSON.stringify([
  {
    error: {
      code: 429,
      message: 'You exceeded your current quota. Please retry in 20.564439427s.',
      status: 'RESOURCE_EXHAUSTED',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.Help', links: [] },
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
              quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
              quotaDimensions: { location: 'global', model: 'gemini-3.6-flash' },
              quotaValue: '20',
            },
          ],
        },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '20s' },
      ],
    },
  },
]);

/** A per-minute throttle: same status, no PerDay quotaId. Worth waiting out. */
const PER_MINUTE_429 = JSON.stringify({
  error: { code: 429, message: 'Rate limit exceeded, please slow down', status: 'RESOURCE_EXHAUSTED' },
});

function stub429(body: string): void {
  globalThis.fetch = vi.fn(async () =>
    new Response(body, { status: 429, headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

describe('OpenAICompatClient quota handling', () => {
  it('throws QUOTA_EXHAUSTED on a PerDay quotaId without retrying', async () => {
    stub429(GEMINI_PER_DAY_429);
    const client = new OpenAICompatClient('gemini-3.6-flash', 'k', 'http://x/v1', 5, 180_000, 'low', 'gemini');

    await expect(client.complete(call)).rejects.toThrow(/^QUOTA_EXHAUSTED:/);
    // The whole point: no backoff loop against a cap that resets tomorrow.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('names the quotaId and quotaValue so the run log explains itself', async () => {
    stub429(GEMINI_PER_DAY_429);
    const client = new OpenAICompatClient('m', 'k', 'http://x/v1', 5, 180_000, 'low', 'gemini');

    await expect(client.complete(call)).rejects.toThrow(
      /GenerateRequestsPerDayPerProjectPerModel-FreeTier.*quotaValue=20/,
    );
  });

  it('refuses to retry an unexplained 429 on openrouter, where rejects burn daily quota', async () => {
    stub429(PER_MINUTE_429); // nothing marks it transient, so provider policy wins
    const client = new OpenAICompatClient('m', 'k', 'http://x/v1', 5, 180_000, 'low', 'openrouter');

    await expect(client.complete(call)).rejects.toThrow(/^QUOTA_EXHAUSTED:/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('DOES retry an openrouter 429 that says the upstream pool is busy', async () => {
    // Verbatim from OpenRouter on 2026-08-30. This is a queue being busy, not
    // an allowance being spent, and it asks to be retried.
    stub429(
      JSON.stringify({
        error: {
          message: 'Provider returned error',
          code: 429,
          metadata: {
            raw: 'google/gemma-4-31b-it:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits',
          },
        },
      }),
    );
    const client = new OpenAICompatClient('m', 'k', 'http://x/v1', 2, 180_000, 'low', 'openrouter');

    vi.useFakeTimers();
    try {
      const pending = client.complete(call);
      const assertion = expect(pending).rejects.toThrow(/LLM call failed: 429/);
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('still treats a PerDay quotaId as terminal even on a transient-looking body', async () => {
    stub429(GEMINI_PER_DAY_429);
    const client = new OpenAICompatClient('m', 'k', 'http://x/v1', 5, 180_000, 'low', 'openrouter');

    await expect(client.complete(call)).rejects.toThrow(/quotaId=/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('still retries a genuine per-minute 429 on gemini', async () => {
    stub429(PER_MINUTE_429);
    const client = new OpenAICompatClient('m', 'k', 'http://x/v1', 2, 180_000, 'low', 'gemini');

    vi.useFakeTimers();
    try {
      const pending = client.complete(call);
      const assertion = expect(pending).rejects.toThrow(/LLM call failed: 429/);
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries when no provider is given and the body is not a daily cap', async () => {
    stub429(PER_MINUTE_429);
    const client = new OpenAICompatClient('m', 'k', 'http://x/v1', 2);

    vi.useFakeTimers();
    try {
      const pending = client.complete(call);
      const assertion = expect(pending).rejects.toThrow(/LLM call failed/);
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('survives a 429 body that is not JSON at all', async () => {
    stub429('<html>429 Too Many Requests</html>');
    const client = new OpenAICompatClient('m', 'k', 'http://x/v1', 1, 180_000, 'low', 'gemini');

    await expect(client.complete(call)).rejects.toThrow(/LLM call failed: 429/);
  });
});

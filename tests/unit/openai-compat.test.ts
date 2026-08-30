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

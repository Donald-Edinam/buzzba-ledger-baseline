import { describe, it, expect, afterEach, vi } from 'vitest';
import { AnthropicClient } from '@/llm/client.js';
import { OpenAICompatClient } from '@/llm/openai-compat.js';
import { createClient, describeProvider, requestBudgetWarning, PRESETS } from '@/llm/factory.js';

// Every case passes an env object explicitly; process.env is never touched, so
// the suite behaves the same on a machine that has real keys exported.
describe('createClient', () => {
  it('defaults to anthropic when LLM_PROVIDER is unset', () => {
    const client = createClient({ ANTHROPIC_API_KEY: 'k' });
    expect(client).toBeInstanceOf(AnthropicClient);
    expect(client.model).toBe(PRESETS['anthropic']?.defaultModel);
  });

  it('builds an OpenAI-compat client for gemini', () => {
    const client = createClient({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' });
    expect(client).toBeInstanceOf(OpenAICompatClient);
    expect(client.model).toBe('gemini-3.6-flash');
  });

  it('lets MODEL override the preset default', () => {
    const client = createClient({ LLM_PROVIDER: 'groq', GROQ_API_KEY: 'k', MODEL: 'llama-3.1-8b-instant' });
    expect(client.model).toBe('llama-3.1-8b-instant');
  });

  it('needs no key for ollama, which runs locally', () => {
    const client = createClient({ LLM_PROVIDER: 'ollama' });
    expect(client).toBeInstanceOf(OpenAICompatClient);
  });

  it('throws naming the exact env var when the key is missing', () => {
    expect(() => createClient({ LLM_PROVIDER: 'groq' })).toThrow(/GROQ_API_KEY/);
    expect(() => createClient({ LLM_PROVIDER: 'groq' })).toThrow(/groq/);
  });

  it('throws listing the valid options for an unknown provider', () => {
    expect(() => createClient({ LLM_PROVIDER: 'mistral' })).toThrow(/mistral/);
    expect(() => createClient({ LLM_PROVIDER: 'mistral' })).toThrow(/openrouter/);
  });
});

describe('describeProvider', () => {
  it('reports the provider, model and base url that a run will use', () => {
    expect(describeProvider({ LLM_PROVIDER: 'gemini' })).toEqual({
      provider: 'gemini',
      model: 'gemini-3.6-flash',
      baseUrl: PRESETS['gemini']?.baseUrl,
      reasoningEffort: 'low',
    });
  });

  it('reports the anthropic default and an overridden model', () => {
    const d = describeProvider({ MODEL: 'claude-opus-5' });
    expect(d['provider']).toBe('anthropic');
    expect(d['model']).toBe('claude-opus-5');
  });
});

describe('reasoning effort', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** Captures the outgoing body so the knob is checked on the wire, not just in a field. */
  function stubFetch(): () => { reasoning_effort?: string } {
    let captured = '';
    globalThis.fetch = vi.fn(async (_url: unknown, init?: unknown) => {
      captured = String((init as { body?: string } | undefined)?.body ?? '');
      // Carries both wire shapes, so the same stub serves either client.
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '[]' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, input_tokens: 1, output_tokens: 1 },
          content: [{ type: 'text', text: '[]' }],
          stop_reason: 'end_turn',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    return () => JSON.parse(captured) as { reasoning_effort?: string };
  }

  it('defaults REASONING_EFFORT to low', () => {
    expect(describeProvider({})['reasoningEffort']).toBe('low');
    expect(describeProvider({ LLM_PROVIDER: 'groq' })['reasoningEffort']).toBe('low');
  });

  it('records an override', () => {
    expect(describeProvider({ REASONING_EFFORT: 'high' })['reasoningEffort']).toBe('high');
  });

  it('passes the default through to the request body', async () => {
    const body = stubFetch();
    await createClient({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }).complete({
      system: 's',
      user: 'u',
    });
    expect(body().reasoning_effort).toBe('low');
  });

  it('passes an override through to the request body', async () => {
    const body = stubFetch();
    await createClient({
      LLM_PROVIDER: 'groq',
      GROQ_API_KEY: 'k',
      REASONING_EFFORT: 'medium',
    }).complete({ system: 's', user: 'u' });
    expect(body().reasoning_effort).toBe('medium');
  });

  it('never sends reasoning_effort to anthropic, which uses a different shape', async () => {
    const body = stubFetch();
    await createClient({ ANTHROPIC_API_KEY: 'k', REASONING_EFFORT: 'high' }).complete({
      system: 's',
      user: 'u',
    });
    expect('reasoning_effort' in body()).toBe(false);
  });
});

describe('LLM_TIMEOUT_MS', () => {
  it('rejects a value that is not a positive number', () => {
    expect(() => createClient({ ANTHROPIC_API_KEY: 'k', LLM_TIMEOUT_MS: 'soon' })).toThrow(
      /LLM_TIMEOUT_MS/,
    );
  });
});

describe('requestBudgetWarning', () => {
  it('warns when a two-pass agent run exceeds gemini\'s measured 20/day', () => {
    // The exact case that burned 17 minutes on 2026-08-30: 12 cases x 2 = 24 > 20.
    const w = requestBudgetWarning('gemini', 'agent-v1', 12);
    expect(w).toContain('24 requests');
    expect(w).toContain('20 per day');
    expect(w).toContain('gemini');
  });

  it('stays quiet when the run fits', () => {
    // Baseline is one call per case: 12 <= 20.
    expect(requestBudgetWarning('gemini', 'baseline', 12)).toBeNull();
  });

  it('warns on openrouter past 50/day', () => {
    expect(requestBudgetWarning('openrouter', 'agent-v1', 26)).toContain('52 requests');
    expect(requestBudgetWarning('openrouter', 'agent-v1', 25)).toBeNull();
  });

  it('stays quiet where no cap has been measured, rather than guessing one', () => {
    expect(requestBudgetWarning('anthropic', 'agent-v1', 1000)).toBeNull();
    expect(requestBudgetWarning('groq', 'agent-v1', 1000)).toBeNull();
    expect(requestBudgetWarning('ollama', 'agent-v1', 1000)).toBeNull();
  });

  it('assumes one call per case for an unknown runner', () => {
    expect(requestBudgetWarning('gemini', 'agent-v9', 21)).toContain('21 requests');
    expect(requestBudgetWarning('gemini', 'agent-v9', 20)).toBeNull();
  });

  it('ignores an unknown provider', () => {
    expect(requestBudgetWarning('mistral', 'agent-v1', 1000)).toBeNull();
  });
});

describe('preset caps', () => {
  it('records the measured caps and leaves unmeasured ones null', () => {
    // null means UNMEASURED, not unlimited. Populated only from an observed 429.
    expect(PRESETS['gemini']?.dailyRequestCap).toBe(20);
    expect(PRESETS['openrouter']?.dailyRequestCap).toBe(50);
    expect(PRESETS['anthropic']?.dailyRequestCap).toBeNull();
    expect(PRESETS['groq']?.dailyRequestCap).toBeNull();
  });

  it('pins the verified openrouter model id', () => {
    // Verified against openrouter.ai/api/v1/models on 2026-08-30.
    expect(PRESETS['openrouter']?.defaultModel).toBe('google/gemma-4-31b-it:free');
  });
});

import { describe, it, expect } from 'vitest';
import { AnthropicClient } from '@/llm/client.js';
import { OpenAICompatClient } from '@/llm/openai-compat.js';
import { createClient, describeProvider, PRESETS } from '@/llm/factory.js';

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
    expect(client.model).toBe('gemini-2.5-flash');
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
      model: 'gemini-2.5-flash',
      baseUrl: PRESETS['gemini']?.baseUrl,
    });
  });

  it('reports the anthropic default and an overridden model', () => {
    const d = describeProvider({ MODEL: 'claude-opus-5' });
    expect(d['provider']).toBe('anthropic');
    expect(d['model']).toBe('claude-opus-5');
  });
});

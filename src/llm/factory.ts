import { AnthropicClient, type LlmClient } from './client.js';
import { OpenAICompatClient } from './openai-compat.js';

export interface ProviderPreset {
  readonly baseUrl: string;
  readonly keyEnv: string;
  readonly defaultModel: string;
  readonly note: string;
}

/**
 * The providers a run may use. Every entry except anthropic speaks the OpenAI
 * chat-completions shape, so adding one is a row here and nothing else.
 *
 * Notes are what they cost and where they bite, not marketing. Free-tier limits
 * and model names change without warning; check before committing to a run.
 */
export const PRESETS: Record<string, ProviderPreset> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    keyEnv: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-5',
    note: 'Paid per token, no free tier. Strongest results and the reference configuration for this project; a full 12-case run is cents, not dollars.',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyEnv: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
    note: 'Free tier with per-minute and per-day request caps; expect 429s on a burst, which the client waits out. Google may use free-tier prompts to improve their models, so only send synthetic data.',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    note: 'Free tier, very fast inference, but tight per-minute request and token limits and a habit of retiring model names. Open-weight models follow strict JSON less reliably than Claude, so expect more parse failures.',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    note: 'One key across many models. The `:free` variants cost nothing but are heavily rate limited and can queue or fail under load; drop the suffix to pay for a reliable slot.',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    keyEnv: 'OLLAMA_API_KEY',
    defaultModel: 'qwen2.5:14b',
    note: 'Fully local, free, no rate limits, needs no key. Requires `ollama serve` and the model pulled first; quality on a 14B model is well below the hosted options and long prompts are slow on CPU.',
  },
};

function preset(provider: string): ProviderPreset {
  const found = PRESETS[provider];
  if (!found) {
    throw new Error(
      `Unknown LLM_PROVIDER "${provider}". Valid options: ${Object.keys(PRESETS).join(', ')}`,
    );
  }
  return found;
}

/**
 * The only place in src/llm that reads the environment. Clients take their
 * configuration as constructor arguments so they stay testable and so a run's
 * provider is decided once, here.
 */
export function createClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const provider = env['LLM_PROVIDER'] ?? 'anthropic';
  const p = preset(provider);
  const model = env['MODEL'] ?? p.defaultModel;

  // Ollama runs locally and ignores the header, but the OpenAI shape requires one.
  const apiKey = provider === 'ollama' ? (env[p.keyEnv] ?? 'local') : env[p.keyEnv];
  if (!apiKey) {
    throw new Error(`${p.keyEnv} is not set (required for LLM_PROVIDER=${provider})`);
  }

  const baseUrl = env['LLM_BASE_URL'] ?? p.baseUrl;
  return provider === 'anthropic'
    ? new AnthropicClient(model, apiKey)
    : new OpenAICompatClient(model, apiKey, baseUrl);
}

/** Stamped into runs/<name>/_run.json so every number is traceable to what produced it. */
export function describeProvider(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const provider = env['LLM_PROVIDER'] ?? 'anthropic';
  const p = preset(provider);
  return {
    provider,
    model: env['MODEL'] ?? p.defaultModel,
    baseUrl: env['LLM_BASE_URL'] ?? p.baseUrl,
  };
}

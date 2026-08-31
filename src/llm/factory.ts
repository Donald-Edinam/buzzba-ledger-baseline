import { AnthropicClient, type LlmClient } from './client.js';
import { OpenAICompatClient } from './openai-compat.js';

export interface ProviderPreset {
  readonly baseUrl: string;
  readonly keyEnv: string;
  readonly defaultModel: string;
  readonly note: string;
  /**
   * Free-tier requests per day, where it has actually been measured against
   * this project. `null` means unmeasured -- NOT unlimited. Only populate this
   * from an observed quota response, never from a documentation page.
   */
  readonly dailyRequestCap: number | null;
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
    note: 'Paid per token, no free tier, so no daily request cap to plan around. Strongest results; a full baseline-plus-agent comparison is cents, not dollars.',
    dailyRequestCap: null,
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyEnv: 'GEMINI_API_KEY',
    defaultModel: 'gemini-3.6-flash',
    note: 'Free tier capped at a MEASURED 20 requests per day per model (quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier, observed 2026-08-30). Retrying a 429 against that cap cannot succeed, however long the backoff: the client throws QUOTA_EXHAUSTED instead. Rejected requests do not consume quota. 3.x Flash reasons by default and those tokens are billed against max_tokens, so REASONING_EFFORT matters here. Google may use free-tier prompts to improve their models, which is acceptable here only because every case is synthetic.',
    dailyRequestCap: 20,
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    note: 'Free tier, very fast inference, but tight per-minute request and token limits and a habit of retiring model names. Daily cap not measured against this project, so it is left unset rather than guessed. Open-weight models follow strict JSON less reliably than Claude, so expect more parse failures.',
    dailyRequestCap: null,
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'google/gemma-4-31b-it:free',
    note: 'One key across many models. `:free` variants are capped at 20 requests/minute always, and 50 requests/day on an account that has never bought credits -- 1000/day once $10 has been purchased at any point, which is a lifetime unlock rather than a balance requirement. Critically, REJECTED requests still count against the daily cap here, so a retry loop actively destroys budget; the client refuses to retry a 429 on this provider. The free lineup rotates without notice, so verify the model id resolves before a run.',
    dailyRequestCap: 50,
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    keyEnv: 'OLLAMA_API_KEY',
    defaultModel: 'qwen2.5:14b',
    note: 'Fully local, free, genuinely no request cap, needs no key. Requires `ollama serve` and the model pulled first; quality on a 14B model is well below the hosted options and long prompts are slow on CPU.',
    dailyRequestCap: null,
  },
};

/**
 * Requests each runner spends per case. Lives here beside the caps it is
 * checked against, rather than on the Runner interface, which is fixed and
 * shared with the scorer.
 */
export const CALLS_PER_CASE: Record<string, number> = { baseline: 1, 'agent-v1': 2 };

/**
 * Preflight: does this run fit inside the provider's measured daily allowance?
 * Returns the warning text, or null when the run fits or the cap is unmeasured.
 *
 * Advisory only. A partial run is sometimes exactly what is wanted, so callers
 * warn and proceed rather than blocking.
 */
export function requestBudgetWarning(
  provider: string,
  runnerName: string,
  caseCount: number,
): string | null {
  const cap = PRESETS[provider]?.dailyRequestCap;
  if (cap === null || cap === undefined) return null;

  const perCase = CALLS_PER_CASE[runnerName] ?? 1;
  const requests = caseCount * perCase;
  if (requests <= cap) return null;

  return (
    `WARNING: this run needs ${requests} requests (${caseCount} cases x ${perCase} ` +
    `per case), but ${provider} allows ${cap} per day on the free tier. Expect the ` +
    `run to fail partway with QUOTA_EXHAUSTED. Use --only to run a subset, or ` +
    `switch provider.`
  );
}

const DEFAULT_ANTHROPIC_RETRIES = 4;
const DEFAULT_COMPAT_RETRIES = 5;
const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * Default 'low' rather than 'none': some reasoning measurably helps the
 * cross-source join, but an unbounded budget is what starves the answer of
 * output tokens. Set REASONING_EFFORT=none to turn it off entirely.
 */
function reasoningEffort(env: NodeJS.ProcessEnv): string {
  return env['REASONING_EFFORT'] ?? 'low';
}

function timeout(env: NodeJS.ProcessEnv): number {
  const raw = env['LLM_TIMEOUT_MS'];
  if (raw === undefined) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`LLM_TIMEOUT_MS must be a positive number of milliseconds, got "${raw}"`);
  }
  return parsed;
}

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
  const timeoutMs = timeout(env);

  // reasoning_effort is an OpenAI-compatible field. Anthropic's extended
  // thinking is a different parameter shape, and this project does not use it,
  // so AnthropicClient never receives this knob.
  return provider === 'anthropic'
    ? new AnthropicClient(model, apiKey, DEFAULT_ANTHROPIC_RETRIES, timeoutMs)
    : new OpenAICompatClient(
        model,
        apiKey,
        baseUrl,
        DEFAULT_COMPAT_RETRIES,
        timeoutMs,
        reasoningEffort(env),
        provider,
      );
}

/** Stamped into runs/<name>/_run.json so every number is traceable to what produced it. */
export function describeProvider(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const provider = env['LLM_PROVIDER'] ?? 'anthropic';
  const p = preset(provider);
  return {
    provider,
    model: env['MODEL'] ?? p.defaultModel,
    baseUrl: env['LLM_BASE_URL'] ?? p.baseUrl,
    // Recorded for every provider, but only sent by the OpenAI-compatible
    // client; on anthropic it documents the setting, not a request field.
    reasoningEffort: reasoningEffort(env),
  };
}

import { log } from '../core/logger.js';
import type { LlmCall, LlmClient, LlmResponse } from './client.js';

interface ChatCompletion {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}


interface QuotaViolation {
  quotaId?: string;
  quotaValue?: string;
  quotaMetric?: string;
}

/** Pulls the QuotaFailure violations out of a 429 body, whatever it is wrapped in. */
function quotaViolations(body: string): QuotaViolation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  // Google returns a single-element array; other providers return the object.
  const root = Array.isArray(parsed) ? parsed[0] : parsed;
  const details = (root as { error?: { details?: unknown[] } } | undefined)?.error?.details;
  if (!Array.isArray(details)) return [];

  const out: QuotaViolation[] = [];
  for (const d of details) {
    const violations = (d as { violations?: unknown[] } | undefined)?.violations;
    if (!Array.isArray(violations)) continue;
    for (const v of violations) {
      if (v && typeof v === 'object') out.push(v as QuotaViolation);
    }
  }
  return out;
}

/**
 * Returns an explanation when a 429 must NOT be retried, or null when it is a
 * per-minute throttle worth waiting out.
 */
function terminalQuota(body: string, provider?: string): string | null {
  if (provider !== undefined && OpenAICompatClient.burnsQuotaOnRejection(provider)) {
    return (
      `${provider} counts rejected requests against its daily cap, so retrying ` +
      `spends budget it cannot recover. Body: ${body.slice(0, 200)}`
    );
  }

  for (const v of quotaViolations(body)) {
    if (typeof v.quotaId === 'string' && v.quotaId.includes('PerDay')) {
      const value = v.quotaValue !== undefined ? `, quotaValue=${v.quotaValue}` : '';
      const metric = v.quotaMetric !== undefined ? `, quotaMetric=${v.quotaMetric}` : '';
      return `daily quota reached (quotaId=${v.quotaId}${value}${metric}). Retrying cannot succeed today.`;
    }
  }
  return null;
}

/**
 * One client for every provider that speaks the OpenAI chat-completions shape:
 * Gemini, Groq, OpenRouter, Ollama. Same contract as AnthropicClient, so
 * runners cannot tell which provider they are talking to.
 *
 * Takes no environment variables. The provider, key, base URL, timeout and
 * reasoning effort are decided in src/llm/factory.ts and passed in, so a run's
 * configuration is visible in one place rather than scattered across
 * constructors.
 */
export class OpenAICompatClient implements LlmClient {
  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly maxRetries = 5,
    private readonly timeoutMs = 180_000,
    /**
     * OpenAI-compatible reasoning control: 'none' | 'low' | 'medium' | 'high',
     * as accepted by the provider. Omitted from the request entirely when unset.
     *
     * `reasoning_effort` overlaps with Gemini's native `thinking_level` /
     * `thinking_budget`; the two cannot both be sent in the same request, so
     * this client sends only `reasoning_effort`.
     */
    private readonly reasoningEffort?: string,
    /**
     * Provider key from PRESETS. Used only to decide whether a 429 is worth
     * retrying -- see BURNS_QUOTA_ON_REJECTION. The client still reads no
     * environment variables; the factory passes this in.
     */
    private readonly provider?: string,
  ) {}

  /**
   * Providers where a REJECTED request still counts against the daily
   * allowance. Retrying here does not just fail, it destroys remaining budget,
   * so a 429 is terminal regardless of what the body says.
   */
  private static readonly BURNS_QUOTA_ON_REJECTION = new Set(['openrouter']);

  static burnsQuotaOnRejection(provider: string): boolean {
    return OpenAICompatClient.BURNS_QUOTA_ON_REJECTION.has(provider);
  }

  async complete(call: LlmCall): Promise<LlmResponse> {
    const started = Date.now();
    const maxTokens = call.maxTokens ?? 16000;
    let lastError = '';

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: maxTokens,
            // Conditional spread: sending an explicit null or '' is not the same
            // as omitting the field, and some providers reject it.
            ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
            messages: [
              { role: 'system', content: call.system },
              { role: 'user', content: call.user },
            ],
          }),
          // High reasoning levels can take minutes; the platform default would
          // cut off a response that was on its way to being valid.
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        // Timeout or transport failure. Retryable: nothing about the request is wrong.
        lastError = `request failed: ${(e as Error).message}`.slice(0, 300);
        if (attempt === this.maxRetries) break;
        const waitMs = 1000 * 2 ** (attempt - 1);
        log.warn('llm retry', { attempt, reason: 'request failed', waitMs });
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (res.ok) {
        const data = (await res.json()) as ChatCompletion;
        const first = data.choices?.[0];
        const finishReason = first?.finish_reason ?? '';
        const completionTokens = data.usage?.completion_tokens ?? 0;

        // Reasoning tokens are billed against max_tokens before a single
        // character of the answer is emitted, so a model that thinks too long
        // returns finish_reason 'length' with empty content and no usable
        // output. That is a budget failure, not a malformed answer: surface it
        // as itself rather than letting the parser report "no JSON found".
        // Never retried -- an identical request truncates identically.
        if (finishReason === 'length') {
          throw new Error(
            `TRUNCATED: hit the output ceiling (finish_reason=length, ` +
              `completion_tokens=${completionTokens}, max_tokens=${maxTokens}). ` +
              `Raise max_tokens or lower REASONING_EFFORT.`,
          );
        }

        return {
          text: first?.message?.content ?? '',
          usage: {
            inputTokens: data.usage?.prompt_tokens ?? 0,
            outputTokens: completionTokens,
          },
          ms: Date.now() - started,
          attempts: attempt,
          finishReason,
        };
      }

      const rawBody = await res.text();
      lastError = `${res.status} ${rawBody}`.slice(0, 300);

      // A daily cap cannot be waited out inside a run. Google's 429 carries a
      // RetryInfo of ~20s that reads like a per-minute throttle and is not, so
      // trust the quotaId over the retry hint.
      if (res.status === 429) {
        const terminal = terminalQuota(rawBody, this.provider);
        if (terminal) throw new Error(`QUOTA_EXHAUSTED: ${terminal}`);
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === this.maxRetries) break;

      // Free tiers throttle by requests per minute, so a 429 needs a wait long
      // enough for the window to roll over, not an exponential nibble.
      const waitMs = res.status === 429 ? 8000 * attempt : 1000 * 2 ** (attempt - 1);
      log.warn('llm retry', { attempt, status: res.status, waitMs });
      await new Promise((r) => setTimeout(r, waitMs));
    }

    throw new Error(`LLM call failed: ${lastError}`);
  }
}

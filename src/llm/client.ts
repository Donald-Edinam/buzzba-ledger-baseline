import { log } from '../core/logger.js';

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LlmCall {
  readonly system: string;
  readonly user: string;
  readonly maxTokens?: number;
}

export interface LlmResponse {
  readonly text: string;
  readonly usage: LlmUsage;
  readonly ms: number;
  readonly attempts: number;
  /** Provider's stop reason, verbatim. 'length' / 'max_tokens' means truncated output. */
  readonly finishReason: string;
}

export interface LlmClient {
  complete(call: LlmCall): Promise<LlmResponse>;
  readonly model: string;
}

const API = 'https://api.anthropic.com/v1/messages';

/**
 * Minimal client. No SDK dependency, so the reproduction path is `npm ci` and
 * an API key, nothing else. Retries only on 429 and 5xx, with backoff.
 */
export class AnthropicClient implements LlmClient {
  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly maxRetries = 4,
    private readonly timeoutMs = 180_000,
  ) {}

  async complete(call: LlmCall): Promise<LlmResponse> {
    const started = Date.now();
    let lastError = '';

    const maxTokens = call.maxTokens ?? 16000;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      let res: Response;
      try {
        res = await fetch(API, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: maxTokens,
            system: call.system,
            messages: [{ role: 'user', content: call.user }],
          }),
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
        const data = (await res.json()) as {
          content: { type: string; text?: string }[];
          usage: { input_tokens: number; output_tokens: number };
          stop_reason?: string | null;
        };
        return {
          text: data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n'),
          usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
          ms: Date.now() - started,
          attempts: attempt,
          finishReason: data.stop_reason ?? '',
        };
      }

      lastError = `${res.status} ${await res.text()}`.slice(0, 300);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === this.maxRetries) break;

      const waitMs = 1000 * 2 ** (attempt - 1);
      log.warn('llm retry', { attempt, status: res.status, waitMs });
      await new Promise((r) => setTimeout(r, waitMs));
    }

    throw new Error(`LLM call failed: ${lastError}`);
  }
}

/** Deterministic stub so the pipeline can be exercised without spending money. */
export class StubClient implements LlmClient {
  readonly model = 'stub';
  constructor(private readonly reply: string) {}
  async complete(): Promise<LlmResponse> {
    return {
      text: this.reply,
      usage: { inputTokens: 0, outputTokens: 0 },
      ms: 0,
      attempts: 1,
      finishReason: 'stop',
    };
  }
}

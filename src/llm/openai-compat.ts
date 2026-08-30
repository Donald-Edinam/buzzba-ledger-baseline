import { log } from '../core/logger.js';
import type { LlmCall, LlmClient, LlmResponse } from './client.js';

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * One client for every provider that speaks the OpenAI chat-completions shape:
 * Gemini's compat endpoint, Groq, OpenRouter, Ollama. Same contract as
 * AnthropicClient, so runners cannot tell which provider they are talking to.
 *
 * Takes no environment variables. The provider, key and base URL are decided in
 * src/llm/factory.ts and passed in, so a run's configuration is visible in one
 * place rather than scattered across constructors.
 */
export class OpenAICompatClient implements LlmClient {
  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly maxRetries = 5,
  ) {}

  async complete(call: LlmCall): Promise<LlmResponse> {
    const started = Date.now();
    let lastError = '';

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: call.maxTokens ?? 8000,
          messages: [
            { role: 'system', content: call.system },
            { role: 'user', content: call.user },
          ],
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as ChatCompletion;
        const first = data.choices?.[0];
        return {
          text: first?.message?.content ?? '',
          usage: {
            inputTokens: data.usage?.prompt_tokens ?? 0,
            outputTokens: data.usage?.completion_tokens ?? 0,
          },
          ms: Date.now() - started,
          attempts: attempt,
        };
      }

      lastError = `${res.status} ${await res.text()}`.slice(0, 300);
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

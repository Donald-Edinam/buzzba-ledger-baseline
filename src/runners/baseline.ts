import type { Case, Ledger } from '../domain/ledger.js';
import { PRICE_LIST, SERVICES } from '../domain/ledger.js';
import type { LlmClient } from '../llm/client.js';
import { parseLedger } from './parse.js';

export interface RunResult {
  readonly caseId: string;
  readonly ledger: Ledger;
  readonly parsedOk: boolean;
  readonly parseReason?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly ms: number;
  readonly llmCalls: number;
  readonly trajectory: TrajectoryStep[];
}

export interface TrajectoryStep {
  readonly step: number;
  readonly label: string;
  readonly promptChars: number;
  readonly responseChars: number;
  readonly note: string;
}

export interface Runner {
  readonly name: string;
  run(c: Case, client: LlmClient): Promise<RunResult>;
}

/**
 * The baseline a competent person would actually try: hand the model everything
 * at once and ask for the ledger. Deliberately given the same price list and
 * schema as the agent, so the comparison isolates the agentic design rather
 * than rewarding a better prompt.
 */
const SYSTEM = `You reconstruct a barbershop's transaction ledger from messy records.

Sources: WhatsApp messages (bookings and unrelated chatter), MTN MoMo payment SMS
(uppercase legal names, exact amounts), and transcribed handwritten daybook lines
(shorthand, day/month only, amounts sometimes missing).

Services and prices in GHS: ${SERVICES.map((s) => `${s}=${PRICE_LIST[s]}`).join(', ')}

Rules:
- One row per completed transaction. Questions and chatter are not transactions.
- The same person appears under different names across sources. Merge them.
- Use the customer's fullest known name.
- amount is the total in whole GHS.
- method is "momo" if a MoMo SMS matches, "cash" if the daybook says cash,
  otherwise "unpaid".
- All dates are in 2026.

Return ONLY a JSON array. No prose, no code fence. Each element:
{"date":"YYYY-MM-DD","customer":string,"services":[string],"amount":number,"method":"cash"|"momo"|"unpaid"}`;

function renderSources(c: Case): string {
  return [
    '=== WHATSAPP ===',
    ...c.sources.whatsapp,
    '',
    '=== MOMO SMS ===',
    ...c.sources.momo_sms,
    '',
    '=== DAYBOOK (transcribed) ===',
    ...c.sources.daybook,
  ].join('\n');
}

export const baselineRunner: Runner = {
  name: 'baseline',
  async run(c, client) {
    const user = renderSources(c);
    // Deliberately not wrapped: a TRUNCATED error from the client must reach
    // scripts/run.ts, which records the case as a failure with its reason. A
    // catch here would hand the parser an empty string and misreport a budget
    // failure as a parse failure.
    const res = await client.complete({ system: SYSTEM, user });
    const parsed = parseLedger(res.text);

    return {
      caseId: c.id,
      ledger: parsed.ledger,
      parsedOk: parsed.ok,
      ...(parsed.reason !== undefined ? { parseReason: parsed.reason } : {}),
      inputTokens: res.usage.inputTokens,
      outputTokens: res.usage.outputTokens,
      ms: res.ms,
      llmCalls: 1,
      trajectory: [
        {
          step: 1,
          label: 'single extraction call',
          promptChars: SYSTEM.length + user.length,
          responseChars: res.text.length,
          note: parsed.ok
            ? `parsed ${parsed.ledger.length} rows`
            : `parse failed: ${parsed.reason ?? 'unknown'}`,
        },
      ],
    };
  },
};

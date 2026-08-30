import { LedgerSchema, type Ledger } from '../domain/ledger.js';

export interface ParseOutcome {
  readonly ledger: Ledger;
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * Models wrap JSON in prose or fences no matter how firmly you ask. This
 * recovers the array without pretending the wrapping did not happen: `ok`
 * stays true only for output that parsed, and a failure scores as an empty
 * ledger rather than being silently retried.
 */
export function parseLedger(raw: string): ParseOutcome {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    return { ledger: [], ok: false, reason: 'no JSON array found in output' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch (e) {
    return { ledger: [], ok: false, reason: `invalid JSON: ${(e as Error).message}` };
  }

  const validated = LedgerSchema.safeParse(parsed);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    return { ledger: [], ok: false, reason: `schema: ${issue?.path.join('.')} ${issue?.message}` };
  }
  return { ledger: validated.data, ok: true };
}

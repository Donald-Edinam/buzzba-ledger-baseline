import { z } from 'zod';
import type { Case } from '../domain/ledger.js';
import type { LlmClient } from '../llm/client.js';
import { SYSTEM as BASELINE_SYSTEM, renderSources, type Runner, type TrajectoryStep } from './baseline.js';
import { parseLedger } from './parse.js';

/**
 * Iteration 1. Exactly one architectural change against the baseline: the
 * customer roster is built once, up front, and carried in context through
 * extraction.
 *
 * Why this and nothing else: on the measured baseline, services, amounts and
 * methods sit at 92-100% while customer accuracy falls to 53.57% on
 * case-12-hard and 62.07% on case-11-hard. Customer resolution is the only
 * field that degrades with difficulty, so it is the only thing worth changing
 * first. Verification and a confirmation queue are later iterations; adding
 * them here would make the changelog unable to say which one earned the gain.
 *
 * Pass 1 sees only the MoMo SMS and the daybook. Withholding the WhatsApp
 * thread is deliberate: those two sources are where the same person appears in
 * incompatible registers ("A SARPONG" against "sister Abena"), and excluding
 * the chatter keeps the identity question separate from the transaction
 * question rather than letting the model start extracting rows early.
 */

const RosterEntrySchema = z.object({
  canonical: z.string().min(1),
  aliases: z.array(z.string()),
});
const RosterSchema = z.array(RosterEntrySchema);
type RosterEntry = z.infer<typeof RosterEntrySchema>;

const ROSTER_SYSTEM = `You identify the distinct people named in a barbershop's payment records.

You are given MTN MoMo payment SMS and transcribed handwritten daybook lines.

- MoMo SMS carry uppercase legal or abbreviated names: "ATO QUAYE", "A SARPONG".
- The daybook carries nicknames and shorthand: "Kofi Small", "Junior", "Kojo".
- The same person appears under several of these forms. Group them.

For each distinct person return one entry:
- "canonical": Title Case, and the fullest name the evidence supports. Never
  leave it in the uppercase form the SMS used. If the fullest evidence is an
  initial and a surname ("A SARPONG"), write "A. Sarpong".
- "aliases": every other written form of that person you saw, verbatim.

Do not invent people. Do not merge two people who merely share a first name.

Return ONLY a JSON array. No prose, no code fence. Each element:
{"canonical":string,"aliases":[string]}`;

const RESOLUTION_RULES = `Resolve every customer to a canonical name from the roster above.
If a customer appears who is not in the roster, use the fullest form present in
the sources. Never emit a MoMo SMS name verbatim in uppercase.`;

/** Pass 1 sees the two sources where the same person appears in different registers. */
function renderIdentitySources(c: Case): string {
  return [
    '=== MOMO SMS ===',
    ...c.sources.momo_sms,
    '',
    '=== DAYBOOK (transcribed) ===',
    ...c.sources.daybook,
  ].join('\n');
}

/**
 * Same recovery parse.ts performs for ledgers, over the roster shape. Kept
 * local rather than generalised into parse.ts, so the baseline's parsing path
 * is byte-identical to what produced its recorded numbers.
 */
function parseRoster(raw: string): { roster: RosterEntry[]; ok: boolean; reason?: string } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    return { roster: [], ok: false, reason: 'no JSON array found in output' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch (e) {
    return { roster: [], ok: false, reason: `invalid JSON: ${(e as Error).message}` };
  }

  const validated = RosterSchema.safeParse(parsed);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    return { roster: [], ok: false, reason: `schema: ${issue?.path.join('.')} ${issue?.message}` };
  }
  return { roster: validated.data, ok: true };
}

function renderRoster(roster: RosterEntry[]): string {
  if (roster.length === 0) {
    // Pass 1 failed. Say so plainly rather than showing an empty heading the
    // model might try to fill in, but keep the resolution rules: they are the
    // point of the pass even without a roster to consult.
    return `=== KNOWN CUSTOMERS ===\n(no roster available)\n\n${RESOLUTION_RULES}`;
  }
  const lines = roster.map((e) =>
    e.aliases.length > 0 ? `${e.canonical} (also: ${e.aliases.join(', ')})` : e.canonical,
  );
  return `=== KNOWN CUSTOMERS ===\n${lines.join('\n')}\n\n${RESOLUTION_RULES}`;
}

export const agentRunner: Runner = {
  name: 'agent-v1',
  async run(c, client: LlmClient) {
    // Neither call is wrapped: a TRUNCATED or transport error must reach
    // scripts/run.ts and be recorded as itself. Only a *parse* failure in
    // pass 1 is survivable, and it degrades to an empty roster.
    const rosterUser = renderIdentitySources(c);
    const rosterRes = await client.complete({ system: ROSTER_SYSTEM, user: rosterUser });
    const rosterOut = parseRoster(rosterRes.text);

    const system = `${BASELINE_SYSTEM}\n\n${renderRoster(rosterOut.roster)}`;
    const user = renderSources(c);
    const res = await client.complete({ system, user });
    const parsed = parseLedger(res.text);

    const trajectory: TrajectoryStep[] = [
      {
        step: 1,
        label: 'roster construction (momo + daybook only)',
        promptChars: ROSTER_SYSTEM.length + rosterUser.length,
        responseChars: rosterRes.text.length,
        note: rosterOut.ok
          ? `built ${rosterOut.roster.length} roster entries, ` +
            `${rosterOut.roster.reduce((n, e) => n + e.aliases.length, 0)} aliases`
          : `roster parse failed: ${rosterOut.reason ?? 'unknown'}; ` +
            `continuing with 0 roster entries`,
      },
      {
        step: 2,
        label: 'extraction with roster in context',
        promptChars: system.length + user.length,
        responseChars: res.text.length,
        note: parsed.ok
          ? `parsed ${parsed.ledger.length} rows against ${rosterOut.roster.length} roster entries`
          : `parse failed: ${parsed.reason ?? 'unknown'}`,
      },
    ];

    return {
      caseId: c.id,
      ledger: parsed.ledger,
      parsedOk: parsed.ok,
      ...(parsed.reason !== undefined ? { parseReason: parsed.reason } : {}),
      inputTokens: rosterRes.usage.inputTokens + res.usage.inputTokens,
      outputTokens: rosterRes.usage.outputTokens + res.usage.outputTokens,
      ms: rosterRes.ms + res.ms,
      llmCalls: 2,
      trajectory,
    };
  },
};

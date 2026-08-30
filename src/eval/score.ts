import type { Ledger, LedgerRow } from '../domain/ledger.js';

export interface FieldStats {
  readonly customer: number;
  readonly services: number;
  readonly amount: number;
  readonly method: number;
  readonly date: number;
}

export interface CaseScore {
  readonly caseId: string;
  readonly goldRows: number;
  readonly predictedRows: number;
  /** Primary metric: rows where every field is correct, over gold rows. */
  readonly exactRowAccuracy: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  /** Sum of amounts, the number the owner actually cares about. */
  readonly goldTotal: number;
  readonly predictedTotal: number;
  readonly revenueErrorGhs: number;
  readonly fieldAccuracy: FieldStats;
  readonly hallucinatedRows: number;
  readonly missedRows: number;
}

const key = (r: LedgerRow): string =>
  `${r.date}|${r.customer.toLowerCase().trim()}|${[...r.services].sort().join('+')}|${r.amount}|${r.method}`;

/** Loose key for pairing a predicted row to a gold row before field comparison. */
const pairKey = (r: LedgerRow): string => `${r.date}|${r.customer.toLowerCase().trim().split(' ')[0]}`;

export function scoreCase(caseId: string, gold: Ledger, predicted: Ledger): CaseScore {
  const goldKeys = new Map<string, number>();
  for (const r of gold) goldKeys.set(key(r), (goldKeys.get(key(r)) ?? 0) + 1);

  let exact = 0;
  const remaining = new Map(goldKeys);
  for (const r of predicted) {
    const k = key(r);
    const left = remaining.get(k) ?? 0;
    if (left > 0) {
      exact++;
      remaining.set(k, left - 1);
    }
  }

  // Field-level credit via loose pairing, so a wrong amount does not also
  // punish the customer field. Diagnoses WHERE the agent fails.
  const goldByPair = new Map<string, LedgerRow[]>();
  for (const r of gold) {
    const list = goldByPair.get(pairKey(r)) ?? [];
    list.push(r);
    goldByPair.set(pairKey(r), list);
  }

  const field = { customer: 0, services: 0, amount: 0, method: 0, date: 0 };
  let paired = 0;
  for (const p of predicted) {
    const candidates = goldByPair.get(pairKey(p));
    const match = candidates?.shift();
    if (!match) continue;
    paired++;
    field.date += p.date === match.date ? 1 : 0;
    field.customer += p.customer.toLowerCase().trim() === match.customer.toLowerCase().trim() ? 1 : 0;
    field.services += [...p.services].sort().join('+') === [...match.services].sort().join('+') ? 1 : 0;
    field.amount += p.amount === match.amount ? 1 : 0;
    field.method += p.method === match.method ? 1 : 0;
  }

  const pct = (n: number, d: number): number => (d === 0 ? 0 : Number(((n / d) * 100).toFixed(2)));
  const goldTotal = gold.reduce((s, r) => s + r.amount, 0);
  const predictedTotal = predicted.reduce((s, r) => s + r.amount, 0);
  const precision = pct(exact, predicted.length);
  const recall = pct(exact, gold.length);

  return {
    caseId,
    goldRows: gold.length,
    predictedRows: predicted.length,
    exactRowAccuracy: recall,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : Number(((2 * precision * recall) / (precision + recall)).toFixed(2)),
    goldTotal,
    predictedTotal,
    revenueErrorGhs: Math.abs(goldTotal - predictedTotal),
    fieldAccuracy: {
      date: pct(field.date, paired),
      customer: pct(field.customer, paired),
      services: pct(field.services, paired),
      amount: pct(field.amount, paired),
      method: pct(field.method, paired),
    },
    hallucinatedRows: Math.max(0, predicted.length - exact),
    missedRows: Math.max(0, gold.length - exact),
  };
}

export function aggregate(scores: readonly CaseScore[]): Record<string, number> {
  const mean = (f: (s: CaseScore) => number): number =>
    Number((scores.reduce((sum, s) => sum + f(s), 0) / scores.length).toFixed(2));
  return {
    cases: scores.length,
    exactRowAccuracy: mean((s) => s.exactRowAccuracy),
    precision: mean((s) => s.precision),
    f1: mean((s) => s.f1),
    revenueErrorGhs: Number(scores.reduce((sum, s) => sum + s.revenueErrorGhs, 0).toFixed(2)),
    totalGoldRows: scores.reduce((sum, s) => sum + s.goldRows, 0),
  };
}

import type { Case, Ledger, LedgerRow, PaymentMethod, Service } from '../domain/ledger.js';
import { PRICE_LIST, SERVICES } from '../domain/ledger.js';
import { Rng } from './rng.js';
import { ROSTER, WALKIN_NAMES } from './roster.js';
import { renderDaybook, renderMomoSms, renderNoise, renderWhatsApp } from './render.js';

export interface CaseSpec {
  readonly id: string;
  readonly seed: number;
  readonly days: number;
  readonly rowsPerDay: [min: number, max: number];
  readonly notes: string;
  /** Fraction of rows that appear in only one source. Forces cross-source joins. */
  readonly partialCoverage: number;
  readonly noisePerDay: number;
}

function isoDate(dayOffset: number): string {
  const base = Date.UTC(2026, 6, 6); // Monday 2026-07-06, fixed for determinism
  const d = new Date(base + dayOffset * 86400000);
  return d.toISOString().slice(0, 10);
}

function buildLedger(rng: Rng, spec: CaseSpec): Ledger {
  const rows: LedgerRow[] = [];
  for (let day = 0; day < spec.days; day++) {
    const date = isoDate(day);
    const count = rng.int(spec.rowsPerDay[0], spec.rowsPerDay[1]);
    for (let i = 0; i < count; i++) {
      const useRegular = rng.chance(0.75);
      const customer = useRegular ? rng.pick(ROSTER) : null;
      const name = customer?.name ?? rng.pick(WALKIN_NAMES);

      const services: Service[] =
        customer && rng.chance(0.5)
          ? [...(customer.usual as readonly Service[])]
          : rng.shuffle(SERVICES).slice(0, rng.chance(0.65) ? 1 : 2);

      const amount = services.reduce((sum, s) => sum + PRICE_LIST[s], 0);
      const method: PaymentMethod = rng.chance(0.5) ? 'momo' : rng.chance(0.82) ? 'cash' : 'unpaid';

      rows.push({ date, customer: name, services, amount, method });
    }
  }
  return rows;
}

/**
 * Renders one ledger into the three messy sources. A row may be missing from
 * any given source, so the agent must join across them rather than read one.
 * MoMo SMS only exists for momo payments, which mirrors reality.
 */
function renderSources(rng: Rng, ledger: Ledger, spec: CaseSpec): Case['sources'] {
  const whatsapp: string[] = [];
  const momo: string[] = [];
  const daybook: string[] = [];

  for (const row of ledger) {
    const dropWhatsApp = rng.chance(spec.partialCoverage);
    const dropDaybook = rng.chance(spec.partialCoverage * 0.6);

    if (!dropWhatsApp) whatsapp.push(renderWhatsApp(rng, row));
    if (row.method === 'momo') momo.push(renderMomoSms(rng, row));
    if (!dropDaybook) daybook.push(renderDaybook(rng, row));

    // Guarantee every row is recoverable from at least one source.
    if (dropWhatsApp && dropDaybook && row.method !== 'momo') {
      daybook.push(renderDaybook(rng, row));
    }
  }

  const days = [...new Set(ledger.map((r) => r.date))];
  for (const date of days) {
    for (let i = 0; i < spec.noisePerDay; i++) whatsapp.push(renderNoise(rng, date));
  }

  return {
    whatsapp: rng.shuffle(whatsapp),
    momo_sms: momo,
    daybook,
  };
}

export function generateCase(spec: CaseSpec): { case: Case; gold: Ledger } {
  const rng = new Rng(spec.seed);
  const gold = buildLedger(rng, spec);
  const sources = renderSources(rng, gold, spec);
  return {
    case: { id: spec.id, seed: spec.seed, notes: spec.notes, sources },
    gold,
  };
}

/**
 * Twelve cases. Ten routine, two deliberately hard. The brief asks for one
 * challenging case and an explanation of what it revealed.
 */
export const CASE_SPECS: readonly CaseSpec[] = [
  { id: 'case-01', seed: 1001, days: 2, rowsPerDay: [3, 5], partialCoverage: 0.2, noisePerDay: 1, notes: 'Baseline volume, high source coverage.' },
  { id: 'case-02', seed: 1002, days: 3, rowsPerDay: [3, 6], partialCoverage: 0.25, noisePerDay: 2, notes: 'Adds noise messages that carry no transaction.' },
  { id: 'case-03', seed: 1003, days: 3, rowsPerDay: [4, 7], partialCoverage: 0.3, noisePerDay: 2, notes: 'Heavier day, more alias collisions.' },
  { id: 'case-04', seed: 1004, days: 4, rowsPerDay: [3, 5], partialCoverage: 0.35, noisePerDay: 2, notes: 'Sparse coverage, more cross-source joining required.' },
  { id: 'case-05', seed: 1005, days: 4, rowsPerDay: [4, 6], partialCoverage: 0.25, noisePerDay: 3, notes: 'Noise-heavy, tests precision.' },
  { id: 'case-06', seed: 1006, days: 5, rowsPerDay: [3, 6], partialCoverage: 0.3, noisePerDay: 2, notes: 'Week-scale, memory of roster should start paying off.' },
  { id: 'case-07', seed: 1007, days: 5, rowsPerDay: [4, 7], partialCoverage: 0.3, noisePerDay: 3, notes: 'Week-scale with unpaid balances carried.' },
  { id: 'case-08', seed: 1008, days: 6, rowsPerDay: [3, 6], partialCoverage: 0.35, noisePerDay: 2, notes: 'Longer span, alias drift across days.' },
  { id: 'case-09', seed: 1009, days: 6, rowsPerDay: [4, 8], partialCoverage: 0.3, noisePerDay: 3, notes: 'High volume, context pressure on single-prompt baseline.' },
  { id: 'case-10', seed: 1010, days: 7, rowsPerDay: [4, 7], partialCoverage: 0.3, noisePerDay: 3, notes: 'Full week, the realistic weekly reconciliation.' },
  { id: 'case-11-hard', seed: 2011, days: 7, rowsPerDay: [5, 9], partialCoverage: 0.5, noisePerDay: 4, notes: 'HARD: half of all rows appear in only one source, heavy noise. Requires joining MoMo amounts to daybook shorthand with no WhatsApp context.' },
  { id: 'case-12-hard', seed: 2012, days: 10, rowsPerDay: [5, 9], partialCoverage: 0.45, noisePerDay: 4, notes: 'HARD: ten days. Exceeds what one prompt handles reliably and is where memory of the roster and price list should dominate.' },
];

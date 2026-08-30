import type { LedgerRow, Service } from '../domain/ledger.js';
import { PRICE_LIST } from '../domain/ledger.js';
import type { Rng } from './rng.js';
import { ROSTER } from './roster.js';

const SERVICE_WORDS: Record<Service, readonly string[]> = {
  haircut: ['cut', 'haircut', 'shave am', 'low cut'],
  lineup: ['lineup', 'line up', 'shape up'],
  beard_trim: ['beard', 'beard trim', 'trim the beard'],
  wash: ['wash', 'hair wash'],
  dye: ['dye', 'colour', 'black am'],
  kids_cut: ['kids cut', 'the small boy cut', 'child cut'],
};

/** Code-switched Twi and English, as messages actually arrive. */
const GREETINGS = [
  'Chale', 'Boss', 'Massa', 'Charley', 'Bro', 'Wo ho te sen', 'Good morning boss',
];

function serviceWords(rng: Rng, services: readonly Service[]): string {
  return services.map((s) => rng.pick(SERVICE_WORDS[s])).join(' and ');
}

function displayName(rng: Rng, row: LedgerRow): string {
  const customer = ROSTER.find((c) => c.name === row.customer);
  if (!customer) return row.customer.split(' ')[0] ?? row.customer;
  return rng.pick(customer.aliases);
}

/** WhatsApp booking message. Price is often absent, which is the point. */
export function renderWhatsApp(rng: Rng, row: LedgerRow): string {
  const who = displayName(rng, row);
  const greeting = rng.pick(GREETINGS);
  const time = `${String(rng.int(7, 19)).padStart(2, '0')}:${rng.pick(['05', '17', '32', '48'])}`;
  const customer = ROSTER.find((c) => c.name === row.customer);

  // "The usual" only makes sense for a regular whose services match their habit.
  const usualMatches =
    customer?.regular === true &&
    customer.usual.length === row.services.length &&
    customer.usual.every((s) => (row.services as readonly string[]).includes(s));

  const body =
    usualMatches && rng.chance(0.55)
      ? rng.pick([
          'I dey come do the usual',
          'same thing as last time',
          'me nua, the usual wai',
        ])
      : `I want ${serviceWords(rng, row.services)}`;

  const price = rng.chance(0.35) ? ` , ${row.amount} cedis right?` : '';
  return `[${row.date} ${time}] ${who}: ${greeting}, ${body}${price}`;
}

/** MTN MoMo confirmation. Uppercase legal name, exact amount, no services. */
export function renderMomoSms(rng: Rng, row: LedgerRow): string {
  const customer = ROSTER.find((c) => c.name === row.customer);
  const payer = customer?.momoName ?? row.customer.toUpperCase();
  const ref = String(rng.int(100000000, 999999999));
  const time = `${String(rng.int(8, 20)).padStart(2, '0')}:${rng.pick(['11', '26', '39', '54'])}`;
  return `Payment received for GHS ${row.amount}.00 from ${payer} on ${row.date} ${time}. Current Balance: GHS ${rng.int(200, 4000)}.00. Reference: CYBAH. Financial Transaction Id: ${ref}.`;
}

/** Handwritten daybook line, transcribed. Shorthand, abbreviations, no year. */
export function renderDaybook(rng: Rng, row: LedgerRow): string {
  const parts = row.date.split('-');
  const short = `${parts[2]}/${parts[1]}`;
  const who = displayName(rng, row);
  const svc = row.services
    .map((s) => ({ haircut: 'cut', lineup: 'l/up', beard_trim: 'beard', wash: 'wash', dye: 'dye', kids_cut: 'kids' })[s])
    .join('+');
  const paid =
    row.method === 'momo' ? 'momo' : row.method === 'cash' ? 'cash' : rng.pick(['owing', 'credit', 'go pay friday']);
  const amount = rng.chance(0.15) ? '-' : String(row.amount);
  return `${short}  ${who}  ${svc}  ${amount}  ${paid}`;
}

/** Chatter that carries no transaction. Tests precision, not just recall. */
export function renderNoise(rng: Rng, date: string): string {
  const who = rng.pick([...ROSTER.map((c) => c.aliases[0] ?? c.name), 'Musah', 'Bright']);
  const time = `${String(rng.int(7, 21)).padStart(2, '0')}:${rng.pick(['02', '21', '44'])}`;
  const msg = rng.pick([
    'Boss are you open today?',
    'chale the shop dey open on sunday?',
    'Wo ho te sen, I go come next week',
    'do you do dreadlocks?',
    'Boss my phone was off sorry',
    'how much be the dye now?',
    'I no fit come again today, something come up',
  ]);
  return `[${date} ${time}] ${who}: ${msg}`;
}

export const PRICES = PRICE_LIST;

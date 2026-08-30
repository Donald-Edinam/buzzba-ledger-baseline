/**
 * The regulars. Each has a legal name plus the names actually used in messages.
 * Alias resolution is the core difficulty: the daybook says "Junior", the MoMo
 * SMS says "KWAME MENSAH", WhatsApp says "chairman". Same person, one row.
 */
export interface Customer {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly momoName: string;
  readonly regular: boolean;
  /** Services this regular habitually takes. Powers the "the usual" case. */
  readonly usual: readonly string[];
}

export const ROSTER: readonly Customer[] = [
  { name: 'Kwame Mensah', aliases: ['Kwame', 'Junior', 'chairman'], momoName: 'KWAME MENSAH', regular: true, usual: ['haircut', 'beard_trim'] },
  { name: 'Kojo Asante', aliases: ['Kojo', 'Kojo Blue'], momoName: 'K ASANTE', regular: true, usual: ['haircut', 'lineup'] },
  { name: 'Yaw Boateng', aliases: ['Yaw', 'Yawa'], momoName: 'YAW BOATENG', regular: true, usual: ['haircut'] },
  { name: 'Nana Owusu', aliases: ['Nana', 'Nana O'], momoName: 'NANA OWUSU', regular: true, usual: ['haircut', 'dye'] },
  { name: 'Abena Sarpong', aliases: ['Abena', 'sister Abena'], momoName: 'A SARPONG', regular: true, usual: ['wash'] },
  { name: 'Kofi Adjei', aliases: ['Kofi', 'Kofi Small'], momoName: 'KOFI ADJEI', regular: true, usual: ['haircut', 'wash'] },
  { name: 'Esi Amoah', aliases: ['Esi'], momoName: 'ESI AMOAH', regular: true, usual: ['kids_cut'] },
  { name: 'Ato Quaye', aliases: ['Ato'], momoName: 'ATO QUAYE', regular: false, usual: ['haircut'] },
  { name: 'Fiifi Tetteh', aliases: ['Fiifi'], momoName: 'F TETTEH', regular: false, usual: ['lineup'] },
  { name: 'Selorm Dzidzor', aliases: ['Selorm'], momoName: 'SELORM DZIDZOR', regular: false, usual: ['haircut', 'beard_trim'] },
];

/** One-off walk-ins. They have no history, so "the usual" must not resolve. */
export const WALKIN_NAMES = [
  'Musah', 'Bright', 'Prince', 'Godwin', 'Emmanuel', 'Rahim', 'Kelvin', 'Isaac',
] as const;

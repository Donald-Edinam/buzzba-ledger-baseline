import { z } from 'zod';

/** The services Cybah Haircut actually sells. Prices in GHS. */
export const SERVICES = [
  'haircut',
  'lineup',
  'beard_trim',
  'wash',
  'dye',
  'kids_cut',
] as const;
export const ServiceSchema = z.enum(SERVICES);
export type Service = z.infer<typeof ServiceSchema>;

export const PRICE_LIST: Record<Service, number> = {
  haircut: 30,
  lineup: 15,
  beard_trim: 15,
  wash: 10,
  dye: 50,
  kids_cut: 20,
};

export const PaymentMethodSchema = z.enum(['cash', 'momo', 'unpaid']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

/**
 * One completed transaction. This is the unit the agent must reconstruct and
 * the unit the scorer compares. Every field is required, so a row is either
 * fully correct or it is wrong. No partial credit at row level.
 */
export const LedgerRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  customer: z.string().min(1),
  services: z.array(ServiceSchema).min(1),
  amount: z.number().int().nonnegative(),
  method: PaymentMethodSchema,
});
export type LedgerRow = z.infer<typeof LedgerRowSchema>;

export const LedgerSchema = z.array(LedgerRowSchema);
export type Ledger = z.infer<typeof LedgerSchema>;

/** The sources the owner actually has. Mirrors the three real places records live. */
export const CaseSourcesSchema = z.object({
  whatsapp: z.array(z.string()),
  momo_sms: z.array(z.string()),
  daybook: z.array(z.string()),
});
export type CaseSources = z.infer<typeof CaseSourcesSchema>;

export const CaseSchema = z.object({
  id: z.string(),
  seed: z.number().int(),
  notes: z.string(),
  sources: CaseSourcesSchema,
});
export type Case = z.infer<typeof CaseSchema>;

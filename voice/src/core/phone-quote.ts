import { z } from 'zod';
import type { Terms } from './types';

export const phoneQuoteProperties: Record<
  string,
  { type: string; description: string; enum?: string[] }
> = {
  key: {
    type: 'string',
    description:
      'Generate a new operation ID whenever terms or confirmation change. Reuse an ID only for an identical retry.',
  },
  revision: {
    type: 'integer',
    description: 'Current revision from the latest get_mission_brief result.',
  },
  price_inr: {
    type: 'string',
    description:
      'Actual total in INR rupees, e.g. 1500.50. Do not multiply by 100. Never use zero for unknown.',
  },
  description: {
    type: 'string',
    description:
      'The specific goods/service covered by this actual quote, including the fee/tax agreement.',
  },
  confirmation: {
    type: 'string',
    enum: ['reported', 'confirmed'],
    description: 'Use confirmed only after the participant explicitly agrees to the quote summary.',
  },
  capacity: {
    type: 'string',
    description:
      'Capacity/quantity as whole digits only if relevant and supplied. Omit if unknown; empty string retracts a previously supplied value. Do not ask delivery about capacity.',
  },
  ready_at: {
    type: 'string',
    description:
      'Exact readiness/access ISO datetime with timezone offset, using the brief date and zone. Omit if not supplied; empty string retracts a previous time.',
  },
  setup_minutes: {
    type: 'string',
    description:
      'Actual setup/installation duration in whole minutes if relevant. Zero means explicitly no setup time. Omit if unknown; empty string retracts a previous duration.',
  },
};
export const phoneQuoteRequired = ['key', 'revision', 'price_inr', 'description', 'confirmation'];

function missingVariable(value: unknown, name: string) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    Reflect.get(value, '$var') === name
  );
}
function optionalField<T extends z.ZodType>(name: string, schema: T) {
  return z.preprocess((value) => {
    // Bolna retains a $var marker when an optional model argument is absent.
    if (missingVariable(value, name) || value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value.trim() || undefined : value;
  }, schema.optional());
}
const whole = (maximum: number) =>
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(maximum));
const rupees = z
  .string()
  .trim()
  .max(64)
  .regex(
    /^(?:(?:INR|Rs\.?)\s*|₹\s*)?(?:\d+|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d?(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/i,
    'Use a nonnegative INR rupee amount with at most two decimal places.',
  )
  .transform((value) => {
    const [units, fraction = ''] = value
      .replace(/^(?:INR|Rs\.?|₹)\s*/i, '')
      .replaceAll(',', '')
      .split('.');
    return Number(BigInt(units) * 100n + BigInt(fraction.padEnd(2, '0')));
  })
  .pipe(z.number().int().min(0).max(100_000_000));
const quoteInput = z
  .object({
    token: z.string().max(10000),
    key: z.string().trim().min(1).max(150),
    revision: z.coerce.number().int().min(1),
    price_inr: rupees,
    description: z.string().trim().min(1).max(1000),
    confirmation: z.enum(['reported', 'confirmed']),
    capacity: optionalField('capacity', whole(10000)),
    ready_at: optionalField('ready_at', z.iso.datetime({ offset: true })),
    setup_minutes: optionalField('setup_minutes', whole(1440)),
  })
  .strict();

export function decodePhoneQuote(raw: Record<string, unknown>, previous?: Terms) {
  const data = quoteInput.parse(raw);
  const optional = <K extends 'capacity' | 'readyAt' | 'setupMinutes'>(
    field: string,
    target: K,
    value: Terms[K],
  ) => {
    const omitted = raw[field] === undefined || missingVariable(raw[field], field);
    const actual = omitted ? previous?.[target] : value;
    return actual === undefined ? {} : { [target]: actual };
  };
  return {
    token: data.token,
    key: data.key,
    revision: data.revision,
    terms: {
      priceMinor: data.price_inr,
      currency: 'INR' as const,
      description: data.description,
      confirmation: data.confirmation,
      ...optional('capacity', 'capacity', data.capacity),
      ...optional('ready_at', 'readyAt', data.ready_at),
      ...optional('setup_minutes', 'setupMinutes', data.setup_minutes),
    },
  };
}

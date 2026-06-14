import { z } from 'zod';

export const SERVICE_MESSAGES = {
  nameRequired: 'Název služby je povinný',
  nameMaxLength: 'Název služby smí mít nejvýše 100 znaků',
  durationPositiveInteger: 'Trvání musí být kladné celé číslo minut',
  durationMultipleOfFive: 'Trvání musí být násobek 5 minut',
  durationRange: 'Trvání musí být v rozsahu 5 až 480 minut',
  priceNumber: 'Cena musí být číslo v Kč',
  priceNonNegative: 'Cena nesmí být záporná',
  priceMax: 'Cena smí být nejvýše 100 000 Kč',
  descriptionMaxLength: 'Popis smí mít nejvýše 500 znaků',
} as const;

function parseNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return Number.NaN;
  }

  const normalized = value.trim().replace(',', '.');

  if (!normalized) {
    return Number.NaN;
  }

  return Number(normalized);
}

const nameSchema = z
  .string()
  .trim()
  .min(1, SERVICE_MESSAGES.nameRequired)
  .max(100, SERVICE_MESSAGES.nameMaxLength);

const durationSchema = z
  .unknown()
  .transform(parseNumber)
  .superRefine((duration, ctx) => {
    if (!Number.isInteger(duration) || duration <= 0) {
      ctx.addIssue({ code: 'custom', message: SERVICE_MESSAGES.durationPositiveInteger });
      return;
    }

    if (duration < 5 || duration > 480) {
      ctx.addIssue({ code: 'custom', message: SERVICE_MESSAGES.durationRange });
      return;
    }

    if (duration % 5 !== 0) {
      ctx.addIssue({ code: 'custom', message: SERVICE_MESSAGES.durationMultipleOfFive });
    }
  });

const priceSchema = z
  .unknown()
  .transform((value) => {
    // Cena je nepovinná: prázdná hodnota (nezadáno) = 0 (na veřejné stránce se
    // nuly nezobrazují). Jinak parsujeme jako číslo.
    if (value === undefined || value === null) {
      return 0;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return 0;
    }
    return parseNumber(value);
  })
  .superRefine((price, ctx) => {
    if (!Number.isFinite(price)) {
      ctx.addIssue({ code: 'custom', message: SERVICE_MESSAGES.priceNumber });
      return;
    }

    if (price < 0) {
      ctx.addIssue({ code: 'custom', message: SERVICE_MESSAGES.priceNonNegative });
      return;
    }

    if (price > 100_000) {
      ctx.addIssue({ code: 'custom', message: SERVICE_MESSAGES.priceMax });
    }
  })
  .transform((price) => Math.round(price * 100) / 100);

const descriptionSchema = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value.trim() : ''))
  .pipe(z.string().max(500, SERVICE_MESSAGES.descriptionMaxLength))
  .transform((description) => (description ? description : null));

export const serviceSchema = z.object({
  name: nameSchema,
  durationMinutes: durationSchema,
  priceCzk: priceSchema,
  description: descriptionSchema.optional().default(null),
});

export type ServiceInput = z.input<typeof serviceSchema>;
export type ServiceValues = z.output<typeof serviceSchema>;

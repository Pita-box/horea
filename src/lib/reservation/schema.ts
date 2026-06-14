import { z } from 'zod';

/**
 * Serverové validační schéma kontaktních polí rezervace (R7.2–R7.6).
 *
 * Klientská validace ve formuláři je pouze UX vrstva — server tato pravidla
 * re-validuje VŽDY a nezávisle (R7.7). České hlášky odpovídají doslovnému znění
 * acceptance criteria.
 */
export const RESERVATION_MESSAGES = {
  nameRequired: 'Jméno je povinné',
  nameMaxLength: 'Jméno smí mít nejvýše 100 znaků',
  phoneInvalid: 'Zadejte platné telefonní číslo',
  emailInvalid: 'Zadejte platnou e-mailovou adresu',
  noteMaxLength: 'Poznámka smí mít nejvýše 500 znaků',
} as const;

/** Povolené znaky telefonu: číslice, mezery, pomlčky, závorky a volitelné úvodní `+`. */
const PHONE_ALLOWED_PATTERN = /^\+?[0-9\s()-]+$/;
/** Běžný tvar e-mailové adresy `local@domain.tld`. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const nameSchema = z
  .unknown()
  .transform(asTrimmedString)
  .pipe(
    z
      .string()
      .min(1, RESERVATION_MESSAGES.nameRequired)
      .max(100, RESERVATION_MESSAGES.nameMaxLength),
  );

const phoneSchema = z
  .unknown()
  .transform(asTrimmedString)
  .superRefine((value, ctx) => {
    if (value.length === 0 || !PHONE_ALLOWED_PATTERN.test(value)) {
      ctx.addIssue({ code: 'custom', message: RESERVATION_MESSAGES.phoneInvalid });
      return;
    }

    const digitCount = (value.match(/\d/g) ?? []).length;

    if (digitCount < 9 || digitCount > 15) {
      ctx.addIssue({ code: 'custom', message: RESERVATION_MESSAGES.phoneInvalid });
    }
  });

const emailSchema = z
  .unknown()
  .transform(asTrimmedString)
  .superRefine((value, ctx) => {
    if (!EMAIL_PATTERN.test(value)) {
      ctx.addIssue({ code: 'custom', message: RESERVATION_MESSAGES.emailInvalid });
    }
  });

const noteSchema = z
  .unknown()
  .transform(asTrimmedString)
  .pipe(z.string().max(500, RESERVATION_MESSAGES.noteMaxLength))
  .transform((note) => (note ? note : null));

export const reservationContactSchema = z.object({
  clientName: nameSchema,
  clientPhone: phoneSchema,
  clientEmail: emailSchema,
  note: noteSchema,
});

export type ReservationContactInput = z.input<typeof reservationContactSchema>;
export type ReservationContactValues = z.output<typeof reservationContactSchema>;

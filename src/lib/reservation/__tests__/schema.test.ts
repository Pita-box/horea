import { describe, expect, it } from 'vitest';

import { RESERVATION_MESSAGES, reservationContactSchema } from '../schema';

const validContact = {
  clientName: 'Jana Nováková',
  clientPhone: '+420 777 123 456',
  clientEmail: 'jana@example.com',
  note: 'Prosím o klidnější místo.',
};

function firstError(input: Record<string, unknown>): string {
  const result = reservationContactSchema.safeParse({ ...validContact, ...input });

  if (result.success) {
    throw new Error('Expected validation error');
  }

  return result.error.issues[0].message;
}

describe('reservationContactSchema', () => {
  it('normalizuje platný kontakt a ořezává whitespace', () => {
    expect(
      reservationContactSchema.parse({
        clientName: '  Jana Nováková  ',
        clientPhone: '777 123 456',
        clientEmail: '  jana@example.com  ',
        note: '  Poznámka  ',
      }),
    ).toEqual({
      clientName: 'Jana Nováková',
      clientPhone: '777 123 456',
      clientEmail: 'jana@example.com',
      note: 'Poznámka',
    });
  });

  it('prázdnou poznámku ukládá jako null', () => {
    expect(reservationContactSchema.parse({ ...validContact, note: '   ' }).note).toBeNull();
    expect(reservationContactSchema.parse({ ...validContact, note: undefined }).note).toBeNull();
  });

  it('vyžaduje neprázdné jméno (R7.2)', () => {
    expect(firstError({ clientName: '   ' })).toBe(RESERVATION_MESSAGES.nameRequired);
  });

  it('omezuje délku jména na 100 znaků (R7.3)', () => {
    expect(firstError({ clientName: 'a'.repeat(101) })).toBe(RESERVATION_MESSAGES.nameMaxLength);
    expect(reservationContactSchema.safeParse({ ...validContact, clientName: 'a'.repeat(100) }).success).toBe(
      true,
    );
  });

  it('odmítá telefon s nepovolenými znaky (R7.4)', () => {
    expect(firstError({ clientPhone: '777-abc-123' })).toBe(RESERVATION_MESSAGES.phoneInvalid);
  });

  it('odmítá telefon s příliš málo nebo příliš mnoha číslicemi (R7.4)', () => {
    expect(firstError({ clientPhone: '12345678' })).toBe(RESERVATION_MESSAGES.phoneInvalid);
    expect(firstError({ clientPhone: '7043441770123456' })).toBe(RESERVATION_MESSAGES.phoneInvalid);
  });

  it('přijímá český i mezinárodní formát telefonu (R7.4)', () => {
    for (const phone of ['777123456', '+420 777 123 456', '(420) 777-123-456', '00420777123456']) {
      expect(reservationContactSchema.safeParse({ ...validContact, clientPhone: phone }).success).toBe(
        true,
      );
    }
  });

  it('odmítá neplatný e-mail (R7.5)', () => {
    for (const email of ['neni-email', 'a@b', 'a@b.', '@example.com', 'jana@@example.com']) {
      expect(firstError({ clientEmail: email })).toBe(RESERVATION_MESSAGES.emailInvalid);
    }
  });

  it('omezuje délku poznámky na 500 znaků (R7.6)', () => {
    expect(firstError({ note: 'a'.repeat(501) })).toBe(RESERVATION_MESSAGES.noteMaxLength);
    expect(reservationContactSchema.safeParse({ ...validContact, note: 'a'.repeat(500) }).success).toBe(
      true,
    );
  });
});

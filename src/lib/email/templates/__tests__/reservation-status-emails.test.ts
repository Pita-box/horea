import { describe, expect, it } from 'vitest';

import { renderReservationApprovedEmail } from '../reservation-approved';
import { renderReservationCancelledEmail } from '../reservation-cancelled';
import { renderReservationModifiedEmail } from '../reservation-modified';
import { renderReservationRejectedEmail } from '../reservation-rejected';

/** Společná data pro všechny čtyři stavové šablony. */
const base = {
  clientName: 'Jan Novák',
  businessName: 'Kadeřnictví Květa',
  serviceName: 'Barvení',
  serviceDurationMinutes: 90,
  servicePriceCzk: 1200,
  reservationDate: '15.07.2024',
  reservationTime: '14:00',
  businessUrl: 'https://www.horea.cz/k/kveta',
};

const DISCLAIMER = 'E-mail byl odeslán automaticky platformou Horea.cz';

describe('renderReservationApprovedEmail', () => {
  it('sestaví subject a obsahuje povinnou větu o potvrzení', () => {
    const email = renderReservationApprovedEmail(base);

    expect(email.subject).toBe('Vaše rezervace byla potvrzena — Kadeřnictví Květa');
    expect(email.text).toContain('Vaše rezervace byla potvrzena.');
    expect(email.html).toContain('Vaše rezervace byla potvrzena.');
  });

  it('obsahuje shrnutí, odkaz na profil a disclaimer v patičce', () => {
    const email = renderReservationApprovedEmail(base);

    expect(email.text).toContain('Barvení');
    expect(email.text).toContain('15.07.2024');
    expect(email.text).toContain('14:00');
    expect(email.text).toContain(base.businessUrl);
    expect(email.text).toContain(DISCLAIMER);
    expect(email.html).toContain(base.businessUrl);
    expect(email.html).toContain(DISCLAIMER);
  });
});

describe('renderReservationRejectedEmail', () => {
  it('obsahuje povinnou větu o odmítnutí, odkaz na profil a disclaimer', () => {
    const email = renderReservationRejectedEmail(base);

    expect(email.subject).toBe('Vaše rezervace byla odmítnuta — Kadeřnictví Květa');
    expect(email.text).toContain('Vaše rezervace byla bohužel odmítnuta.');
    expect(email.html).toContain('Vaše rezervace byla bohužel odmítnuta.');
    expect(email.text).toContain(base.businessUrl);
    expect(email.text).toContain(DISCLAIMER);
  });

  it('zobrazí odlišený blok důvodu jen pokud byl zadán', () => {
    const withReason = renderReservationRejectedEmail({
      ...base,
      statusReason: 'Termín je již obsazen.',
    });
    expect(withReason.text).toContain('Důvod odmítnutí:');
    expect(withReason.text).toContain('Termín je již obsazen.');
    expect(withReason.html).toContain('Důvod odmítnutí:');
    expect(withReason.html).toContain('<blockquote');

    const withoutReason = renderReservationRejectedEmail(base);
    expect(withoutReason.text).not.toContain('Důvod odmítnutí');
    expect(withoutReason.html).not.toContain('Důvod odmítnutí');
  });

  it('escapuje uživatelská pole včetně důvodu v HTML variantě', () => {
    const email = renderReservationRejectedEmail({
      ...base,
      statusReason: '<script>alert(1)</script>',
    });

    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});

describe('renderReservationCancelledEmail', () => {
  it('obsahuje povinnou větu o zrušení a původní termín', () => {
    const email = renderReservationCancelledEmail(base);

    expect(email.subject).toBe('Vaše rezervace byla zrušena — Kadeřnictví Květa');
    expect(email.text).toContain('Vaše rezervace byla zrušena podnikem.');
    expect(email.text).toContain('původním termínem 15.07.2024 v 14:00');
    expect(email.text).toContain(base.businessUrl);
    expect(email.text).toContain(DISCLAIMER);
  });

  it('zobrazí odlišený blok důvodu jen pokud byl zadán', () => {
    const withReason = renderReservationCancelledEmail({
      ...base,
      statusReason: 'Provozovna bude uzavřena.',
    });
    expect(withReason.text).toContain('Důvod zrušení:');
    expect(withReason.text).toContain('Provozovna bude uzavřena.');
    expect(withReason.html).toContain('<blockquote');

    const withoutReason = renderReservationCancelledEmail(base);
    expect(withoutReason.text).not.toContain('Důvod zrušení');
    expect(withoutReason.html).not.toContain('Důvod zrušení');
  });
});

describe('renderReservationModifiedEmail', () => {
  it('obsahuje povinnou větu o úpravě a hodnoty po úpravě', () => {
    const email = renderReservationModifiedEmail({
      clientName: base.clientName,
      businessName: base.businessName,
      services: [
        { name: 'Střih', durationMinutes: 45 },
        { name: 'Foukání', durationMinutes: 30 },
      ],
      combinedDurationMinutes: 75,
      combinedPriceCzk: 500,
      reservationDate: '16.07.2024',
      reservationTime: '10:30',
      businessUrl: base.businessUrl,
    });

    expect(email.subject).toBe('Vaše rezervace byla upravena — Kadeřnictví Květa');
    expect(email.text).toContain('Vaše rezervace byla upravena.');
    expect(email.text).toContain('- Střih (45 min)');
    expect(email.text).toContain('- Foukání (30 min)');
    expect(email.text).toContain('Celková délka: 75 min');
    expect(email.text).toContain('celková cena: 500 Kč');
    expect(email.text).toContain('16.07.2024');
    expect(email.text).toContain('10:30');
    expect(email.text).toContain(base.businessUrl);
    expect(email.text).toContain(DISCLAIMER);
    expect(email.html).toContain('Vaše rezervace byla upravena.');
    expect(email.html).toContain('<li>Střih (45 min)</li>');
  });
});

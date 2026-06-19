import { describe, expect, it } from 'vitest';

import { renderReservationConfirmationEmail } from '../reservation-confirmation';
import { renderReservationNotificationEmail } from '../reservation-notification';

describe('renderReservationConfirmationEmail', () => {
  const base = {
    clientName: 'Jan Novák',
    businessName: 'Kadeřnictví Květa',
    services: [
      { name: 'Střih', durationMinutes: 45 },
      { name: 'Foukání', durationMinutes: 30 },
    ],
    combinedDurationMinutes: 75,
    combinedPriceCzk: 350,
    reservationDate: '15.07.2024',
    reservationTime: '09:30',
    businessUrl: 'https://horea.cz/kadernictvi-kveta',
  } as const;

  it('sestaví subject s názvem podniku', () => {
    const email = renderReservationConfirmationEmail({ ...base, status: 'pending' });
    expect(email.subject).toBe('Vaše rezervace — Kadeřnictví Květa');
  });

  it('u stavu pending uvede čekání na schválení a shrnutí rezervace', () => {
    const email = renderReservationConfirmationEmail({ ...base, status: 'pending' });
    expect(email.text).toContain('Dobrý den, Jan Novák,');
    expect(email.text).toContain('Rezervace čeká na schválení podnikem.');
    expect(email.text).toContain('Střih');
    expect(email.text).toContain('45 min');
    expect(email.text).toContain('350 Kč');
    expect(email.text).toContain('15.07.2024');
    expect(email.text).toContain('09:30');
    expect(email.text).toContain('na vyžádání podniku');
  });

  it('vypíše všechny služby v pořadí a kombinované součty', () => {
    const email = renderReservationConfirmationEmail({ ...base, status: 'approved' });
    expect(email.text).toContain('- Střih (45 min)');
    expect(email.text).toContain('- Foukání (30 min)');
    expect(email.text).toContain('Celková délka: 75 min');
    expect(email.text).toContain('celková cena: 350 Kč');
    expect(email.html).toContain('<li>Střih (45 min)</li>');
    expect(email.html).toContain('<li>Foukání (30 min)</li>');
  });

  it('neuvede kombinovanou cenu, pokud je 0 Kč', () => {
    const email = renderReservationConfirmationEmail({
      ...base,
      combinedPriceCzk: 0,
      status: 'approved',
    });
    expect(email.text).toContain('Celková délka: 75 min.');
    expect(email.text).not.toContain('celková cena');
    expect(email.html).not.toContain('celková cena');
  });

  it('u stavu approved uvede potvrzení', () => {
    const email = renderReservationConfirmationEmail({ ...base, status: 'approved' });
    expect(email.text).toContain('Rezervace je potvrzena.');
    expect(email.html).toContain('Rezervace je potvrzena.');
  });

  it('do patičky zahrne kontakt na podnik jen pokud je vyplněn', () => {
    const withContact = renderReservationConfirmationEmail({
      ...base,
      status: 'approved',
      businessPhone: '+420704344177',
      businessEmail: 'info@kveta.cz',
    });
    expect(withContact.text).toContain('Telefon: +420704344177');
    expect(withContact.text).toContain('E-mail: info@kveta.cz');

    const withoutContact = renderReservationConfirmationEmail({ ...base, status: 'approved' });
    expect(withoutContact.text).not.toContain('Kontakt na podnik');
  });

  it('escapuje uživatelská pole v HTML variantě', () => {
    const email = renderReservationConfirmationEmail({
      ...base,
      clientName: '<script>alert(1)</script>',
      status: 'pending',
    });
    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});

describe('renderReservationNotificationEmail', () => {
  const base = {
    businessName: 'Kadeřnictví Květa',
    services: [
      { name: 'Barvení', durationMinutes: 90 },
      { name: 'Střih', durationMinutes: 30 },
    ],
    combinedDurationMinutes: 120,
    combinedPriceCzk: 1200,
    reservationDate: '15.07.2024',
    reservationTime: '14:00',
    clientName: 'Jan Novák',
    clientPhone: '+420704344177',
    clientEmail: 'jan@example.cz',
    dashboardUrl: 'https://horea.cz/dashboard/reservations',
  } as const;

  it('sestaví subject se spojenými službami, datem a časem', () => {
    const email = renderReservationNotificationEmail({ ...base, status: 'pending' });
    expect(email.subject).toBe('Nová rezervace — Barvení + Střih, 15.07.2024 14:00');
  });

  it('vypíše všechny služby v pořadí a kombinované součty', () => {
    const email = renderReservationNotificationEmail({ ...base, status: 'approved' });
    expect(email.text).toContain('- Barvení (90 min)');
    expect(email.text).toContain('- Střih (30 min)');
    expect(email.text).toContain('Celková délka: 120 min');
    expect(email.html).toContain('<li>Barvení (90 min)</li>');
    expect(email.html).toContain('<li>Střih (30 min)</li>');
  });

  it('obsahuje kontaktní údaje klienta a odkaz na dashboard', () => {
    const email = renderReservationNotificationEmail({ ...base, status: 'approved' });
    expect(email.text).toContain('Jméno: Jan Novák');
    expect(email.text).toContain('Telefon: +420704344177');
    expect(email.text).toContain('E-mail: jan@example.cz');
    // Oddělovač tisíců závisí na ICU (může být i nezlomitelná mezera) — tolerujeme.
    expect(email.text).toMatch(/1\s200\sKč/u);
    expect(email.text).toContain('potvrzeno');
    expect(email.text).toContain('https://horea.cz/dashboard/reservations');
  });

  it('zahrne poznámku jen pokud je vyplněna', () => {
    const withNote = renderReservationNotificationEmail({
      ...base,
      status: 'pending',
      clientNote: 'Prosím o tmavší odstín.',
    });
    expect(withNote.text).toContain('Poznámka klienta: Prosím o tmavší odstín.');

    const withoutNote = renderReservationNotificationEmail({ ...base, status: 'pending' });
    expect(withoutNote.text).not.toContain('Poznámka klienta');
  });

  it('escapuje poznámku a jméno klienta v HTML variantě', () => {
    const email = renderReservationNotificationEmail({
      ...base,
      status: 'pending',
      clientNote: '<img src=x onerror=alert(1)>',
    });
    expect(email.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(email.html).toContain('&lt;img');
  });
});

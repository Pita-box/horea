import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { renderReservationConfirmationEmail } from '../reservation-confirmation';
import { renderReservationNotificationEmail } from '../reservation-notification';

// Feature: multi-service-reservations, Property 15: Transakční e-mail obsahuje
// všechny služby a součty — vyrenderovaný Reservation_Confirmation_Email i
// Reservation_Notification_Email obsahují názvy všech služeb v uloženém pořadí,
// Combined_Duration a Combined_Price.
// Validates: Requirements 16.1, 16.2

type ServiceLine = { name: string; durationMinutes: number };

/** Naformátuje cenu shodně jako šablony (cs-CZ, bez desetinných míst) — kvůli oddělovači tisíců. */
function formatPriceCzk(value: number): string {
  return `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(value)} Kč`;
}

// Distinguishable, neprázdné názvy služeb z bezpečné abecedy (jen písmena), aby
// se v textové variantě nemíchaly s HTML-escapováním ani s formátem řádků.
const safeChar = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
);
const nameArb = fc.array(safeChar, { minLength: 1, maxLength: 12 }).map((chars) => chars.join(''));

// 1..10 služeb s unikátními názvy (uchované pořadí = pořadí v poli).
const servicesArb: fc.Arbitrary<ServiceLine[]> = fc
  .uniqueArray(nameArb, { minLength: 1, maxLength: 10 })
  .chain((names) =>
    fc.tuple(
      ...names.map((name) =>
        fc.integer({ min: 0, max: 600 }).map((durationMinutes) => ({ name, durationMinutes })),
      ),
    ),
  );

/**
 * Ověří, že textová varianta e-mailu obsahuje všechny služby v uloženém pořadí,
 * Combined_Duration a (je-li > 0) Combined_Price.
 */
function assertEmailTextContainsServices(
  text: string,
  services: ServiceLine[],
  combinedDurationMinutes: number,
  combinedPriceCzk: number,
): void {
  // Každý název služby se v e-mailu objeví.
  for (const service of services) {
    expect(text).toContain(service.name);
  }

  // Pořadí je zachované — indexOf vyrenderovaných řádků je striktně rostoucí.
  let previousIndex = -1;
  for (const service of services) {
    const line = `- ${service.name} (${service.durationMinutes} min)`;
    const index = text.indexOf(line);
    expect(index).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }

  // Combined_Duration se objeví.
  expect(text).toContain(`${combinedDurationMinutes} min`);

  // Combined_Price se objeví, pokud je > 0 Kč (při 0 Kč je skryta).
  if (combinedPriceCzk > 0) {
    expect(text).toContain(formatPriceCzk(combinedPriceCzk));
  }
}

describe('Property 15: Transakční e-mail obsahuje všechny služby a součty', () => {
  it('confirmation i notification e-mail obsahují všechny služby v pořadí + součty', () => {
    fc.assert(
      fc.property(
        servicesArb,
        fc.integer({ min: 0, max: 6000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.constantFrom<'pending' | 'approved'>('pending', 'approved'),
        (services, combinedDurationMinutes, combinedPriceCzk, status) => {
          const confirmation = renderReservationConfirmationEmail({
            clientName: 'Jan Novák',
            businessName: 'Podnik',
            services,
            combinedDurationMinutes,
            combinedPriceCzk,
            reservationDate: '15.07.2024',
            reservationTime: '09:30',
            status,
            businessUrl: 'https://horea.cz/podnik',
          });

          const notification = renderReservationNotificationEmail({
            businessName: 'Podnik',
            services,
            combinedDurationMinutes,
            combinedPriceCzk,
            reservationDate: '15.07.2024',
            reservationTime: '09:30',
            status,
            clientName: 'Jan Novák',
            clientPhone: '+420704344177',
            clientEmail: 'jan@example.cz',
            dashboardUrl: 'https://horea.cz/dashboard/reservations',
          });

          assertEmailTextContainsServices(
            confirmation.text,
            services,
            combinedDurationMinutes,
            combinedPriceCzk,
          );
          assertEmailTextContainsServices(
            notification.text,
            services,
            combinedDurationMinutes,
            combinedPriceCzk,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
